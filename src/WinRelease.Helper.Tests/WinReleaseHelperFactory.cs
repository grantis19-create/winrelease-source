using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;

namespace WinRelease.Helper.Tests;

/// <summary>Fixes a known, single allowed origin so CORS behavior is testable without depending on appsettings.json's real (and eventually production) allow-list.</summary>
public sealed class WinReleaseHelperFactory : WebApplicationFactory<Program>
{
    public const string AllowedOrigin = "https://console.example.test";
    public const string DisallowedOrigin = "https://attacker.example.test";

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.ConfigureAppConfiguration((_, configuration) =>
            configuration.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Cors:AllowedOrigins:0"] = AllowedOrigin,
            }));
    }
}
