namespace WinRelease.Core.Compilation;

/// <summary>
/// Deterministic UpgradeCode generation for the Packaging Console's 1-click "Auto-Gen" action
/// (see docs/roadmap/phase1-core-functionality.md, Pain Point 4) - same UUIDv5 scheme as
/// <see cref="ComponentGuid"/>/<see cref="ProductCode"/>, but rooted at a fixed,
/// WinRelease-wide namespace instead of an existing UpgradeCode, since generating the
/// UpgradeCode itself is exactly what this does - there's nothing else to seed from yet.
/// </summary>
public static class UpgradeCodeGenerator
{
    // Arbitrary but fixed - must never change once anyone has relied on its output, since
    // that would silently change every future Auto-Gen result for the same Name+Manufacturer.
    private static readonly Guid RootNamespace = Guid.Parse("8f60cc23-fc55-4ed3-bc7a-1b46f224fe74");

    public static Guid For(string name, string manufacturer) =>
        Uuidv5.Generate(RootNamespace, $"{manufacturer}:{name}");
}
