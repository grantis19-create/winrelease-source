using WinRelease.Core.Manifest;

namespace WinRelease.Core.Domain;

/// <summary>
/// A single software product's persistent packaging configuration, owned by
/// one Account. See CONTEXT.md's Project entry. The packaging config itself
/// (files, shortcuts, registry, UpgradeCode, ...) is the already-validated
/// <see cref="WinReleaseManifest"/>; this record adds the persistence-level
/// identity and the optional per-Project storage override from ADR 0003.
/// </summary>
public sealed record Project
{
    public required Guid Id { get; init; }

    public required Guid AccountId { get; init; }

    public required WinReleaseManifest Manifest { get; init; }

    /// <summary>Overrides the owning Account's storage connection when set. See ADR 0003.</summary>
    public StorageConnection? StorageOverride { get; init; }

    /// <summary>Overrides the owning Account's build-notification webhook when set; null means inherit it. See ADR 0078.</summary>
    public WebhookConfig? WebhookOverride { get; init; }
}
