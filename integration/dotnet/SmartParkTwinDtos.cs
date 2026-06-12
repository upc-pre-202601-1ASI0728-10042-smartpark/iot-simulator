// ============================================================================
// SmartParkTwinDtos.cs
// DTOs neutrales que expone el Web Service hacia Angular / PowerApps.
// NO exponen tipos del SDK de Azure: esa es la esencia del Anti-Corruption Layer.
// Namespace sugerido para el repo web-services.
// ============================================================================
namespace SmartPark.DigitalTwinSync.Contracts;

public record OccupancySummaryDto(
    string LotId,
    int TotalSpaces,
    int OccupiedSpaces,
    double OccupancyRate,
    DateTimeOffset AsOf);

public record ZoneOccupancyDto(
    string ZoneId,
    string Code,
    int LevelNumber,
    int TotalSpaces,
    int OccupiedSpaces,
    double OccupancyRate,
    string CongestionLevel);

public record ParkingSpaceDto(
    string SpaceId,
    string Code,
    string ZoneId,
    int LevelNumber,
    string OccupancyState,
    string SpaceType,
    DateTimeOffset LastUpdated);

public record SmokeAlertDto(
    string DetectorId,
    string ZoneId,
    int LevelNumber,
    bool SmokeDetected,
    double SmokeLevel,
    string Status,
    DateTimeOffset LastReading);

public record EnergyZoneDto(
    string LightingZoneId,
    double CurrentLevel,
    double RecommendedLevel,
    double SavingsPercent,
    string Status);

// Payload que envia el simulador IoT (o un sensor real) al Web Service
// cuando se dispara una alerta de humo -> arranca la cadena de notificaciones.
public record SmokeAlertIngestDto(
    string DetectorId,
    string ZoneId,
    int LevelNumber,
    double SmokeLevel,
    DateTimeOffset DetectedAt,
    string[] AffectedOccupiedSpaces);
