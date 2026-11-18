using WinRelease.Core.Manifest;

namespace WinRelease.Core.Compilation;

/// <summary>
/// The MSI ProductCode of one build. ADR 0120 (supersedes the derived default of ADR 0027): a new random GUID for every build, the way WiX and Visual
/// Studio do it, unless the manifest pins one (<see cref="WinReleaseManifest.ProductCode"/>, ADR 0038). A fixed code per version made a rebuild of the same
/// version fail to install over the earlier build (Windows Installer error 1638: same ProductCode, different PackageCode). Because the code is not
/// derivable from the manifest, whoever needs it afterwards (the Intune detection rule, the Console's Build Output) takes it from the build's result.
/// </summary>
public static class ProductCode
{
    public static Guid ForNewBuild(WinReleaseManifest manifest) => manifest.ProductCode ?? Guid.NewGuid();
}
