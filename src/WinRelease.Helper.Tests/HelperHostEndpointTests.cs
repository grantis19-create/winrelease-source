using System.IO.Compression;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Xunit;

namespace WinRelease.Helper.Tests;

public sealed class HelperHostEndpointTests : IClassFixture<WinReleaseHelperFactory>
{
    private const string HelperHeaderName = "X-WinRelease-Helper";

    private readonly WinReleaseHelperFactory _factory;

    public HelperHostEndpointTests(WinReleaseHelperFactory factory) => _factory = factory;

    private static object ManifestFor(string file = "app.exe") => new
    {
        schemaVersion = 1,
        upgradeCode = Guid.NewGuid(),
        name = "Helper Host Test App",
        manufacturer = "WinRelease Tests",
        displayVersion = "1.0.0",
        targetDirectory = "[ProgramFiles64Folder]",
        architecture = "x64",
        files = new
        {
            declared = new[] { new { id = "MainExe", sourcePath = file, installPath = file, root = "installFolder" } },
            harvest = Array.Empty<object>(),
        },
        shortcuts = Array.Empty<object>(),
        registry = Array.Empty<object>(),
    };

    private static byte[] ZipOf(params (string Name, string Content)[] entries)
    {
        using var stream = new MemoryStream();
        using (var archive = new ZipArchive(stream, ZipArchiveMode.Create, leaveOpen: true))
        {
            foreach (var (name, content) in entries)
            {
                using var writer = new StreamWriter(archive.CreateEntry(name).Open());
                writer.Write(content);
            }
        }

        return stream.ToArray();
    }

    private static MultipartFormDataContent BuildForm(object manifest, byte[] zip)
    {
        var form = new MultipartFormDataContent();
        var manifestPart = new StringContent(JsonSerializer.Serialize(manifest), Encoding.UTF8, "application/json");
        form.Add(manifestPart, "manifest", "winrelease.json");
        var zipPart = new ByteArrayContent(zip);
        zipPart.Headers.ContentType = new MediaTypeHeaderValue("application/zip");
        form.Add(zipPart, "sources", "sources.zip");
        return form;
    }

    /// <summary>Every request in this fixture that hits /api/* needs this - it's the thing under test for most of the other cases, not incidental setup.</summary>
    private static HttpClient ClientWithHelperHeader(WinReleaseHelperFactory factory)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add(HelperHeaderName, "1");
        return client;
    }

    [Fact]
    public async Task Health_IsOpen_NoHelperHeaderNeeded()
    {
        using var client = _factory.CreateClient();
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/health")).StatusCode);
    }

    [Fact]
    public async Task ApiRoute_WithoutHelperHeader_IsRejectedBeforeItRuns()
    {
        using var client = _factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/manifest/parse", ManifestFor());

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Info_ReturnsAVersion()
    {
        using var client = ClientWithHelperHeader(_factory);

        var body = await (await client.GetAsync("/api/info")).Content.ReadFromJsonAsync<JsonElement>();

        Assert.False(string.IsNullOrWhiteSpace(body.GetProperty("version").GetString()));
    }

    /// <summary>ADR 0106: only a strictly newer Helper may ask this one to quit. (The accepting case would stop the shared test host, so it is covered by ShouldYieldTo below.)</summary>
    [Theory]
    [InlineData("0.0.1")]
    [InlineData(HelperVersion.Current)]
    [InlineData("not-a-version")]
    [InlineData(null)]
    public async Task Quit_FromAnythingButANewerHelper_IsRefused(string? version)
    {
        using var client = ClientWithHelperHeader(_factory);

        var response = await client.PostAsJsonAsync("/api/quit", new { version });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/info")).StatusCode); // still running
    }

    [Fact]
    public async Task Quit_WithoutHelperHeader_IsRejected()
    {
        using var client = _factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/quit", new { version = "99.0.0" });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Theory]
    [InlineData("0.1.3", "0.1.4", true)]
    [InlineData("0.1.3", "0.2.0", true)]
    [InlineData("0.1.3", "0.1.3", false)]
    [InlineData("0.1.3", "0.1.2", false)]
    [InlineData("0.1.3", "garbage", false)]
    [InlineData("0.1.3", null, false)]
    public void ShouldYieldTo_OnlyForAStrictlyNewerVersion(string current, string? requested, bool expected) =>
        Assert.Equal(expected, HelperStartup.ShouldYieldTo(current, requested));

    /// <summary>The setup checklist in the Console's Helper guide reads these two fields (values depend on the machine running the test).</summary>
    [Fact]
    public async Task Info_ReportsTheWixAndDotnetSdkSetupState()
    {
        using var client = ClientWithHelperHeader(_factory);

        var body = await (await client.GetAsync("/api/info")).Content.ReadFromJsonAsync<JsonElement>();

        Assert.True(body.GetProperty("wixAvailable").ValueKind is JsonValueKind.True or JsonValueKind.False);
        Assert.True(body.GetProperty("dotnetSdkVersion").ValueKind is JsonValueKind.String or JsonValueKind.Null);
    }

    [Fact]
    public async Task ManifestParse_WithHelperHeader_Works()
    {
        using var client = ClientWithHelperHeader(_factory);

        var response = await client.PostAsJsonAsync("/api/manifest/parse", ManifestFor());

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Helper Host Test App", body.GetProperty("name").GetString());
    }

    [Fact]
    public async Task ManifestParse_InvalidManifest_ReturnsValidationProblem()
    {
        using var client = ClientWithHelperHeader(_factory);

        var response = await client.PostAsJsonAsync("/api/manifest/parse", new { schemaVersion = 1, name = "" });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task UpgradeCode_IsDeterministicForTheSameNameAndManufacturer()
    {
        using var client = ClientWithHelperHeader(_factory);

        var first = await (await client.PostAsJsonAsync("/api/manifest/upgrade-code", new { name = "Studio", manufacturer = "Acme" })).Content.ReadFromJsonAsync<JsonElement>();
        var second = await (await client.PostAsJsonAsync("/api/manifest/upgrade-code", new { name = "Studio", manufacturer = "Acme" })).Content.ReadFromJsonAsync<JsonElement>();

        Assert.Equal(first.GetProperty("upgradeCode").GetString(), second.GetProperty("upgradeCode").GetString());
    }

    [Theory]
    [InlineData("GET", "/api/projects")]
    [InlineData("POST", "/api/accounts")]
    [InlineData("POST", "/api/dev/token")]
    [InlineData("POST", "/api/package/intune")]
    [InlineData("POST", "/api/manifest/parse-wxs")]
    public async Task AdvancedProductRoutes_AreNotMapped(string method, string path)
    {
        using var client = ClientWithHelperHeader(_factory);

        var response = await client.SendAsync(new HttpRequestMessage(new HttpMethod(method), path));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Root_ServesNoConsoleShell_HelperIsApiOnly()
    {
        using var client = _factory.CreateClient();

        var response = await client.GetAsync("/");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Build_WithoutFormContent_ReturnsBadRequest()
    {
        using var client = ClientWithHelperHeader(_factory);

        var response = await client.PostAsync("/api/build", new StringContent("{}", Encoding.UTF8, "application/json"));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Build_WithInvalidManifest_ReturnsValidationProblemBeforeRunningWix()
    {
        using var client = ClientWithHelperHeader(_factory);
        using var form = BuildForm(new { schemaVersion = 1, name = "" }, ZipOf(("app.exe", "x")));

        var response = await client.PostAsync("/api/build", form);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    /// <summary>
    /// A real CORS preflight (OPTIONS + Access-Control-Request-*) from an allow-listed origin is
    /// approved - confirms the policy is actually wired up, not just configured and ignored.
    /// </summary>
    [Fact]
    public async Task CorsPreflight_FromAllowedOrigin_IsApproved()
    {
        using var client = _factory.CreateClient();
        using var preflight = new HttpRequestMessage(HttpMethod.Options, "/api/manifest/parse");
        preflight.Headers.Add("Origin", WinReleaseHelperFactory.AllowedOrigin);
        preflight.Headers.Add("Access-Control-Request-Method", "POST");
        preflight.Headers.Add("Access-Control-Request-Headers", $"Content-Type, {HelperHeaderName}");

        var response = await client.SendAsync(preflight);

        Assert.True(response.IsSuccessStatusCode);
        Assert.Equal(WinReleaseHelperFactory.AllowedOrigin, response.Headers.GetValues("Access-Control-Allow-Origin").Single());
    }

    /// <summary>ADR 0099: Chromium's Private Network Access preflight is answered, but only for an allow-listed origin.</summary>
    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task PrivateNetworkPreflight_IsAnsweredOnlyForAnAllowedOrigin(bool allowed)
    {
        using var client = _factory.CreateClient();
        using var preflight = new HttpRequestMessage(HttpMethod.Options, "/api/manifest/parse");
        preflight.Headers.Add("Origin", allowed ? WinReleaseHelperFactory.AllowedOrigin : WinReleaseHelperFactory.DisallowedOrigin);
        preflight.Headers.Add("Access-Control-Request-Method", "POST");
        preflight.Headers.Add("Access-Control-Request-Headers", $"Content-Type, {HelperHeaderName}");
        preflight.Headers.Add("Access-Control-Request-Private-Network", "true");

        var response = await client.SendAsync(preflight);

        Assert.Equal(allowed, response.Headers.Contains("Access-Control-Allow-Private-Network"));
    }

    /// <summary>ADR 0099: a request addressed to a non-loopback Host (a DNS-rebinding page) is refused before any route runs.</summary>
    [Theory]
    [InlineData("evil.example.test", 421)]
    [InlineData("localhost", 200)]
    [InlineData("127.0.0.1", 200)]
    public async Task HostHeader_MustBeALoopbackName(string host, int expectedStatus)
    {
        using var client = _factory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Get, "/health");
        request.Headers.Host = host;

        var response = await client.SendAsync(request);

        Assert.Equal(expectedStatus, (int)response.StatusCode);
    }

    /// <summary>
    /// The same preflight from an origin that was never configured gets no Access-Control-Allow-*
    /// headers back - the browser (not this test) is what actually enforces that into a block, but
    /// the absence of those headers is the server-side half of that enforcement.
    /// </summary>
    [Fact]
    public async Task CorsPreflight_FromDisallowedOrigin_GetsNoAllowOriginHeader()
    {
        using var client = _factory.CreateClient();
        using var preflight = new HttpRequestMessage(HttpMethod.Options, "/api/manifest/parse");
        preflight.Headers.Add("Origin", WinReleaseHelperFactory.DisallowedOrigin);
        preflight.Headers.Add("Access-Control-Request-Method", "POST");
        preflight.Headers.Add("Access-Control-Request-Headers", $"Content-Type, {HelperHeaderName}");

        var response = await client.SendAsync(preflight);

        Assert.False(response.Headers.Contains("Access-Control-Allow-Origin"));
    }

    /// <summary>
    /// Caught by an actual cross-origin browser fetch, not assumed from reading the CORS config: a
    /// browser only exposes a small CORS-safelisted set of response headers to JS by default
    /// (Content-Type, Content-Length, etc.) - Content-Disposition and the Wix-log headers aren't in
    /// it, so without WithExposedHeaders a real build's filename/log silently went missing client-side
    /// even though the server-side response genuinely carried them (this test's own HttpClient has no
    /// such restriction, which is exactly why the gap wasn't visible to the earlier TestServer-only
    /// coverage - only a real browser enforces it).
    /// </summary>
    [Fact]
    public async Task CrossOriginResponse_ExposesTheFilenameAndWixLogHeadersToBrowserJs()
    {
        using var client = ClientWithHelperHeader(_factory);
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/manifest/parse")
        {
            Content = JsonContent.Create(ManifestFor()),
        };
        request.Headers.Add("Origin", WinReleaseHelperFactory.AllowedOrigin);

        var response = await client.SendAsync(request);

        var exposed = string.Join(",", response.Headers.GetValues("Access-Control-Expose-Headers"));
        Assert.Contains("Content-Disposition", exposed);
        Assert.Contains("X-Wix-StdOut-Base64", exposed);
        Assert.Contains("X-Wix-StdErr-Base64", exposed);
    }

    /// <summary>Requires the real `wix` CLI on PATH and a real Windows msi.dll - same reason as WixCompilerIntegrationTests.</summary>
    [Trait("Category", "Integration")]
    [Fact]
    public async Task Build_ProducesARealMsi_AndExposesTheWixLogHeaders()
    {
        using var client = ClientWithHelperHeader(_factory);
        using var form = BuildForm(ManifestFor(), ZipOf(("app.exe", "fake exe payload")));

        var response = await client.PostAsync("/api/build", form);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var bytes = await response.Content.ReadAsByteArrayAsync();
        // An .msi is an OLE compound file.
        Assert.True(bytes.Length > 8 && bytes[0] == 0xD0 && bytes[1] == 0xCF && bytes[2] == 0x11 && bytes[3] == 0xE0, "Response is not an OLE compound file (.msi).");
        Assert.EndsWith(".msi", response.Content.Headers.ContentDisposition!.FileName!.Trim('"'));
        Assert.True(response.Headers.Contains("X-Wix-StdOut-Base64"));
        Assert.True(response.Headers.Contains("X-Wix-StdErr-Base64"));
        // ADR 0120: each build gets its own random ProductCode, reported so the Console can show the one inside the MSI.
        Assert.True(Guid.TryParse(response.Headers.GetValues("X-Product-Code").Single(), out var builtCode) && builtCode != Guid.Empty);
    }

    /// <summary>Requires the real `wix` CLI on PATH.</summary>
    [Trait("Category", "Integration")]
    [Fact]
    public async Task Build_WhenWixRejectsThePackage_Returns422WithTheNativeLog()
    {
        using var client = ClientWithHelperHeader(_factory);
        // A source file the zip does not contain - wix itself should report it.
        using var form = BuildForm(ManifestFor(), ZipOf(("other.txt", "x")));

        var response = await client.PostAsync("/api/build", form);

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.False(string.IsNullOrWhiteSpace(body.GetProperty("standardError").GetString() + body.GetProperty("standardOutput").GetString()));
    }
}
