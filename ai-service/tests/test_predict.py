"""
Tests de la predicción de demanda (routers/predict.py).

Usan unittest, que viene con Python: no hace falta instalar nada.
Se ejecutan desde la carpeta ai-service con el venv activado:

    python -m unittest discover -s tests -t . -v
"""
import unittest

from routers.predict import PredictRequest, predict_demand

ZONE = {"id": 19, "name": "CENTRO SUR", "center_lat": -32.417, "center_lng": -63.244}


def day(dow, duration, completion=100.0, executions=12, incidents=2):
    return {
        "day_of_week": dow, "shift": "night", "avg_completion": completion,
        "executions": executions, "incidents": incidents, "avg_duration_min": duration,
    }


def run(history):
    return predict_demand(PredictRequest(zone=ZONE, historical_by_day=history, period_days=90))


class IndiceDeCarga(unittest.TestCase):
    # Datos reales del histórico de Centro Sur (los valores de MySQL
    # llegan como texto y Pydantic los convierte a número)
    HISTORY = [
        day(1, "469.85", completion="92.31", executions=13, incidents=5),
        day(2, "350.46"), day(3, "321.77"), day(4, "312.62", completion="92.31"),
        day(5, "333.67"), day(6, "330.77", incidents=5),
    ]

    def test_detecta_el_domingo_como_dia_de_mayor_carga(self):
        result = run(self.HISTORY)
        self.assertEqual(result["worst_day"]["day_name"], "Domingo")
        self.assertEqual(result["worst_day"]["demand_level"], "muy alta")
        self.assertGreaterEqual(result["worst_day"]["load_index"], 1.25)

    def test_los_dias_tipicos_quedan_en_normal(self):
        levels = {p["day_name"]: p["demand_level"] for p in run(self.HISTORY)["predictions"]}
        for name in ("Lunes", "Martes", "Miércoles", "Jueves", "Viernes"):
            self.assertEqual(levels[name], "normal", name)

    def test_la_duracion_tipica_es_la_mediana(self):
        # mediana de 312.6, 321.8, 330.8, 333.7, 350.5, 469.8 → 332.2
        self.assertEqual(run(self.HISTORY)["typical_duration_min"], 332)

    def test_avisa_cobertura_baja_e_incidentes_altos(self):
        domingo = run(self.HISTORY)["worst_day"]
        self.assertTrue(any("sin recolectar" in n for n in domingo["notes"]))
        self.assertTrue(any("incidentes" in n for n in domingo["notes"]))

    def test_dia_liviano_sugiere_sumar_barrios(self):
        result = run([day(2, 300), day(3, 300), day(4, 200)])
        livianos = [p for p in result["predictions"] if p["demand_level"] == "baja"]
        self.assertEqual(len(livianos), 1)
        self.assertIn("sumar barrios", livianos[0]["recommendation"])


class CasosLimite(unittest.TestCase):
    def test_sin_historial(self):
        result = run([])
        self.assertEqual(result["data_quality"], "insufficient")
        self.assertEqual(result["predictions"], [])

    def test_sin_duraciones_usa_la_cobertura(self):
        history = [day(2, None, completion=100), day(3, None, completion=80)]
        result = run(history)
        self.assertEqual(result["worst_day"]["avg_completion"], 80)
        self.assertEqual(result["predictions"][0]["demand_level"], "sin datos")

    def test_pocos_datos_marca_calidad_limitada(self):
        self.assertEqual(run([day(2, 300, executions=3)])["data_quality"], "limited")


if __name__ == "__main__":
    unittest.main()
