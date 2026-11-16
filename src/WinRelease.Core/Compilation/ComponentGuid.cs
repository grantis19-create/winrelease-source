namespace WinRelease.Core.Compilation;

/// <summary>See ADR 0010: namespace = manifest's UpgradeCode, name = the file's stable id.</summary>
public static class ComponentGuid
{
    public static Guid For(Guid upgradeCode, string fileId) => Uuidv5.Generate(upgradeCode, fileId);
}
