using System.Text.Json;
using System.Text.Json.Serialization;

namespace WinRelease.Core.Persistence;

/// <summary>Shared camelCase serializer options for the flat-JSON-file repositories (ADR 0014).</summary>
internal static class PersistenceJson
{
    public static readonly JsonSerializerOptions Options = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) },
        WriteIndented = true,
    };
}
