from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional, List
import statistics

router = APIRouter()

DAY_NAMES = {
    1: "Domingo", 2: "Lunes", 3: "Martes", 4: "Miércoles",
    5: "Jueves",  6: "Viernes", 7: "Sábado"
}

SHIFT_NAMES = {
    "morning":   "mañana",
    "afternoon": "tarde",
    "night":     "noche"
}

class ZoneInfo(BaseModel):
    id: int
    name: str
    center_lat: float
    center_lng: float

class DayRecord(BaseModel):
    day_of_week: int
    shift: Optional[str] = None
    avg_completion: Optional[float] = None
    executions: Optional[int] = 0
    incidents: Optional[int] = 0

class PredictRequest(BaseModel):
    zone: ZoneInfo
    historical_by_day: List[DayRecord]
    period_days: int = 90

@router.post("")
def predict_demand(data: PredictRequest):
    """
    Analiza patrones históricos de recolección por zona y predice
    variaciones de demanda por día de la semana y turno.
    
    En producción usaría scikit-learn con más datos históricos.
    Esta implementación hace análisis estadístico descriptivo.
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

    # Análisis por día
    predictions = []
    all_completions = []

    for record in data.historical_by_day:
        completion = record.avg_completion or 0
        all_completions.append(completion)

        day_name   = DAY_NAMES.get(record.day_of_week, f"Día {record.day_of_week}")
        shift_name = SHIFT_NAMES.get(record.shift, record.shift or "sin turno")

        # Clasificar nivel de demanda
        if completion >= 90:
            demand_level = "alta"
            recommendation = "Mantener frecuencia actual"
        elif completion >= 70:
            demand_level = "media"
            recommendation = "Frecuencia actual adecuada"
        elif completion >= 50:
            demand_level = "baja"
            recommendation = "Considerar reducir frecuencia o reasignar recursos"
        else:
            demand_level = "muy baja"
            recommendation = "Revisar si la zona requiere servicio en este día/turno"

        incident_rate = (record.incidents or 0) / max(record.executions or 1, 1) * 100

        predictions.append({
            "day_of_week":      record.day_of_week,
            "day_name":         day_name,
            "shift":            record.shift,
            "shift_name":       shift_name,
            "avg_completion":   round(completion, 2),
            "executions":       record.executions,
            "incident_rate_pct": round(incident_rate, 2),
            "demand_level":     demand_level,
            "recommendation":   recommendation
        })

    # Estadísticas globales
    avg_global = round(statistics.mean(all_completions), 2) if all_completions else 0

    # Mejor y peor día
    best  = max(predictions, key=lambda x: x["avg_completion"])
    worst = min(predictions, key=lambda x: x["avg_completion"])

    summary = (
        f"Análisis de {data.period_days} días para zona {data.zone.name}. "
        f"Completitud promedio: {avg_global}%. "
        f"Mejor rendimiento: {best['day_name']} turno {best['shift_name']} ({best['avg_completion']}%). "
        f"Menor rendimiento: {worst['day_name']} turno {worst['shift_name']} ({worst['avg_completion']}%)."
    )

    return {
        "zone_id":          data.zone.id,
        "zone_name":        data.zone.name,
        "period_days":      data.period_days,
        "avg_completion":   avg_global,
        "predictions":      predictions,
        "best_day":         best,
        "worst_day":        worst,
        "summary":          summary,
        "data_quality":     "sufficient" if len(data.historical_by_day) >= 5 else "limited"
    }