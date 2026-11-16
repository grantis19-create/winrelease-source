using System.ComponentModel.DataAnnotations;
using WinRelease.Core.Domain;
using Xunit;

namespace WinRelease.Core.Tests;

public class WebhookConfigValidationTests
{
    [Theory]
    [InlineData("https://hooks.example.com/winrelease")]
    [InlineData("https://hooks.slack.com/services/T00/B00/XXX")]
    public void WellFormedHttpOrHttpsUrlToAPublicHost_IsValid(string url) =>
        Assert.Empty(Validate(new WebhookConfig { Url = url }));

    [Theory]
    [InlineData("")]
    [InlineData("not a url")]
    [InlineData("ftp://example.com/x")]
    [InlineData("javascript:alert(1)")]
    [InlineData("/relative/path")]
    public void AnythingOtherThanAnAbsoluteHttpOrHttpsUrl_IsInvalid(string url) =>
        Assert.NotEmpty(Validate(new WebhookConfig { Url = url }));

    /// <summary>ADR 0080, SSRF defense part 1 of 2: the cheap, synchronous case - no DNS resolution involved at all.</summary>
    [Theory]
    [InlineData("http://localhost:3000/webhook")]
    [InlineData("http://LOCALHOST/webhook")]
    [InlineData("http://foo.localhost/webhook")]
    [InlineData("http://127.0.0.1/webhook")]
    [InlineData("http://169.254.169.254/latest/meta-data")] // the cloud metadata endpoint
    [InlineData("http://10.0.0.5/webhook")]
    [InlineData("http://192.168.1.1/webhook")]
    [InlineData("http://[::1]/webhook")]
    public void UrlPointingAtLocalhostOrAPrivateLiteralIp_IsInvalid(string url) =>
        Assert.NotEmpty(Validate(new WebhookConfig { Url = url }));

    private static List<ValidationResult> Validate(WebhookConfig webhook)
    {
        var results = new List<ValidationResult>();
        Validator.TryValidateObject(webhook, new ValidationContext(webhook), results, validateAllProperties: true);
        return results;
    }
}
