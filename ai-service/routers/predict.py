from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional, List
import statistics

router = APIRouter()

# Numeración de MySQL DAYOFWEEK(): 1 = domingo … 7 = sábado
DAY_NAMES = {
    1: "Domingo", 2: "Lunes", 3: "Martes", 4: "Miércoles",
    5: "Jueves",  6: "Viernes", 7: "Sábado"
}

SHIFT_NAMES = {
    "morning":   "mañana",
    "afternoon": "tarde",
    "night":     "noche"
}

# ── Umbrales del índice de carga ──────────────────────────
# índice = duración promedio de ese día / mediana de duración del barrio
#   1.00 → un día típico
#   1.25 → el camión tarda 25% más que lo habitual
# La duración real es la mejor señal disponible del volumen de residuos:
# con más bolsas, la cuadrilla tarda más en cada cuadra. La completitud,
# en cambio, casi siempre está cerca del 100% y no distingue un día
# liviano de uno cargado (por eso antes todos los días daban "alta").
LOAD_VERY_HIGH = 1.25
LOAD_HIGH      = 1.10
LOAD_LOW       = 0.90

# Debajo de esta cobertura el barrio quedó sin servicio demasiadas veces
COVERAGE_WARNING = 95.0
# Incidentes cada 100 salidas a partir de los cuales conviene revisar causas
INCIDENT_WARNING = 30.0

class ZoneInfo(BaseModel):
    id: int
    name: str
    center_lat: float
    center_lng: float

class DayRecord(BaseModel):
    day_of_week: int
    shift: Optional[str] = None
    avg_completion: Optional[float] = None    # % de salidas en que se recolectó el barrio
    executions: Optional[int] = 0
    incidents: Optional[int] = 0
    avg_duration_min: Optional[float] = None  # duración real promedio del recorrido

class PredictRequest(BaseModel):
    zone: ZoneInfo
    historical_by_day: List[DayRecord]
    period_days: int = 90


def classify_load(load_index: Optional[float]):
    """Nivel de demanda y recomendación según el índice de carga."""
    if load_index is None:
        return "sin datos", "Sin duraciones registradas para este día y turno"
    if load_index >= LOAD_VERY_HIGH:
        return "muy alta", "Reforzar el turno: sumar una unidad o cuadrilla, o pasar barrios a otro recorrido"
    if load_index >= LOAD_HIGH:
        return "alta", "Anticipar la salida o prever una segunda descarga"
    if load_index >= LOAD_LOW:
        return "normal", "Mantener frecuencia actual"
    return "baja", "Capacidad disponible: el turno admite sumar barrios"


@router.post("")
def predict_demand(data: PredictRequest):
    """
    Analiza los patrones históricos de recolección de un barrio por día
    de la semana y turno, y estima en qué días la demanda es mayor.

    Es un análisis estadístico descriptivo (índice de carga relativo a
    la mediana del propio barrio), no un modelo entrenado. Un modelo de
    regresión con scikit-learn que prediga la duración de cada salida
    (según día, mes, clima y días desde la última recolección) es el
    paso siguiente, una vez que haya suficiente historial real.
    """
    if not data.historical_by_day:
        return {
            "zone_id":     data.zone.id,
            "zone_name":   data.zone.name,
            "predictions": [],
            "summary":     f"Sin datos históricos suficientes para la zona {data.zone.name}. "
                          f"Se requieren al menos 60 días de operación para generar predicciones.",
            "data_quality": "insufficient"
        }

    # Duración "típica" del barrio: la mediana no se deja arrastrar por
    # un par de días anómalos (una rotura, un temporal), el promedio sí
    durations = [r.avg_duration_min for r in data.historical_by_day if r.avg_duration_min]
    typical_duration = statistics.median(durations) if durations else None

    predictions = []
    for record in data.historical_by_day:
        coverage   = record.avg_completion if record.avg_completion is not None else 0
        day_name   = DAY_NAMES.get(record.day_of_week, f"Día {record.day_of_week}")
        shift_name = SHIFT_NAMES.get(record.shift, record.shift or "sin turno")

        load_index = None
        if record.avg_duration_min and typical_duration:
            load_index = round(record.avg_duration_min / typical_duration, 2)

        demand_level, recommendation = classify_load(load_index)

        incident_rate = (record.incidents or 0) / max(record.executions or 1, 1) * 100

        # Alertas adicionales: no cambian el nivel de demanda, pero
        # explican problemas que la carga sola no muestra
        notes = []
        if coverage < COVERAGE_WARNING:
            notes.append(
                f"El barrio quedó sin recolectar en el {round(100 - coverage, 1)}% de las salidas"
            )
        if incident_rate >= INCIDENT_WARNING:
            notes.append(
                f"{round(incident_rate)} incidentes cada 100 salidas: revisar causas recurrentes"
            )

        predictions.append({
            "day_of_week":       record.day_of_week,
            "day_name":          day_name,
            "shift":             record.shift,
            "shift_name":        shift_name,
            "avg_completion":    round(coverage, 2),
            "avg_duration_min":  round(record.avg_duration_min) if record.avg_duration_min else None,
            "load_index":        load_index,
            "load_vs_typical_pct": round((load_index - 1) * 100) if load_index else None,
            "executions":        record.executions,
            "incident_rate_pct": round(incident_rate, 2),
            "demand_level":      demand_level,
            "recommendation":    recommendation,
            "notes":             notes
        })

    # Estadísticas globales
    completions = [p["avg_completion"] for p in predictions]
    avg_global = round(statistics.mean(completions), 2) if completions else 0

    # Día más cargado y más liviano según el índice de carga.
    # Si no hay duraciones, se usa la cobertura como antes.
    with_load = [p for p in predictions if p["load_index"] is not None]
    if with_load:
        peak  = max(with_load, key=lambda x: x["load_index"])
        light = min(with_load, key=lambda x: x["load_index"])
    else:
        peak  = min(predictions, key=lambda x: x["avg_completion"])
        light = max(predictions, key=lambda x: x["avg_completion"])

    lowest_coverage = min(predictions, key=lambda x: x["avg_completion"])

    summary = f"Análisis de {data.period_days} días para zona {data.zone.name}. "
    if with_load:
        summary += (
            f"Día de mayor carga: {peak['day_name']} turno {peak['shift_name']} "
            f"({peak['avg_duration_min']} min, {peak['load_vs_typical_pct']:+d}% sobre lo habitual; "
            f"demanda {peak['demand_level']}). "
            f"Día más liviano: {light['day_name']} turno {light['shift_name']} "
            f"({light['load_vs_typical_pct']:+d}%). "
        )
    summary += f"Cobertura promedio: {avg_global}%."
    if lowest_coverage["avg_completion"] < COVERAGE_WARNING:
        summary += (
            f" Menor cobertura: {lowest_coverage['day_name']} "
            f"({lowest_coverage['avg_completion']}%)."
        )

    total_executions = sum(r.executions or 0 for r in data.historical_by_day)

    return {
        "zone_id":           data.zone.id,
        "zone_name":         data.zone.name,
        "period_days":       data.period_days,
        "avg_completion":    avg_global,
        "typical_duration_min": round(typical_duration) if typical_duration else None,
        "predictions":       predictions,
        # Se mantienen best_day / worst_day para no romper a quien ya los
        # use: worst_day es ahora el día de mayor carga (el más exigente)
        "best_day":          light,
        "worst_day":         peak,
        "summary":           summary,
        "data_quality":      "sufficient" if len(data.historical_by_day) >= 5 and total_executions >= 20 else "limited"
    }
