namespace WinRelease.Core.Domain;

/// <summary>
/// The billing/ownership entity that groups Projects and holds the default
/// storage connection every Project under it inherits. See CONTEXT.md's
/// Account entry and ADR 0003.
/// </summary>
public sealed record Account
{
    public required Guid Id { get; init; }

    public required string Name { get; init; }

    public StorageConnection Storage { get; init; } = StorageConnection.Managed;

    /// <summary>Default build-notification webhook every Project under this Account inherits, unless it sets its own. Null means no notification by default. See ADR 0078.</summary>
    public WebhookConfig? Webhook { get; init; }
}
