namespace WinRelease.Core.Manifest;

/// <summary>
/// Parses <see cref="WinReleaseManifest.TargetDirectory"/> into a WiX StandardDirectory Id plus a
/// subpath, accepting either bracketed WiX property syntax (<c>"[ProgramFiles64Folder]Acme\App"</c>)
/// or an equivalent literal Windows path (<c>"C:\Program Files\Acme\App"</c>) - a developer can
/// type or paste either form, or compose one via the Console's "Browse..." picker. See ADR 0038.
/// </summary>
public static class TargetDirectoryResolver
{
    /// <summary>Every WiX StandardDirectory Id the Console exposes as a Target Directory root.</summary>
    public static readonly string[] KnownRootIds =
    [
        "ProgramFiles64Folder",
        "ProgramFilesFolder",
        "CommonFiles64Folder",
        "CommonFilesFolder",
        "SystemFolder",
        "System64Folder",
        "AppDataFolder",
        "LocalAppDataFolder",
        "CommonAppDataFolder",
    ];

    /// <summary>
    /// Longest/most-specific prefixes first - "Program Files\Common Files" must be checked before
    /// the bare "Program Files" prefix it starts with, or it would never match.
    /// </summary>
    private static readonly (string Prefix, string RootId)[] LiteralPathPrefixes =
    [
        (@"C:\Program Files (x86)\Common Files\", "CommonFilesFolder"),
        (@"C:\Program Files\Common Files\", "CommonFiles64Folder"),
        (@"C:\Program Files (x86)\", "ProgramFilesFolder"),
        (@"C:\Program Files\", "ProgramFiles64Folder"),
        (@"C:\Windows\System32\", "SystemFolder"),
        (@"C:\ProgramData\", "CommonAppDataFolder"),
    ];

    public static bool TryParse(string? raw, out string rootId, out string[] segments)
    {
        rootId = "";
        segments = [];

        if (string.IsNullOrWhiteSpace(raw))
        {
            return false;
        }

        var trimmed = raw.Trim();

        if (trimmed.StartsWith('['))
        {
            var closeIndex = trimmed.IndexOf(']');
            if (closeIndex < 0)
            {
                return false;
            }

            var token = trimmed[1..closeIndex];
            if (!KnownRootIds.Contains(token, StringComparer.Ordinal))
            {
                return false;
            }

            rootId = token;
            segments = SplitSegments(trimmed[(closeIndex + 1)..]);
            return true;
        }

        foreach (var (prefix, id) in LiteralPathPrefixes)
        {
            if (trimmed.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
            {
                rootId = id;
                segments = SplitSegments(trimmed[prefix.Length..]);
                return true;
            }
        }

        // A bare recognized token with no brackets and no subpath (e.g. "ProgramFiles64Folder").
        if (KnownRootIds.Contains(trimmed, StringComparer.Ordinal))
        {
            rootId = trimmed;
            segments = [];
            return true;
        }

        return false;
    }

    private static string[] SplitSegments(string rest) =>
        rest.Split(['\\', '/'], StringSplitOptions.RemoveEmptyEntries);

    /// <summary>
    /// Illustrative real Windows base path for a resolved root - preview text only (the Console's
    /// "Resolves to" subtext), never sent to the build. <c>&lt;installing user&gt;</c> for
    /// AppData/LocalAppData is deliberately not a real username - see ADR 0033's caveat.
    /// </summary>
    public static string ExampleBasePath(string rootId) => rootId switch
    {
        "ProgramFiles64Folder" => @"C:\Program Files",
        "ProgramFilesFolder" => @"C:\Program Files (x86)",
        "CommonFiles64Folder" => @"C:\Program Files\Common Files",
        "CommonFilesFolder" => @"C:\Program Files (x86)\Common Files",
        "SystemFolder" => @"C:\Windows\System32",
        "System64Folder" => @"C:\Windows\System32",
        "AppDataFolder" => @"C:\Users\<installing user>\AppData\Roaming",
        "LocalAppDataFolder" => @"C:\Users\<installing user>\AppData\Local",
        "CommonAppDataFolder" => @"C:\ProgramData",
        _ => rootId,
    };
}
