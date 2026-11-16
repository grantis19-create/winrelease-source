namespace WinRelease.Core.Domain;

/// <summary>
/// Resolves the effective storage connection for a Project: its own override
/// when set, otherwise the owning Account's connection. See ADR 0003 - every
/// Project inherits its Account's storage setting by default, with an
/// optional per-Project override for the exception case.
/// </summary>
public static class StorageConnectionResolver
{
    public static StorageConnection Resolve(Account account, Project project) =>
        project.StorageOverride ?? account.Storage;
}
