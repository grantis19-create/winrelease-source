using System.Net;
using System.Net.Sockets;

namespace WinRelease.Core.Domain;

/// <summary>
/// Whether an IP address is loopback, private, link-local (including the cloud metadata endpoint
/// 169.254.169.254), or otherwise reserved - the shared check behind <see cref="WebhookConfig"/>'s
/// SSRF defense (ADR 0080). One place for the range logic so the structural check on a literal-IP
/// URL (<see cref="WebhookConfig.Validate"/>, synchronous, no DNS) and the real connect-time check
/// on a hostname URL (<c>WinRelease.API.Webhooks</c>, after DNS resolution) can't drift apart.
/// </summary>
public static class PrivateNetworkAddresses
{
    public static bool IsPrivateOrReserved(IPAddress address)
    {
        if (address.IsIPv4MappedToIPv6)
        {
            address = address.MapToIPv4();
        }

        if (IPAddress.IsLoopback(address) || address.Equals(IPAddress.Any) || address.Equals(IPAddress.IPv6Any))
        {
            return true;
        }

        if (address.AddressFamily == AddressFamily.InterNetwork)
        {
            var b = address.GetAddressBytes();
            return b[0] == 10 // 10.0.0.0/8
                || (b[0] == 172 && b[1] is >= 16 and <= 31) // 172.16.0.0/12
                || (b[0] == 192 && b[1] == 168) // 192.168.0.0/16
                || (b[0] == 169 && b[1] == 254); // 169.254.0.0/16 - link-local, includes the cloud metadata endpoint 169.254.169.254
        }

        if (address.AddressFamily == AddressFamily.InterNetworkV6)
        {
            var b = address.GetAddressBytes();
            return (b[0] & 0xfe) == 0xfc // fc00::/7 - unique local
                || (b[0] == 0xfe && (b[1] & 0xc0) == 0x80); // fe80::/10 - link-local
        }

        return false;
    }
}
