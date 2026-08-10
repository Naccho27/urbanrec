from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
import math

router = APIRouter()

class ZoneData(BaseModel):
    name: str
    center_lat: float
    center_lng: float
    geojson: dict

class RouteData(BaseModel):
    id: int
    name: str
    geojson: dict
    distance_km: Optional[float] = None
    duration_min: Optional[int] = None

class Historical(BaseModel):
    avg_completion: Optional[float] = None
    avg_duration: Optional[float] = None
    avg_distance: Optional[float] = None
    total_executions: Optional[int] = 0

class OptimizeRequest(BaseModel):
    route: RouteData
    zone: ZoneData
    historical: Historical

def haversine(lat1, lng1, lat2, lng2):
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (math.sin(dlat/2)**2 +
         math.cos(math.radians(lat1)) *
         math.cos(math.radians(lat2)) *
         math.sin(dlng/2)**2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

@router.post("")
def optimize_route(data: OptimizeRequest):
    """
    Analiza un recorrido y sugiere mejoras basadas en el historial
    y la geometría del trazado actual.
    
    En producción usaría OR-Tools VRP para optimización completa.
    Esta implementación hace análisis heurístico sobre los datos disponibles.
    """
    coords = data.route.geojson.get("coordinates", [])
    
    if not coords or len(coords) < 2:
        raise HTTPException(status_code=400, detail="El recorrido no tiene suficientes puntos")

    # Calcular distancia real del trazado actual
    current_distance = 0
    for i in range(len(coords) - 1):
        current_distance += haversine(
            coords[i][1], coords[i][0],
            coords[i+1][1], coords[i+1][0]
        )

    # Análisis de eficiencia basado en historial
    avg_completion = data.historical.avg_completion or 0
    avg_duration   = data.historical.avg_duration   or data.route.duration_min or 60
    
    # Calcular distancia al centroide de la zona
    first_point = coords[0]
    last_point  = coords[-1]
    
    dist_start_to_zone = haversine(
        first_point[1], first_point[0],
        data.zone.center_lat, data.zone.center_lng
    )
    dist_end_to_zone = haversine(
        last_point[1], last_point[0],
        data.zone.center_lat, data.zone.center_lng
    )

    # Sugerencias basadas en el análisis
    suggestions = []
    estimated_savings_km  = 0
    estimated_savings_min = 0

    if avg_completion < 80:
        suggestions.append(
            "El recorrido tiene una completitud promedio baja. "
            "Se recomienda revisar si todas las zonas son accesibles en el tiempo asignado."
        )

    if current_distance > (data.route.distance_km or current_distance) * 1.2:
        savings = round(current_distance * 0.15, 2)
        estimated_savings_km = savings
        estimated_savings_min = round(savings / 25 * 60)
        suggestions.append(
            f"El trazado actual podría optimizarse eliminando tramos redundantes. "
            f"Ahorro estimado: {savings:.1f} km ({estimated_savings_min} min)."
        )

    if dist_start_to_zone > 2:
        suggestions.append(
            f"El punto de inicio del recorrido está a {dist_start_to_zone:.1f} km del centro de la zona. "
            f"Considerar iniciar más cerca del centro para mayor cobertura."
        )

    if not suggestions:
        suggestions.append(
            "El recorrido actual muestra buena eficiencia. "
            "No se detectaron oportunidades de mejora significativas."
        )

    summary = " | ".join(suggestions)

    return {
        "route_id":             data.route.id,
        "current_distance_km":  round(current_distance, 2),
        "estimated_savings_km": estimated_savings_km,
        "estimated_savings_min": estimated_savings_min,
        "avg_completion_pct":   avg_completion,
        "suggestions":          suggestions,
        "summary":              summary,
        "analysis_points":      len(coords)
    }