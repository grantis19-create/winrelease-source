using System.Net;
using System.Net.Sockets;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace WinRelease.Helper.Tests;

/// <summary>
/// The port-conflict decision logic (docs/roadmap/helper-exe-strategy.md's open decision #1) pulled
/// out into static methods specifically so it's testable without a real Kestrel bind - these tests
/// exercise it directly rather than through a real port conflict.
/// </summary>
public sealed class HelperStartupTests
{
    [Fact]
    public void IsAddressInUseException_RecognizesAWrappedSocketException()
    {
        var socketException = new SocketException((int)SocketError.AddressAlreadyInUse);
        var wrapped = new IOException("Failed to bind to address http://127.0.0.1:5601", socketException);

        Assert.True(HelperStartup.IsAddressInUseException(wrapped));
    }

    [Fact]
    public void IsAddressInUseException_WalksMultipleLevelsOfWrapping()
    {
        var socketException = new SocketException((int)SocketError.AddressAlreadyInUse);
        var wrapped = new IOException("outer", new IOException("middle", socketException));

        Assert.True(HelperStartup.IsAddressInUseException(wrapped));
    }

    [Fact]
    public void HostArguments_DropsOwnSwitchesSoTheyCannotSwallowTheNextArgument()
    {
        var config = new ConfigurationBuilder()
            .AddCommandLine(HelperStartup.HostArguments(["--console", "--urls=http://127.0.0.1:5602", "--tray", "winrelease-helper:start"]))
            .Build();

        Assert.Equal("http://127.0.0.1:5602", config["Urls"]);
        Assert.Null(config["console"]);
        Assert.DoesNotContain(config.AsEnumerable(), kv => kv.Value?.Contains("winrelease-helper") == true);
    }

    [Theory]
    [InlineData("http://127.0.0.1:5601")]
    [InlineData("http://localhost:5601")]
    [InlineData("http://[::1]:5601")]
    [InlineData("http://127.0.0.1:5601;http://localhost:5602")]
    [InlineData("")]
    [InlineData(null)]
    public void NonLoopbackUrls_AcceptsOnlyThisPc(string? urls) => Assert.Empty(HelperStartup.NonLoopbackUrls(urls));

    [Theory]
    [InlineData("http://0.0.0.0:5601")]
    [InlineData("http://+:5601")]
    [InlineData("http://*:5601")]
    [InlineData("http://[::]:5601")]
    [InlineData("http://192.168.1.20:5601")]
    [InlineData("http://myhost:5601")]
    [InlineData("not a url")]
    public void NonLoopbackUrls_RefusesWildcardsNetworkAddressesAndGarbage(string urls) => Assert.Equal([urls], HelperStartup.NonLoopbackUrls(urls));

    [Fact]
    public void NonLoopbackUrls_ReturnsOnlyTheOffendersFromAMixedList() =>
        Assert.Equal(["http://0.0.0.0:5602"], HelperStartup.NonLoopbackUrls("http://127.0.0.1:5601;http://0.0.0.0:5602"));

    [Fact]
    public void NonLoopbackUrls_ReadsUrlsAndKestrelEndpointsFromConfiguration()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Urls"] = "http://127.0.0.1:5601",
                ["Kestrel:Endpoints:Wide:Url"] = "http://0.0.0.0:6000",
                ["Kestrel:Endpoints:Local:Url"] = "http://localhost:6001",
            })
            .Build();

        Assert.Equal(["http://0.0.0.0:6000"], HelperStartup.NonLoopbackUrls(config));
    }

    [Fact]
    public void HostArguments_DropsTheInstallSwitches()
    {
        var config = new ConfigurationBuilder()
            .AddCommandLine(HelperStartup.HostArguments(["--installed-from=C:/Users/x/Downloads/WinRelease.Helper.exe", "--uninstall", "--quiet", "--urls=http://127.0.0.1:5602"]))
            .Build();

        Assert.Equal("http://127.0.0.1:5602", config["Urls"]);
        Assert.Single(config.AsEnumerable(), kv => kv.Value is not null);
    }

    [Theory]
    [InlineData(null, "0.1.7", true)]
    [InlineData("0.1.6", "0.1.7", true)]
    [InlineData("0.1.7", "0.1.7", false)]
    [InlineData("0.1.8", "0.1.7", false)]
    public void ShouldReplaceInstalled_InstallsOrUpdatesButNeverDowngrades(string? installed, string mine, bool expected) =>
        Assert.Equal(expected, HelperInstall.ShouldReplaceInstalled(installed, mine));

    [Fact]
    public void IsInstalledCopy_MatchesOnlyThePermanentPathIgnoringCase()
    {
        Assert.True(HelperInstall.IsInstalledCopy(HelperInstall.InstalledExePath.ToUpperInvariant()));
        Assert.False(HelperInstall.IsInstalledCopy(Path.Combine(Path.GetTempPath(), HelperInstall.ExeName)));
        Assert.False(HelperInstall.IsInstalledCopy(null));
    }

    [Theory]
    [InlineData("127.0.0.1", true)]
    [InlineData("::1", true)]
    [InlineData("::ffff:127.0.0.1", true)]
    [InlineData("192.168.1.20", false)]
    [InlineData("10.0.0.5", false)]
    [InlineData("::ffff:192.168.1.20", false)]
    [InlineData("fe80::1", false)]
    public void IsLocalCaller_OnlyAcceptsThisPC(string address, bool expected)
    {
        Assert.Equal(expected, HelperStartup.IsLocalCaller(IPAddress.Parse(address)));
    }

    [Fact]
    public void IsAddressInUseException_IsFalseForAnUnrelatedSocketError()
    {
        var socketException = new SocketException((int)SocketError.ConnectionRefused);

        Assert.False(HelperStartup.IsAddressInUseException(socketException));
    }

    [Fact]
    public void IsAddressInUseException_IsFalseForAnUnrelatedException()
    {
        Assert.False(HelperStartup.IsAddressInUseException(new InvalidOperationException()));
    }

    [Fact]
    public void IsAddressInUseException_IsFalseForNull()
    {
        Assert.False(HelperStartup.IsAddressInUseException(null));
    }

    [Theory]
    [InlineData("""{"version":"0.1.0"}""", true)]
    [InlineData("""{"version":""}""", false)]
    [InlineData("""{"notVersion":"0.1.0"}""", false)]
    [InlineData("""{"version":123}""", false)]
    [InlineData("not json", false)]
    [InlineData(null, false)]
    [InlineData("", false)]
    public void LooksLikeWinReleaseHelperInfoResponse_OnlyAcceptsAGenuineVersionString(string? body, bool expected)
    {
        Assert.Equal(expected, HelperStartup.LooksLikeWinReleaseHelperInfoResponse(body));
    }

    [Fact]
    public async Task IsAnotherHelperAlreadyRunningAsync_ReturnsTrueWhenTheProbeLooksLikeAHelper()
    {
        using var client = new HttpClient(new StubHandler(_ =>
            new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("""{"version":"0.1.0"}""") }));

        var result = await HelperStartup.IsAnotherHelperAlreadyRunningAsync(client, "http://127.0.0.1:5601", "X-WinRelease-Helper", CancellationToken.None);

        Assert.True(result);
    }

    [Fact]
    public async Task IsAnotherHelperAlreadyRunningAsync_SendsTheRequiredHelperHeader()
    {
        HttpRequestMessage? captured = null;
        using var client = new HttpClient(new StubHandler(request =>
        {
            captured = request;
            return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("""{"version":"0.1.0"}""") };
        }));

        await HelperStartup.IsAnotherHelperAlreadyRunningAsync(client, "http://127.0.0.1:5601", "X-WinRelease-Helper", CancellationToken.None);

        Assert.True(captured!.Headers.Contains("X-WinRelease-Helper"));
    }

    [Fact]
    public async Task IsAnotherHelperAlreadyRunningAsync_ReturnsFalseOnANonSuccessStatus()
    {
        using var client = new HttpClient(new StubHandler(_ => new HttpResponseMessage(HttpStatusCode.NotFound)));

        var result = await HelperStartup.IsAnotherHelperAlreadyRunningAsync(client, "http://127.0.0.1:5601", "X-WinRelease-Helper", CancellationToken.None);

        Assert.False(result);
    }

    [Fact]
    public async Task IsAnotherHelperAlreadyRunningAsync_ReturnsFalseWhenNothingIsListening()
    {
        using var client = new HttpClient(new StubHandler(_ => throw new HttpRequestException("Connection refused")));

        var result = await HelperStartup.IsAnotherHelperAlreadyRunningAsync(client, "http://127.0.0.1:5601", "X-WinRelease-Helper", CancellationToken.None);

        Assert.False(result);
    }

    private sealed class StubHandler(Func<HttpRequestMessage, HttpResponseMessage> respond) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) =>
            Task.FromResult(respond(request));
    }
}
