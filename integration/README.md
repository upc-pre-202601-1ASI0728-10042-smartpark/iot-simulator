# Integración con las demás aplicaciones

El gemelo digital **nunca se expone directamente** a las apps cliente. Todo pasa por
el Web Service (ASP.NET Core), que contiene el **Anti-Corruption Layer (ACL)** del
contexto _Digital Twin Synchronization_. Así, si Azure cambia su SDK, solo se toca
una clase (`AzureDigitalTwinsGateway`), no las apps.

> **⚠️ Las clases `.cs` de `integration/dotnet/` son material de REFERENCIA / handoff.**
> La implementación **canónica y en producción** del ACL vive en el repositorio
> `web-services` (`SmartPark.Infrastructure/DigitalTwins/AzureDigitalTwinsGateway.cs`),
> donde está endurecida (modo degradado cuando ADT no responde). Estos snippets sirven
> como punto de partida y documentación del contrato; **no** los edites aquí esperando
> que afecten al backend.
>
> La ingesta de humo del simulador se autentica con el header `X-Api-Key`, que debe
> coincidir con `Ingest:ApiKey` del Web Service (ver `.env.example`).

```
                         ┌──────────────────────────┐
  Sensores / Simulador ─▶│  Azure Digital Twins      │◀─── 3D Scenes Studio (visor 3D)
       (JSON Patch)      │  (grafo DTDL, gemelo 3D)  │
                         └─────────────▲────────────┘
                                       │ SDK (solo aquí)
                         ┌─────────────┴────────────┐
                         │  Web Service ASP.NET 8    │
                         │  IDigitalTwinGateway (ACL)│
                         │  REST  +  SignalR hub     │
                         └───▲───────────────▲──────┘
            REST/SignalR     │               │   REST (conector HTTP)
                    ┌────────┴──────┐   ┌─────┴───────────┐
                    │ Web App       │   │ Mobile App      │
                    │ Angular       │   │ PowerApps       │
                    │ (Operador)    │   │ (Conductor)     │
                    └───────────────┘   └─────────────────┘
```

## 1. Web App Angular (Operador)

- **Datos tabulares** (ocupación, zonas, energía): REST a `GET /api/v1/occupancy/*`, `GET /api/v1/energy/recommendations`, `GET /api/v1/alerts/smoke`.
- **Tiempo real** (alertas de humo): SignalR al hub `/hubs/alerts`, evento `smokeAlert`.
- **Visor 3D**: se embebe **3D Scenes Studio** en un `<iframe>` con la URL que imprime `01-provision-azure.ps1`. El visor se sincroniza solo con el grafo (polling cada 5 s) — no requiere código extra del equipo.

```typescript
// Angular: alertas de humo en vivo
import * as signalR from '@microsoft/signalr';
const conn = new signalR.HubConnectionBuilder()
  .withUrl(`${env.api}/hubs/alerts`).withAutomaticReconnect().build();
conn.on('smokeAlert', (a) => this.alertsStore.push(a)); // colorea zona en el 3D
await conn.start();
```

```html
<!-- Visor 3D embebido (URL de 01-provision-azure.ps1) -->
<iframe [src]="scenesStudioUrl | safe" width="100%" height="640" allow="fullscreen"></iframe>
```

## 2. Mobile App PowerApps (Conductor)

PowerApps consume el **mismo Web Service** vía conector HTTP custom (no toca ADT):

- `GET /api/v1/occupancy/zones?level=1` → mapa de disponibilidad por zona.
- `GET /api/v1/occupancy/zones/{zoneId}/spaces` → plazas libres.
- Las **push notifications** de humo las despacha el Web Service vía Firebase Cloud
  Messaging cuando recibe el `POST /api/v1/alerts/smoke` del simulador (la lista
  `affectedOccupiedSpaces` permite segmentar a quién notificar).

## 3. Modo degradado (resiliencia del dashboard)

Coincide con el _wireflow del operador_ del informe: si ADT no responde,
`GET /api/v1/occupancy/summary` devuelve **503** con `{ "degraded": true }`. La Web
App debe entonces mostrar el último estado conocido (cache local) con marca de
tiempo y un banner de advertencia, en lugar de caerse.

## 4. Cómo lo integra el equipo (pasos)

1. En el repo `web-services`, copiar los `.cs` de `integration/dotnet/` al proyecto.
2. `dotnet add package Azure.DigitalTwins.Core` y `Azure.Identity`.
3. Pegar el fragmento de `Program.snippet.cs` en `Program.cs` y poner `Adt:HostName` en `appsettings.json`.
4. En Azure App Service: activar Managed Identity y asignarle rol **Azure Digital Twins Data Reader** (o _Data Owner_ si también escribe).
5. Listo: el simulador ya postea a `/api/v1/alerts/smoke`; Angular y PowerApps consumen REST/SignalR.

Consulta `queries.md` para el lenguaje de consulta que usa el ACL internamente.
