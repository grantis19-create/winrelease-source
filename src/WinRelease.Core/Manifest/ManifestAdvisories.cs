namespace WinRelease.Core.Manifest;

/// <summary>
/// Non-blocking notes about a manifest that is valid and will build, but that the author may not intend (ADR 0094: flag, explain, let them continue).
/// The Console shows the same advice live; this is what a build run from the API, Local host or Helper reports in its log, so the note is not
/// lost for anyone not using the Console.
/// </summary>
public static class ManifestAdvisories
{
    private static readonly string[] AdminOnlyRoots =
    [
        "ProgramFiles64Folder", "ProgramFilesFolder", "CommonFiles64Folder", "CommonFilesFolder", "SystemFolder", "System64Folder", "WindowsFolder",
    ];

    public static IReadOnlyList<string> For(WinReleaseManifest manifest)
    {
        var notes = new List<string>();

        if (manifest.AppInfo.InstallScope == InstallScope.PerUser && StartsWithAdminOnlyRoot(manifest.TargetDirectory))
        {
            notes.Add($"This is a per-user install, but the install directory '{manifest.TargetDirectory}' is under a folder that needs administrator rights, so installing without admin will fail (MSI error 1925/1603). Use [LocalAppDataFolder]Programs\\... for a per-user install, or switch to per-machine.");
        }

        var version = manifest.ResolvedProductVersion;
        if (!string.IsNullOrWhiteSpace(version) && !VersionMapper.IsWellFormedProductVersion(version))
        {
            notes.Add($"Product version '{version}' isn't the usual major.minor.build (like 1.0.0; major and minor up to 255, build up to 65535). It was built as you wrote it, but Windows Installer validation may flag it and upgrades from or to it might not behave as expected.");
        }

        return notes;
    }

    private static bool StartsWithAdminOnlyRoot(string? targetDirectory) =>
        targetDirectory is { Length: > 0 }
        && AdminOnlyRoots.Any(root => targetDirectory.StartsWith($"[{root}]", StringComparison.OrdinalIgnoreCase));
}
