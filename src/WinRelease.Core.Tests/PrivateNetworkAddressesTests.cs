using System.Net;
using WinRelease.Core.Domain;
using Xunit;

namespace WinRelease.Core.Tests;

public class PrivateNetworkAddressesTests
{
    [Theory]
    [InlineData("127.0.0.1")]
    [InlineData("::1")]
    [InlineData("10.0.0.1")]
    [InlineData("10.255.255.255")]
    [InlineData("172.16.0.1")]
    [InlineData("172.31.255.255")]
    [InlineData("192.168.1.1")]
    [InlineData("169.254.169.254")] // the cloud metadata endpoint - the canonical real-world SSRF target
    [InlineData("169.254.1.1")]
    [InlineData("0.0.0.0")]
    [InlineData("fc00::1")] // unique local
    [InlineData("fe80::1")] // link-local
    public void PrivateLoopbackLinkLocalAndReservedAddresses_AreFlagged(string ip) =>
        Assert.True(PrivateNetworkAddresses.IsPrivateOrReserved(IPAddress.Parse(ip)));

    [Theory]
    [InlineData("8.8.8.8")]
    [InlineData("1.1.1.1")]
    [InlineData("172.15.255.255")] // just outside 172.16.0.0/12
    [InlineData("172.32.0.0")] // just outside 172.16.0.0/12
    [InlineData("192.167.255.255")] // just outside 192.168.0.0/16
    [InlineData("2606:4700:4700::1111")] // Cloudflare DNS, public IPv6
    public void PublicAddresses_AreNotFlagged(string ip) =>
        Assert.False(PrivateNetworkAddresses.IsPrivateOrReserved(IPAddress.Parse(ip)));
}
