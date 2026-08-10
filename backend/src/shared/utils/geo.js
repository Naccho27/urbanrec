'use strict'

const axios = require('axios')

// Calcula la distancia en metros entre dos puntos GPS
// usando la fórmula de Haversine.
// Se usa en tracking.service.js para detectar proximidad
// entre el camión y el centroide de una zona.
//
// Parámetros:
// lat1, lng1 → coordenadas del punto A (camión)
// lat2, lng2 → coordenadas del punto B (centroide de zona)
// Retorna: distancia en metros

const haversineDistance = (lat1, lng1, lat2, lng2) => {
  const R    = 6371000                    // radio de la Tierra en metros
  const toRad = deg => deg * Math.PI / 180

  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
    Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) ** 2

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return R * c   // distancia en metros
}

// Convierte una dirección en texto a coordenadas GPS
// usando Nominatim (OpenStreetMap).
// Se usa en zones.service.js para búsqueda por dirección.
//
// Parámetros:
// address → string con la dirección a geocodificar
// Retorna: { lat, lng, displayName } o null si no encuentra

const geocodeAddress = async (address) => {
  try {
    const response = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: {
        q:              `${address}, Villa María, Córdoba, Argentina`,
        format:         'json',
        limit:          1,
        addressdetails: 1
      },
      headers: {
        // Nominatim requiere un User-Agent identificatorio
        'User-Agent': 'SistemaResiduosVillaMaria/1.0'
      }
    })

    if (!response.data || response.data.length === 0) return null

    const result = response.data[0]
    return {
      lat:         parseFloat(result.lat),
      lng:         parseFloat(result.lon),
      displayName: result.display_name
    }
  } catch (err) {
    return null
  }
}

// Calcula el centroide de un polígono GeoJSON.
// Se usa en zones.service.js al crear una zona
// para guardar center_lat y center_lng.
//
// Parámetros:
// geojson → objeto GeoJSON con type: 'Polygon'
// Retorna: { lat, lng }

const calculateCentroid = (geojson) => {
  const coords = geojson.coordinates[0]  // primer anillo del polígono

  const lat = coords.reduce((sum, c) => sum + c[1], 0) / coords.length
  const lng = coords.reduce((sum, c) => sum + c[0], 0) / coords.length

  return { lat, lng }
}

module.exports = {
  haversineDistance,
  geocodeAddress,
  calculateCentroid
}