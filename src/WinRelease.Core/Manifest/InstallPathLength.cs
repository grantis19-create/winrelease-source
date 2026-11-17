namespace WinRelease.Core.Manifest;

/// <summary>
/// Windows Installer cannot create a file whose full path is 260 characters or more (MAX_PATH), whatever the
/// OS's long-path setting: <c>msiexec</c> fails with error 1603 while laying the file down (found by UAT T2/T6 -
/// an administrative extract of a 30-level tree and of a ~250-character declared path both failed). This estimates the
/// full install path from the standard folder's typical location so it can be rejected up front, in plain words.
/// </summary>
public static class InstallPathLength
{
    /// <summary>The longest full path (including the file name) Windows Installer can write.</summary>
    public const int Max = 259;

    /// <summary>A typical installing user's profile ("C:\Users\Administrator") - the placeholder in <see cref="TargetDirectoryResolver.ExampleBasePath"/> is not a real length.</summary>
    private const string TypicalUserProfile = @"C:\Users\Administrator";

    public static string Estimate(WinReleaseManifest manifest, InstallRoot root, string installPath)
    {
        var parts = installPath.Split(['/', '\\'], StringSplitOptions.RemoveEmptyEntries);
        string rootId;
        IEnumerable<string> segments;
        if (root == InstallRoot.InstallFolder)
        {
            if (!TargetDirectoryResolver.TryParse(manifest.TargetDirectory, out rootId, out var targetSegments, manifest.Architecture))
            {
                rootId = "ProgramFiles64Folder";
                targetSegments = [];
            }

            segments = targetSegments.Concat(parts);
        }
        else
        {
            rootId = root.ToString();
            segments = parts;
        }

        var baseName = TargetDirectoryResolver.ExampleBasePath(rootId).Replace(@"C:\Users\<installing user>", TypicalUserProfile);
        return baseName + "\\" + string.Join('\\', segments);
    }

    public static bool IsTooLong(string estimatedPath) => estimatedPath.Length > Max;
}
