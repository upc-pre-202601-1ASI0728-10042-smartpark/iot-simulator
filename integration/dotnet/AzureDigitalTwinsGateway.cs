// ============================================================================
// AzureDigitalTwinsGateway.cs
// Implementacion del Anti-Corruption Layer sobre el SDK Azure.DigitalTwins.Core.
// Traduce el grafo de twins (DTDL) a los DTOs neutrales de SmartPark.
//
// NuGet requeridos en el repo web-services:
//   dotnet add package Azure.DigitalTwins.Core
//   dotnet add package Azure.Identity
//
// Autenticacion: DefaultAzureCredential (Managed Identity en Azure App Service,
// o `az login` / variables de entorno en local). Sin secretos en codigo.
// ============================================================================
using System.Text.Json;
using Azure;
using Azure.DigitalTwins.Core;
using Azure.Identity;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using SmartPark.DigitalTwinSync.Contracts;

namespace SmartPark.DigitalTwinSync;

public sealed class AdtOptions
{
    public string HostName { get; set; } = default!; // <nombre>.api.<region>.digitaltwins.azure.net
}

public sealed class AzureDigitalTwinsGateway : IDigitalTwinGateway
{
    private const string M = "dtmi:com:apextwin:smartpark";
    private readonly DigitalTwinsClient _client;
    private readonly ILogger<AzureDigitalTwinsGateway> _log;

    public AzureDigitalTwinsGateway(IOptions<AdtOptions> options, ILogger<AzureDigitalTwinsGateway> log)
    {
        _log = log;
        var host = options.Value.HostName;
        var uri = new Uri(host.StartsWith("http") ? host : $"https://{host}");
        _client = new DigitalTwinsClient(uri, new DefaultAzureCredential());
    }

    public async Task<OccupancySummaryDto> GetLotOccupancyAsync(string lotId, CancellationToken ct = default)
    {
        var twin = await _client.GetDigitalTwinAsync<BasicDigitalTwin>(lotId, ct);
        var c = twin.Value.Contents;
        return new OccupancySummaryDto(
            lotId,
            GetInt(c, "totalSpaces"),
            GetInt(c, "occupiedSpaces"),
            GetDouble(c, "occupancyRate"),
            DateTimeOffset.UtcNow);
    }

    public async Task<IReadOnlyList<ZoneOccupancyDto>> GetZonesAsync(int? levelNumber = null, CancellationToken ct = default)
    {
        var q = $"SELECT * FROM digitaltwins T WHERE IS_OF_MODEL(T, '{M}:ParkingZone;1')";
        var result = new List<ZoneOccupancyDto>();
        await foreach (var t in _client.QueryAsync<BasicDigitalTwin>(q, ct))
        {
            var c = t.Contents;
            // levelNumber se infiere del dtId ZONE-L{n}-{code}
            var lvl = ParseLevelFromId(t.Id);
            if (levelNumber.HasValue && lvl != levelNumber.Value) continue;
            result.Add(new ZoneOccupancyDto(
                t.Id, GetString(c, "code"), lvl,
                GetInt(c, "totalSpaces"), GetInt(c, "occupiedSpaces"),
                GetDouble(c, "occupancyRate"), GetString(c, "congestionLevel", "Low")));
        }
        return result;
    }

    public async Task<IReadOnlyList<ParkingSpaceDto>> GetSpacesByZoneAsync(string zoneId, CancellationToken ct = default)
    {
        // Recorre la relacion hasSpace de la zona
        var q = $"SELECT space FROM digitaltwins zone JOIN space RELATED zone.hasSpace WHERE zone.$dtId = '{zoneId}'";
        var result = new List<ParkingSpaceDto>();
        await foreach (var item in _client.QueryAsync<JsonElement>(q, ct))
        {
            var s = item.GetProperty("space");
            result.Add(new ParkingSpaceDto(
                s.GetProperty("$dtId").GetString()!,
                GetStr(s, "code"), zoneId, ParseLevelFromId(s.GetProperty("$dtId").GetString()!),
                GetStr(s, "occupancyState", "Free"), GetStr(s, "spaceType", "Regular"),
                ParseDate(s, "lastUpdated")));
        }
        return result;
    }

    public async Task<IReadOnlyList<SmokeAlertDto>> GetActiveSmokeAlertsAsync(CancellationToken ct = default)
    {
        var q = $"SELECT * FROM digitaltwins T WHERE IS_OF_MODEL(T, '{M}:SmokeDetector;1') AND T.smokeDetected = true";
        var result = new List<SmokeAlertDto>();
        await foreach (var t in _client.QueryAsync<BasicDigitalTwin>(q, ct))
        {
            var c = t.Contents;
            result.Add(new SmokeAlertDto(
                t.Id, GetString(c, "code"), ParseLevelFromId(t.Id),
                GetBool(c, "smokeDetected"), GetDouble(c, "smokeLevel"),
                GetString(c, "status", "Normal"), DateTimeOffset.UtcNow));
        }
        return result;
    }

    public async Task<IReadOnlyList<EnergyZoneDto>> GetEnergyRecommendationsAsync(CancellationToken ct = default)
    {
        var q = $"SELECT * FROM digitaltwins T WHERE IS_OF_MODEL(T, '{M}:LightingZone;1')";
        var result = new List<EnergyZoneDto>();
        await foreach (var t in _client.QueryAsync<BasicDigitalTwin>(q, ct))
        {
            var c = t.Contents;
            result.Add(new EnergyZoneDto(
                t.Id, GetDouble(c, "currentLevel"), GetDouble(c, "recommendedLevel"),
                GetDouble(c, "savingsPercent"), GetString(c, "status", "Optimal")));
        }
        return result;
    }

    public async Task IngestSmokeAlertAsync(SmokeAlertIngestDto alert, CancellationToken ct = default)
    {
        // Aplica JSON Patch al twin del detector (idempotente).
        var patch = new JsonPatchDocument();
        patch.AppendReplace("/smokeDetected", true);
        patch.AppendReplace("/smokeLevel", alert.SmokeLevel);
        patch.AppendReplace("/status", "Alert");
        patch.AppendReplace("/lastReading", alert.DetectedAt.UtcDateTime);
        await _client.UpdateDigitalTwinAsync(alert.DetectorId, patch, cancellationToken: ct);
        _log.LogWarning("Alerta de humo ingerida: {Detector} nivel {Level} ppm", alert.DetectorId, alert.SmokeLevel);
        // Aqui el Web Service publicaria el evento a Safety & Incident / Notification (SignalR + FCM).
    }

    public async Task<bool> IsHealthyAsync(CancellationToken ct = default)
    {
        try
        {
            await foreach (var _ in _client.QueryAsync<BasicDigitalTwin>("SELECT TOP(1) * FROM digitaltwins", ct))
                return true;
            return true;
        }
        catch (RequestFailedException ex)
        {
            _log.LogError(ex, "ADT no disponible (modo degradado)");
            return false;
        }
    }

    // ---- helpers de lectura tolerante ----
    private static int ParseLevelFromId(string id)
    {
        var i = id.IndexOf("-L", StringComparison.Ordinal);
        if (i < 0) return 0;
        var rest = id[(i + 2)..];
        var num = new string(rest.TakeWhile(char.IsDigit).ToArray());
        return int.TryParse(num, out var n) ? n : 0;
    }
    private static int GetInt(IDictionary<string, object> c, string k) => c.TryGetValue(k, out var v) && v != null ? Convert.ToInt32(((JsonElement)v).ToString()) : 0;
    private static double GetDouble(IDictionary<string, object> c, string k) => c.TryGetValue(k, out var v) && v != null ? Convert.ToDouble(((JsonElement)v).ToString(), System.Globalization.CultureInfo.InvariantCulture) : 0;
    private static bool GetBool(IDictionary<string, object> c, string k) => c.TryGetValue(k, out var v) && v != null && ((JsonElement)v).GetBoolean();
    private static string GetString(IDictionary<string, object> c, string k, string def = "") => c.TryGetValue(k, out var v) && v != null ? ((JsonElement)v).ToString() : def;
    private static string GetStr(JsonElement e, string k, string def = "") => e.TryGetProperty(k, out var v) ? v.ToString() : def;
    private static DateTimeOffset ParseDate(JsonElement e, string k) => e.TryGetProperty(k, out var v) && DateTimeOffset.TryParse(v.ToString(), out var d) ? d : DateTimeOffset.UtcNow;
}
