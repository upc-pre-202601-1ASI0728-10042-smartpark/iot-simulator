// ============================================================================
// SmartParkControllers.cs
// Controladores REST que consumen el ACL. Son los endpoints que llaman:
//   - la Web App Angular del operador (REST + SignalR)
//   - la Mobile App PowerApps (conector HTTP custom)
//   - el simulador IoT (POST de alertas de humo)
// Rutas alineadas con la arquitectura del informe (ej. /api/v1/alerts/smoke).
// ============================================================================
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using SmartPark.DigitalTwinSync;
using SmartPark.DigitalTwinSync.Contracts;

namespace SmartPark.Api.Controllers;

[ApiController]
[Route("api/v1/occupancy")]
public class OccupancyController(IDigitalTwinGateway gw) : ControllerBase
{
    /// <summary>Resumen de ocupacion del lote (KPI principal del dashboard).</summary>
    [HttpGet("summary")]
    public async Task<ActionResult<OccupancySummaryDto>> Summary([FromQuery] string lotId = "LOT-JOCKEY", CancellationToken ct = default)
    {
        if (!await gw.IsHealthyAsync(ct))
            return StatusCode(503, new { degraded = true, message = "Azure Digital Twins no disponible. Mostrar ultimo estado conocido en el cliente." });
        return Ok(await gw.GetLotOccupancyAsync(lotId, ct));
    }

    /// <summary>Ocupacion por zona (coloreo del mapa 3D / tabla por nivel).</summary>
    [HttpGet("zones")]
    public async Task<ActionResult<IReadOnlyList<ZoneOccupancyDto>>> Zones([FromQuery] int? level = null, CancellationToken ct = default)
        => Ok(await gw.GetZonesAsync(level, ct));

    /// <summary>Detalle de plazas de una zona.</summary>
    [HttpGet("zones/{zoneId}/spaces")]
    public async Task<ActionResult<IReadOnlyList<ParkingSpaceDto>>> Spaces(string zoneId, CancellationToken ct = default)
        => Ok(await gw.GetSpacesByZoneAsync(zoneId, ct));
}

[ApiController]
[Route("api/v1/energy")]
public class EnergyController(IDigitalTwinGateway gw) : ControllerBase
{
    [HttpGet("recommendations")]
    public async Task<ActionResult<IReadOnlyList<EnergyZoneDto>>> Recommendations(CancellationToken ct = default)
        => Ok(await gw.GetEnergyRecommendationsAsync(ct));
}

[ApiController]
[Route("api/v1/alerts/smoke")]
public class SmokeAlertsController(IDigitalTwinGateway gw, IHubContext<AlertsHub> hub) : ControllerBase
{
    /// <summary>Lista de alertas de humo activas (panel de seguridad).</summary>
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<SmokeAlertDto>>> Active(CancellationToken ct = default)
        => Ok(await gw.GetActiveSmokeAlertsAsync(ct));

    /// <summary>
    /// Ingesta de alerta de humo desde el simulador IoT o un sensor real.
    /// Actualiza el twin y empuja la alerta en tiempo real al dashboard via SignalR.
    /// </summary>
    [HttpPost]
    public async Task<IActionResult> Ingest([FromBody] SmokeAlertIngestDto alert, CancellationToken ct = default)
    {
        await gw.IngestSmokeAlertAsync(alert, ct);
        await hub.Clients.All.SendAsync("smokeAlert", alert, ct); // empuje al operador en vivo
        return Accepted(new { received = true, alert.DetectorId });
    }
}

/// <summary>Hub SignalR para alertas en tiempo real al dashboard del operador.</summary>
public class AlertsHub : Hub { }
