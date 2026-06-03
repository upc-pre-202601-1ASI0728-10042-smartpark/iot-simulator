// ============================================================================
// IDigitalTwinGateway.cs
// Puerto (interfaz) del Anti-Corruption Layer del contexto Digital Twin
// Synchronization. El resto de bounded contexts dependen SOLO de esta interfaz,
// nunca del SDK de Azure. Permite mockear en tests y cambiar el proveedor.
// ============================================================================
using SmartPark.DigitalTwinSync.Contracts;

namespace SmartPark.DigitalTwinSync;

public interface IDigitalTwinGateway
{
    Task<OccupancySummaryDto> GetLotOccupancyAsync(string lotId, CancellationToken ct = default);
    Task<IReadOnlyList<ZoneOccupancyDto>> GetZonesAsync(int? levelNumber = null, CancellationToken ct = default);
    Task<IReadOnlyList<ParkingSpaceDto>> GetSpacesByZoneAsync(string zoneId, CancellationToken ct = default);
    Task<IReadOnlyList<SmokeAlertDto>> GetActiveSmokeAlertsAsync(CancellationToken ct = default);
    Task<IReadOnlyList<EnergyZoneDto>> GetEnergyRecommendationsAsync(CancellationToken ct = default);

    // Escritura: registrar una alerta de humo entrante (idempotente sobre el twin).
    Task IngestSmokeAlertAsync(SmokeAlertIngestDto alert, CancellationToken ct = default);

    // Salud del backend ADT (para el "modo degradado" del dashboard del operador).
    Task<bool> IsHealthyAsync(CancellationToken ct = default);
}
