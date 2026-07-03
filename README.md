# SmartPark · Gemelo Digital sobre Azure Digital Twins

> Paquete listo para ejecutar. **No necesitas aprender Azure Digital Twins**: sigue
> los pasos en orden, copiando y pegando. Cada script te dice qué hacer después.
> Por **Apex Twin** — núcleo del producto SmartPark.

Esto construye el **gemelo digital 3D** del estacionamiento: la ontología de
dominio, el grafo de 56 twins, un **modelo 3D segmentado** que se mapea solo en
3D Scenes Studio, un **simulador IoT** que lo anima en tiempo real, y la **capa de
integración** lista para que la Web (Angular), la app (PowerApps) y el Web Service
(ASP.NET) la consuman.

---

## TL;DR — ejecutar de principio a fin

```powershell
# 0) Una sola vez: copia la config y complétala
copy .env.example .env
notepad .env          # pon AZURE_SUBSCRIPTION_ID y un STORAGE_ACCOUNT único

# 1) Login de Azure (en tu terminal; en Claude Code: ! az login)
az login

# 2) Prerrequisitos (CLI, extensión, Node, npm install)
./scripts/00-prerequisites.ps1

# 3) Provisiona TODO en Azure (ADT + Storage + roles + CORS)
./scripts/01-provision-azure.ps1

# 4) Sube la ontología DTDL (9 modelos)
./scripts/02-upload-models.ps1

# 5) Siembra el grafo (56 twins + 55 relaciones)
npm run seed

# 6) Sube el modelo 3D + la escena ya mapeada y coloreada
./scripts/04-upload-3d-model.ps1
#    -> imprime la URL de 3D Scenes Studio. Ábrela: la escena ya está lista.

# 7) Anima el gemelo en vivo (deja corriendo)
npm run simulate
```

Verifica cuando quieras: `npm run verify`.
Para no gastar crédito al terminar: `./scripts/teardown.ps1`.

---

## ¿Por qué este diseño te facilita la vida?

| Decisión | Beneficio |
|---|---|
| **Una sola fuente de verdad** (`config/layout.json`) | El modelo 3D, el grafo y la escena salen sincronizados. Cambias el layout en un sitio. |
| **Mallas del `.glb` nombradas == `dtId` del twin** | En 3D Scenes Studio el mapeo elemento→twin es automático. Cero clics manuales por plaza. |
| **`.glb` generado por código (sin dependencias)** | No descargas modelos pesados ni peleas con Blender. `npm run gen:glb` y listo. Cada plaza es coloreable. |
| **Simulador con JSON Patch** | Igual que actuarían sensores reales: mañana enchufas hardware sin tocar el resto. |
| **Anti-Corruption Layer en C#** | Angular/PowerApps consumen REST/SignalR; nadie depende del SDK de Azure salvo una clase. |
| **`DefaultAzureCredential`** | Sin secretos en código: usa tu `az login` en local y Managed Identity en la nube. |

---

## Estructura

```
azureDigitalTwin/
├── README.md                      ← este manual
├── .env.example                   ← configuración (copia a .env)
├── package.json                   ← scripts npm (gen, seed, simulate, verify)
├── config/
│   └── layout.json                ← FUENTE DE VERDAD (niveles, zonas, plazas, sensores)
├── ontology/                      ← 9 modelos DTDL v3 (el dominio del gemelo)
│   ├── ParkingLot/Level/Zone/Space.json
│   ├── SmokeDetector / AccessPoint / Ramp.json
│   └── LightingZone / LuminositySensor.json
├── lib/
│   ├── layout-builder.mjs         ← deriva twins+posiciones+relaciones del layout
│   └── adt-client.mjs             ← cliente ADT (DefaultAzureCredential)
├── model3d/
│   ├── generate-garage-glb.mjs    ← genera el .glb segmentado
│   ├── parking-garage.glb         ← modelo 3D (generado, versionado)
│   ├── generate-scenes-config.mjs ← genera la config de la escena
│   └── 3DScenesConfiguration.json ← escena mapeada + coloreada (generada)
├── scripts/
│   ├── config.ps1                 ← carga .env
│   ├── 00-prerequisites.ps1
│   ├── 01-provision-azure.ps1     ← crea infra + roles + CORS
│   ├── 02-upload-models.ps1       ← sube ontología
│   ├── 03-seed-graph.mjs          ← siembra/borra el grafo
│   ├── 04-upload-3d-model.ps1     ← sube .glb + escena
│   ├── verify-graph.mjs
│   ├── energy-advisor.mjs         ← zonas de baja ocupación desde el grafo (energía)
│   └── teardown.ps1
├── simulator/
│   └── index.mjs                  ← simulador IoT (ocupación, humo, flujo, energía)
└── integration/
    ├── README.md                  ← cómo lo consumen Angular / PowerApps / Web Service
    ├── queries.md                 ← recetario de consultas ADT
    └── dotnet/                     ← Anti-Corruption Layer en C# (ASP.NET Core 8)
        ├── IDigitalTwinGateway.cs
        ├── AzureDigitalTwinsGateway.cs
        ├── SmartParkTwinDtos.cs
        ├── SmartParkControllers.cs
        └── Program.snippet.cs
```

---

## El modelo 3D (lo que pediste investigar)

**Decisión:** en vez de descargar un modelo de Sketchfab/CGTrader (cuyas mallas no
están nombradas por plaza y obligan a mapear a mano decenas de elementos en 3D
Scenes Studio), **generamos un `.glb` propio y segmentado** con un script sin
dependencias. Cada plaza, zona, nivel y sensor es una malla cuyo nombre coincide
con el `dtId` del twin → 3D Scenes Studio los empareja automáticamente.

3D Scenes Studio requiere exactamente esto y lo cumplimos:
- formato **glTF/GLB** ✔ (lo genera `generate-garage-glb.mjs`, validado)
- archivo subido a un **contenedor de blobs** ✔ (`04-upload-3d-model.ps1`)
- **CORS** para `explorer.digitaltwins.azure.net` ✔ (lo configura `01-provision-azure.ps1`)
- un **archivo de configuración** de escena ✔ (lo generamos ya mapeado y coloreado)

> ¿Quieres un render más bonito/realista después? Reemplaza `parking-garage.glb`
> por un modelo descargado, pero **renombra sus mallas** a los `dtId` (ej.
> `SPACE-L1-A01`) para conservar el mapeo automático. El resto del pipeline no cambia.

**Capas de la escena** (conmutables en el visor del operador):
- **Operaciones**: plazas coloreadas por estado (verde=libre, rojo=ocupada, ámbar=reservada) y zonas por % de ocupación.
- **Seguridad**: detectores en rojo + badge cuando hay humo, con gauge de ppm.
- **Energía**: zonas de iluminación coloreadas por nivel de luz actual.

---

## Requisitos

- **Windows + PowerShell** (los scripts `.ps1`).
- **Azure CLI** ≥ 2.50 y una **suscripción** (sirve _Azure for Students_, USD 100, sin tarjeta).
- **Node.js** ≥ 18.
- Permisos para asignarte roles RBAC en tu suscripción (o pídelo a quien administre).

## Costos y crédito

ADT se cobra por mensaje/operación y Storage es mínimo para este tamaño. Para un
proyecto académico el consumo es muy bajo; aun así, ejecuta `./scripts/teardown.ps1`
cuando termines para borrar todo el resource group.

## Problemas comunes

| Síntoma | Causa / solución |
|---|---|
| `AuthorizationFailed` al sembrar | El rol _Data Owner_ tarda ~1-2 min en propagar. Reintenta `npm run seed`. |
| 3D Scenes Studio no carga el modelo | Falta CORS o rol _Storage Blob Data Reader_. Re-ejecuta `01-provision-azure.ps1`. |
| `ADT_HOST_NAME` vacío | Corre `01-provision-azure.ps1` (lo escribe en `.env`). |
| El POST de humo falla en el simulador | El Web Service no está corriendo. El twin igual se actualiza; el POST es best-effort. |
| `STORAGE_ACCOUNT` rechazado | Debe ser único global, 3-24 chars, solo minúsculas/números. |

---

## Comandos npm

| Comando | Qué hace |
|---|---|
| `npm run gen:glb` | Regenera el modelo 3D `.glb` |
| `npm run gen:scene` | Regenera la config de escena 3D |
| `npm run gen:all` | Ambos |
| `npm run seed` | Crea/actualiza el grafo (idempotente) |
| `npm run seed:delete` | Borra todos los twins del grafo |
| `npm run simulate` | Arranca el simulador IoT |
| `npm run verify` | Cuenta twins / ocupación / alertas |
| `npm run advise` | Lista zonas de baja ocupación + recomendación de atenuación (energía) |

---

## Sprint 2 — Flujo vehicular y tendencias de ocupación

El simulador dejó de **voltear plazas al azar**: ahora la ocupación se deriva de un
**modelo de flujo vehicular por zona**. En cada intervalo, por zona, se calculan
**entradas** y **salidas** (conteo tipo Poisson) que empujan la ocupación hacia el
objetivo horario; con esas entradas/salidas se ocupan/liberan plazas concretas y se
alimentan los **puntos de acceso** (Entry/Exit) y las **rampas** con tráfico real.

Sobre esa serie se calcula una **tendencia de ocupación** por zona (media móvil en
una ventana configurable) que la **eficiencia energética** usa como base estable —en
vez de un valor instantáneo ruidoso— para recomendar la atenuación de la iluminación.

**Nuevas propiedades de `ParkingZone`** (DTDL v3, sembradas por defecto):

| Propiedad | Significado |
|---|---|
| `entriesLastInterval` / `exitsLastInterval` | Vehículos que entraron / salieron en el último intervalo |
| `netFlow` | `entries - exits` (positivo = llenándose, negativo = vaciándose) |
| `avgOccupancyRate` | Media móvil de `occupancyRate` sobre la ventana de tendencia |
| `occupancyTrend` | `Rising` / `Stable` / `Falling` |
| `lowOccupancy` | Baja ocupación **sostenida** durante toda la ventana → dispara atenuación |
| `vehicleFlow` (Telemetry) | Flujo neto de vehículos emitido por intervalo |

**Parámetros nuevos del simulador** (`.env`):

| Variable | Por defecto | Qué controla |
|---|---|---|
| `SIM_FLOW_INTENSITY` | `1.2` | Intensidad base del flujo (entradas/salidas esperadas por intervalo) |
| `SIM_TREND_WINDOW` | `6` | Nº de muestras de la media móvil de la tendencia |
| `SIM_LOW_OCCUPANCY` | `0.25` | Umbral de baja ocupación sostenida (0..1) |

> `SIM_OCCUPANCY_CHURN` quedó obsoleto (reemplazado por el modelo de flujo) y ya no se usa.

**Consumo desde el backend:** el endpoint `/api/v1/energy/recommendations` sigue leyendo
las `LightingZone`, cuyo `recommendedLevel` ahora refleja la tendencia y la bandera
`lowOccupancy`. Para inspeccionarlo desde consola sin backend: `npm run advise`
(deriva las zonas de baja ocupación directamente del grafo). Ver también las nuevas
consultas de flujo y tendencia en `integration/queries.md`.
