using WinRelease.Core.Manifest;

namespace WinRelease.Core.Compilation;

/// <summary>
/// See ADR 0027: namespace = manifest's UpgradeCode, name = ResolvedProductVersion,
/// same UUIDv5 scheme as <see cref="ComponentGuid"/> (ADR 0010) - the deterministic default.
/// <see cref="WinReleaseManifest.ProductCode"/> overrides it when explicitly set (ADR 0038), so a
/// developer can pin a stable ProductCode across builds; either way, this is the single place
/// <see cref="WxsGenerator"/> and WinRelease.Intune's <c>MsiDetectionRule</c> both resolve it from,
/// so they can never disagree about what's actually baked into the compiled .msi.
/// </summary>
public static class ProductCode
{
    public static Guid For(WinReleaseManifest manifest) =>
        manifest.ProductCode ?? Uuidv5.Generate(manifest.UpgradeCode, $"productcode:{manifest.ResolvedProductVersion}");
}
