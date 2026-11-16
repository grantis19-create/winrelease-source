using System.ComponentModel.DataAnnotations;
using System.Net;

namespace WinRelease.Core.Domain;

/// <summary>
/// Where WinRelease posts a generic JSON notification when a build finishes (ADR 0078) - an
/// Account-level default every Project inherits, with an optional per-Project override, same
/// inheritance shape as <see cref="StorageConnection"/> (ADR 0003). Deliberately just a URL for
/// now: no signing secret, no per-event filtering - the smallest thing that works for "tell my
/// Slack/Teams/generic endpoint a build happened." A signing secret (HMAC over the payload, the
/// way GitHub/Stripe webhooks work) is a reasonable future addition if a real need for verifying
/// the sender shows up; not built speculatively.
/// </summary>
public sealed record WebhookConfig : IValidatableObject
{
    public required string Url { get; init; }

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        if (string.IsNullOrWhiteSpace(Url) || !Uri.TryCreate(Url, UriKind.Absolute, out var uri) ||
            (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
        {
            yield return new ValidationResult("url must be an absolute http:// or https:// URL.", [nameof(Url)]);
            yield break;
        }

        // SSRF defense, part 1 of 2 (ADR 0080): the cheap, synchronous case - a literal IP (no DNS
        // involved at all) or the "localhost"/"*.localhost" names RFC 6761 reserves for loopback.
        // Part 2 - a hostname that only *resolves* to a private/internal address, including via DNS
        // rebinding - can't be checked here without real DNS I/O inside a sync validator; that's
        // WinRelease.API.Webhooks' connect-time check instead, right before the real HTTP connection
        // it protects (CheckAsync at save time, NotifyAsync at build-completion time).
        var host = uri.Host;
        if (host.Equals("localhost", StringComparison.OrdinalIgnoreCase) || host.EndsWith(".localhost", StringComparison.OrdinalIgnoreCase))
        {
            yield return new ValidationResult("url can't point at localhost - a webhook needs a real, externally-reachable endpoint.", [nameof(Url)]);
        }
        else if (IPAddress.TryParse(host, out var literalIp) && PrivateNetworkAddresses.IsPrivateOrReserved(literalIp))
        {
            yield return new ValidationResult("url can't point at a private, loopback, or link-local address.", [nameof(Url)]);
        }
    }
}
