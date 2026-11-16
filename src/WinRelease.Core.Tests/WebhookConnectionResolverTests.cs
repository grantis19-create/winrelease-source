using WinRelease.Core.Domain;
using WinRelease.Core.Manifest;
using Xunit;

namespace WinRelease.Core.Tests;

public class WebhookConnectionResolverTests
{
    private static readonly Account AccountWithWebhook = new()
    {
        Id = Guid.NewGuid(),
        Name = "Contoso",
        Webhook = new WebhookConfig { Url = "https://hooks.example.com/account-default" },
    };

    private static readonly Account AccountWithoutWebhook = new() { Id = Guid.NewGuid(), Name = "Contoso" };

    [Fact]
    public void Resolve_NoProjectOverride_ReturnsAccountWebhook()
    {
        var project = NewProject(AccountWithWebhook.Id, webhookOverride: null);

        var resolved = WebhookConnectionResolver.Resolve(AccountWithWebhook, project);

        Assert.Equal("https://hooks.example.com/account-default", resolved?.Url);
    }

    [Fact]
    public void Resolve_WithProjectOverride_ReturnsOverride()
    {
        var project = NewProject(AccountWithWebhook.Id, webhookOverride: new WebhookConfig { Url = "https://hooks.example.com/project-specific" });

        var resolved = WebhookConnectionResolver.Resolve(AccountWithWebhook, project);

        Assert.Equal("https://hooks.example.com/project-specific", resolved?.Url);
    }

    [Fact]
    public void Resolve_NeitherAccountNorProjectConfigured_ReturnsNull()
    {
        var project = NewProject(AccountWithoutWebhook.Id, webhookOverride: null);

        var resolved = WebhookConnectionResolver.Resolve(AccountWithoutWebhook, project);

        Assert.Null(resolved);
    }

    private static Project NewProject(Guid accountId, WebhookConfig? webhookOverride) => new()
    {
        Id = Guid.NewGuid(),
        AccountId = accountId,
        Manifest = new WinReleaseManifest
        {
            UpgradeCode = Guid.NewGuid(),
            Name = "WidgetApp",
            Manufacturer = "Acme",
            DisplayVersion = "1.0.0",
        },
        WebhookOverride = webhookOverride,
    };
}
