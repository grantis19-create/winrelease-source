namespace WinRelease.Core.Domain;

/// <summary>
/// Resolves the effective build-notification webhook for a Project: its own override when set,
/// otherwise the owning Account's webhook - same inheritance rule as
/// <see cref="StorageConnectionResolver"/> (ADR 0003), extended to webhooks by ADR 0078. Null
/// (from either side) means "no notification" - unlike storage, there's no always-present default
/// to fall back to.
/// </summary>
public static class WebhookConnectionResolver
{
    public static WebhookConfig? Resolve(Account account, Project project) =>
        project.WebhookOverride ?? account.Webhook;
}
