using System.Text.RegularExpressions;
using WinRelease.Core.Manifest;

namespace WinRelease.Core.Compilation;

/// <summary>
/// ADR 0052: the MSI Shortcut table can't target a URL - Windows Installer's CreateShortcuts silently
/// skips such a row (verified with a real install log), so a URL "shortcut" is instead a plain
/// <c>[InternetShortcut]</c> .url file installed into the Desktop / Start Menu / Startup folder, which
/// Windows treats as a shortcut. The file is generated at build time (<see cref="WixCompiler"/> writes
/// it into its temp directory) - the user never supplies one.
/// </summary>
public static partial class UrlShortcutFile
{
    [GeneratedRegex(@"^[A-Za-z][A-Za-z0-9+.\-]*://")]
    private static partial Regex SchemePattern();

    /// <summary>True for a Target like <c>https://example.com/docs</c> - any <c>scheme://</c> form.</summary>
    public static bool IsUrl(string? target) => target is { Length: > 0 } && SchemePattern().IsMatch(target);

    /// <summary>Deterministic generated-file name, stable across builds so the Component stays stable.</summary>
    public static string GeneratedFileName(Guid upgradeCode, string target, string location) =>
        $"url-{Uuidv5.Generate(upgradeCode, $"url-shortcut:{target}:{location}"):N}.url";

    /// <summary>The file's contents. <paramref name="url"/> must contain no control characters (validated up front).</summary>
    public static string Content(string url) => $"[InternetShortcut]\r\nURL={url}\r\n";

    /// <summary>Every (file name, content) pair a manifest's URL shortcuts need written before <c>wix build</c>.</summary>
    public static IReadOnlyList<(string FileName, string Content)> For(WinReleaseManifest manifest) =>
        manifest.Shortcuts
            .Where(s => IsUrl(s.TargetPath))
            .Select(s => (GeneratedFileName(manifest.UpgradeCode, s.TargetPath!, s.Location), Content(s.TargetPath!)))
            .DistinctBy(x => x.Item1)
            .ToList();
}
