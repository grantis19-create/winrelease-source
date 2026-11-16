using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace WinRelease.Core.Manifest;

/// <summary>
/// Parses and validates a <c>winrelease.json</c> manifest. Wire format is
/// camelCase (see ADR 0015) so the same field names appear in both the JSON
/// and the RFC 7807 validation errors returned by WinRelease.API.
/// </summary>
public static class ManifestParser
{
    private static readonly JsonSerializerOptions SerializerOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) },
    };

    public static ManifestParseResult Parse(string json)
    {
        if (FindInvalidCharacter(json) is { } invalid)
        {
            return ManifestParseResult.Failed(new Dictionary<string, string[]>
            {
                [""] = [$"The manifest contains a character that can't be carried into the installer ({invalid}). Remove control characters and unpaired surrogates from every field."],
            });
        }

        WinReleaseManifest? manifest;
        try
        {
            manifest = JsonSerializer.Deserialize<WinReleaseManifest>(json, SerializerOptions);
        }
        catch (JsonException ex)
        {
            return ManifestParseResult.Failed(new Dictionary<string, string[]>
            {
                [FieldNameFromPath(ex.Path)] = [ex.Message],
            });
        }

        if (manifest is null)
        {
            return ManifestParseResult.Failed(new Dictionary<string, string[]>
            {
                [""] = ["Manifest body is empty."],
            });
        }

        var errors = Validate(manifest);
        return errors.Count == 0 ? ManifestParseResult.Succeeded(manifest) : ManifestParseResult.Failed(errors);
    }

    /// <summary>
    /// The same DataAnnotations cross-field validation <see cref="Parse"/> runs after deserializing -
    /// exposed separately so <see cref="WxsImporter"/> can validate a manifest it built directly from
    /// XML (never round-tripped through JSON) without duplicating this logic.
    /// </summary>
    public static IReadOnlyDictionary<string, string[]> Validate(WinReleaseManifest manifest)
    {
        var validationResults = new List<ValidationResult>();
        Validator.TryValidateObject(
            manifest,
            new ValidationContext(manifest),
            validationResults,
            validateAllProperties: true);

        if (validationResults.Count == 0)
        {
            return new Dictionary<string, string[]>();
        }

        return validationResults
            .SelectMany(
                result => result.MemberNames.DefaultIfEmpty(""),
                (result, member) => (Field: JsonNamingPolicy.CamelCase.ConvertName(member), Message: result.ErrorMessage ?? "Invalid value."))
            .GroupBy(x => x.Field, x => x.Message)
            .ToDictionary(g => g.Key, g => g.ToArray());
    }

    /// <summary>
    /// The decoded text of a JSON string can hold characters XML 1.0 (the .wxs the build generates) can't represent: C0 control
    /// characters other than tab/CR/LF, unpaired surrogates, U+FFFE/U+FFFF. Left alone they crash the generator (a 500, found by
    /// UAT T7) - rejected up front instead. Scans the decoded values, so JSON escapes such as \u0001 are caught too.
    /// </summary>
    private static string? FindInvalidCharacter(string json)
    {
        try
        {
            using var document = JsonDocument.Parse(json, new JsonDocumentOptions { MaxDepth = 64 });
            return Scan(document.RootElement);
        }
        catch (JsonException)
        {
            return null; // reported by the normal deserialization path with its own message
        }
        catch (InvalidOperationException)
        {
            return "an unpaired UTF-16 surrogate"; // GetString() throws on a lone surrogate escape such as \\ud800
        }
    }

    private static string? Scan(JsonElement element)
    {
        switch (element.ValueKind)
        {
            case JsonValueKind.String:
                return InvalidIn(element.GetString() ?? "");
            case JsonValueKind.Array:
                foreach (var item in element.EnumerateArray())
                {
                    if (Scan(item) is { } found)
                    {
                        return found;
                    }
                }

                return null;
            case JsonValueKind.Object:
                foreach (var property in element.EnumerateObject())
                {
                    if (InvalidIn(property.Name) is { } inName)
                    {
                        return inName;
                    }

                    if (Scan(property.Value) is { } found)
                    {
                        return found;
                    }
                }

                return null;
            default:
                return null;
        }
    }

    private static string? InvalidIn(string text)
    {
        for (var i = 0; i < text.Length; i++)
        {
            var c = text[i];
            var bad = (c < 0x20 && c is not ('\t' or '\n' or '\r'))
                || c is '\uFFFE' or '\uFFFF'
                || (char.IsLowSurrogate(c) && (i == 0 || !char.IsHighSurrogate(text[i - 1])))
                || (char.IsHighSurrogate(c) && (i + 1 >= text.Length || !char.IsLowSurrogate(text[i + 1])));
            if (bad)
            {
                return $"U+{(int)c:X4}";
            }
        }

        return null;
    }

    private static string FieldNameFromPath(string? path) =>
        path?.TrimStart('$', '.') is { Length: > 0 } field ? field : "";
}

public sealed record ManifestParseResult
{
    public bool IsSuccess { get; }
    public WinReleaseManifest? Manifest { get; }
    public IReadOnlyDictionary<string, string[]> Errors { get; }

    private ManifestParseResult(bool isSuccess, WinReleaseManifest? manifest, IReadOnlyDictionary<string, string[]> errors)
    {
        IsSuccess = isSuccess;
        Manifest = manifest;
        Errors = errors;
    }

    public static ManifestParseResult Succeeded(WinReleaseManifest manifest) =>
        new(true, manifest, new Dictionary<string, string[]>());

    public static ManifestParseResult Failed(IReadOnlyDictionary<string, string[]> errors) =>
        new(false, null, errors);
}
