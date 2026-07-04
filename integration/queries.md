# Recetario de consultas — Azure Digital Twins Query Language

Estas consultas alimentan directamente los paneles del dashboard del operador.
Pruébalas en **Azure Digital Twins Explorer** (botón _Query_) o desde el SDK.

> Prefijo de modelos: `dtmi:com:apextwin:smartpark:<Interface>;1`

### Ocupación total del lote
```sql
SELECT * FROM digitaltwins WHERE $dtId = 'LOT-JOCKEY'
```

### Ocupación por zona (mapa / tabla por nivel)
```sql
SELECT * FROM digitaltwins T
WHERE IS_OF_MODEL(T, 'dtmi:com:apextwin:smartpark:ParkingZone;1')
```

### Plazas libres de una zona (para el conductor)
```sql
SELECT space FROM digitaltwins zone
JOIN space RELATED zone.hasSpace
WHERE zone.$dtId = 'ZONE-L1-A' AND space.occupancyState = 'Free'
```

### Alertas de humo activas (panel de seguridad)
```sql
SELECT * FROM digitaltwins T
WHERE IS_OF_MODEL(T, 'dtmi:com:apextwin:smartpark:SmokeDetector;1')
  AND T.smokeDetected = true
```

### Conductores potencialmente afectados por un incidente (plazas ocupadas en la zona del detector)
```sql
SELECT space FROM digitaltwins level
JOIN det  RELATED level.hasSmokeDetector
JOIN zone RELATED level.hasZone
JOIN space RELATED zone.hasSpace
WHERE det.$dtId = 'SMOKE-L1-A' AND space.occupancyState = 'Occupied'
```

### Zonas con recomendación de atenuación (eficiencia energética)
```sql
SELECT * FROM digitaltwins T
WHERE IS_OF_MODEL(T, 'dtmi:com:apextwin:smartpark:LightingZone;1')
  AND T.status = 'DimmingRecommended'
```

### Flujo vehicular: rampas congestionadas
```sql
SELECT * FROM digitaltwins T
WHERE IS_OF_MODEL(T, 'dtmi:com:apextwin:smartpark:Ramp;1')
  AND T.flowStatus IN ['Moderate', 'Severe']
```

### Flujo vehicular por zona (entradas/salidas del ultimo intervalo)
```sql
SELECT T.$dtId, T.code, T.entriesLastInterval, T.exitsLastInterval, T.netFlow
FROM digitaltwins T
WHERE IS_OF_MODEL(T, 'dtmi:com:apextwin:smartpark:ParkingZone;1')
```

### Zonas de baja ocupacion sostenida (base de la recomendacion energetica)
```sql
SELECT T.$dtId, T.code, T.avgOccupancyRate, T.occupancyTrend
FROM digitaltwins T
WHERE IS_OF_MODEL(T, 'dtmi:com:apextwin:smartpark:ParkingZone;1')
  AND T.lowOccupancy = true
```

### Tendencia de ocupacion por zona (subiendo / estable / bajando)
```sql
SELECT * FROM digitaltwins T
WHERE IS_OF_MODEL(T, 'dtmi:com:apextwin:smartpark:ParkingZone;1')
  AND T.occupancyTrend = 'Falling'
```

### Recorrer todo el grafo desde el lote (validación de relaciones)
```sql
SELECT lot, level, zone, space
FROM digitaltwins lot
JOIN level RELATED lot.hasLevel
JOIN zone  RELATED level.hasZone
JOIN space RELATED zone.hasSpace
WHERE lot.$dtId = 'LOT-JOCKEY'
```
