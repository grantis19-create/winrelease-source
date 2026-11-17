using System.IO;
using System.Net;
using System.Net.Http.Json;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Http.Features;
using WinRelease.Helper;
using WinRelease.Core.Compilation;
using WinRelease.Core.Manifest;

// WinRelease.Helper: the local half of the dual-distribution model
// (docs/roadmap/helper-exe-strategy.md). A native Windows process a customer runs on their own
// machine so a *hosted* Console (static site, no Windows/wix of its own) can still produce a real
// .msi without any of the customer's source files leaving that machine. API-only - no Console UI of
// its own, unlike WinRelease.Local (which still serves the Console directly for the single-process
// MVP model; that model is unchanged and this is additive, not a replacement). Same manifest/build
// contract (MsiBuildPipeline) as WinRelease.Local and WinRelease.API/BuildWorker - a build behaves
// identically regardless of which of the three hosts ran it.
//
// Reachable from a public page's own origin, so two things a same-origin host never had to worry
// about are real here: CORS (see below, origin allow-list - never AllowAnyOrigin) and the fact that
// a CORS allow-list alone still lets a cross-origin "simple request" (certain POSTs) reach a route
// and run before the browser enforces anything on the response - the required-header middleware
// further down closes that by rejecting any /api/* request missing a custom header a cross-origin
// fetch can only send by first passing a real CORS preflight (which the origin allow-list gates).
// ADR 0102: the released (Release-configuration) exe is windowless - a tray icon, a log file, one instance, and it exits by itself once the
// website has been closed for a while. Debug builds, `dotnet run` and the tests keep the console. `--tray` / `--console` override either way.
#if HELPER_TRAY
const bool TrayByDefault = true;
#else
const bool TrayByDefault = false;
#endif
const string SiteUrl = "https://winrelease.geappsolutions.com";
var trayMode = OperatingSystem.IsWindows() && (TrayByDefault || args.Contains("--tray")) && !args.Contains("--console");
var launchedFromLink = args.Any(a => a.StartsWith(HelperTray.LinkScheme + ":", StringComparison.OrdinalIgnoreCase));
// The link's text is only a "start" signal. It must never reach the configuration system, which would read anything shaped like key=value (ADR 0105).
var hostArgs = HelperStartup.HostArguments(args);
var logPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "WinRelease", "helper.log");

// ADR 0110: "--uninstall" (Apps & features, or by hand) removes the Helper; "--quiet" skips the question.
if (OperatingSystem.IsWindows() && args.Contains("--uninstall", StringComparer.OrdinalIgnoreCase))
{
    var quiet = args.Contains("--quiet", StringComparer.OrdinalIgnoreCase);
    if (HelperInstall.Uninstall(askFirst: !quiet) && !quiet) HelperTray.Notify("WinRelease Helper has been removed.");
    return;
}

// ADR 0110: a copy run from Downloads (or anywhere else) installs itself into its permanent per-user folder and starts that copy instead.
if (trayMode && !HelperInstall.IsInstalledCopy(Environment.ProcessPath) && await HelperInstall.InstallAndStartAsync(args, HelperVersion.Current, launchedFromLink))
{
    return;
}

Mutex? singleInstance = null;
if (trayMode && !HelperTray.TryBecomeTheOnlyInstance(out singleInstance))
{
    // Started again (double-click, or the website's Start button). A newer exe takes over from an older running one (ADR 0106); otherwise
    // there is nothing to do, and only a manual second launch is told why.
    var tookOver = false;
    using (var takeoverClient = new HttpClient { Timeout = TimeSpan.FromSeconds(2) })
    {
        if (await HelperStartup.AskOlderHelperToQuitAsync(takeoverClient, "http://127.0.0.1:5601", "X-WinRelease-Helper", HelperVersion.Current))
        {
            for (var attempt = 0; attempt < 40 && !tookOver; attempt++)
            {
                await Task.Delay(250);
                tookOver = HelperTray.TryBecomeTheOnlyInstance(out singleInstance);
            }
        }
    }

    if (!tookOver)
    {
        if (!launchedFromLink) HelperTray.Notify("WinRelease Helper is already running - look for its icon near the clock (click the ^ if it is hidden).");
        return;
    }
}

var builder = WebApplication.CreateBuilder(hostArgs);

// Standalone exe with no appsettings.json next to it: listen on the loopback port the Console expects (ADR 0101/0102).
if (string.IsNullOrWhiteSpace(builder.Configuration["Urls"]))
{
    builder.WebHost.UseUrls("http://127.0.0.1:5601");
}

// ADR 0111: the Helper only ever listens on this PC. A wildcard or network address (--urls=http://0.0.0.0:..., an ASPNETCORE_URLS variable,
// a Kestrel endpoint in configuration) would expose it to the network and make Windows Firewall ask whether to allow it, so refuse before
// anything binds. The per-connection loopback check further down stays as a second layer.
var networkUrls = HelperStartup.NonLoopbackUrls(builder.Configuration);
if (networkUrls.Count > 0)
{
    var refusal =
        $"WinRelease Helper only runs on your own computer, so it will not listen on {string.Join(", ", networkUrls)}. " +
        "Use an address like http://127.0.0.1:5601, or remove the --urls setting or ASPNETCORE_URLS variable that set it.";
    Console.Error.WriteLine(refusal);
    if (trayMode) HelperTray.Notify(refusal);
    singleInstance?.Dispose();
    Environment.ExitCode = 2;
    return;
}

const string ConsoleCorsPolicy = "Console";
const string HelperHeaderName = "X-WinRelease-Helper";

// A bare local tool run from a console window has no business writing to the Windows Event Log -
// WebApplication.CreateBuilder adds that provider by default on Windows. Caught live, not assumed:
// on a failed Kestrel bind (the port-conflict path below), the host begins tearing down its logging
// providers as part of handling the StartAsync failure, and a LogError call made after that race lost
// - ObjectDisposedException thrown from inside the EventLog provider, masking the real error this was
// trying to report. Console is enough; whoever is running this already has a console window open.
builder.Logging.ClearProviders();
if (trayMode)
{
    builder.Logging.AddProvider(new HelperFileLoggerProvider(logPath));
}
else
{
    builder.Logging.AddConsole();
}

builder.Services.AddHealthChecks();
builder.Services.ConfigureHttpJsonOptions(options =>
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.CamelCase)));

// Read lazily via a captured variable, not a one-time snapshot of builder.Configuration - a test
// host (WebApplicationFactory.ConfigureWebHost -> ConfigureAppConfiguration) only finishes layering
// its config overrides in during builder.Build() below, so a value resolved from builder.Configuration
// *before* that call (as a plain local variable) would silently miss them. SetIsOriginAllowed's
// predicate runs per-request, long after Build() has returned and allowedOrigins has been reassigned
// to the real, fully-merged value - the closure sees that reassignment, not the empty array it
// captured at registration time.
var allowedOrigins = Array.Empty<string>();
builder.Services.AddCors(options =>
    options.AddPolicy(ConsoleCorsPolicy, policy =>
        // An empty allow-list (nothing configured) intentionally allows nothing cross-origin -
        // fails closed, not open, if deployed without Cors:AllowedOrigins set.
        policy.SetIsOriginAllowed(origin => allowedOrigins.Contains(origin, StringComparer.OrdinalIgnoreCase))
            // WithHeaders lists exactly what a cross-origin request may send - Content-Type (the
            // multipart build upload) and the helper header itself. Anything else in a preflight
            // request is refused before it reaches a route at all.
            .WithMethods("GET", "POST")
            .WithHeaders("Content-Type", HelperHeaderName)
            // Caught by actually building through a real cross-origin browser fetch, not assumed:
            // without this, none of these response headers are readable from JS at all - only a
            // small CORS-safelisted set (Content-Type, Content-Length, etc.) is exposed by default,
            // and Content-Disposition/the Wix-log headers aren't in it. Same-origin (WinRelease.Local,
            // WinRelease.API behind the Vite proxy) never hit this, since the browser only restricts
            // response-header visibility on genuinely cross-origin responses - exactly the case a
            // helper is for. Without it, apiUploadForBlobToBackend's filename regex silently falls
            // back to "artifact.bin" and the build log panel stays empty, no error thrown either way.
            .WithExposedHeaders("Content-Disposition", "X-Wix-StdOut-Base64", "X-Wix-StdErr-Base64")));

var maxUploadBytes = builder.Configuration.GetValue("Limits:MaxUploadMegabytes", 200) * 1024L * 1024L;
builder.WebHost.ConfigureKestrel(options => options.Limits.MaxRequestBodySize = maxUploadBytes);
builder.Services.Configure<FormOptions>(options => options.MultipartBodyLengthLimit = maxUploadBytes);

const long MaxManifestBytes = 1024 * 1024;
builder.Services.AddSingleton(sp => new BuildGate(sp.GetRequiredService<IConfiguration>().GetValue("Limits:MaxConcurrentBuilds", 2)));

var app = builder.Build();

// Now safe to read - app.Configuration reflects every config source, test overrides included.
// Configured list wins (dev appsettings.json, tests); with nothing configured - the standalone exe - only the production site is allowed.
allowedOrigins = app.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() is { Length: > 0 } configuredOrigins ? configuredOrigins : [SiteUrl];

// Idle exit (ADR 0102): the Console pings /health while a tab is open; once nothing has called for a while the tray Helper quits by itself.
// Builds in flight count as activity. Before the first request there is a longer grace period for the person to open the site.
var activity = new HelperActivity();
app.Use(async (context, next) =>
{
    activity.Begin();
    try
    {
        await next();
    }
    finally
    {
        activity.End();
    }
});
var idleExitMinutes = app.Configuration.GetValue("Helper:IdleExitMinutes", trayMode ? 3 : 0);
if (idleExitMinutes > 0)
{
    _ = Task.Run(async () =>
    {
        var idleLimit = TimeSpan.FromMinutes(idleExitMinutes);
        var startupGrace = TimeSpan.FromMinutes(Math.Max(idleExitMinutes, 10));
        while (!app.Lifetime.ApplicationStopping.IsCancellationRequested)
        {
            try
            {
                await Task.Delay(TimeSpan.FromSeconds(15), app.Lifetime.ApplicationStopping);
            }
            catch (OperationCanceledException)
            {
                return;
            }

            if (activity.ActiveRequests == 0 && activity.IdleFor > (activity.SeenAnyRequest ? idleLimit : startupGrace))
            {
                app.Logger.LogInformation("No activity for {Minutes} minutes - the website is closed, so the Helper is exiting.", idleExitMinutes);
                app.Lifetime.StopApplication();
                return;
            }
        }
    });
}

// ADR 0099: DNS-rebinding guard. A hostile page can point its own domain at 127.0.0.1 and then talk to this process as "same
// origin" with no CORS check at all; the tell is a Host header that is not a loopback name. Real callers (the Console, curl, tests)
// always address the helper as 127.0.0.1, localhost or [::1].
app.Use(async (context, next) =>
{
    if (!HelperStartup.IsLocalCaller(context.Connection.RemoteIpAddress))
    {
        context.Response.StatusCode = StatusCodes.Status403Forbidden;
        await context.Response.WriteAsJsonAsync(new { error = "The WinRelease helper only answers programs on the computer it is running on." });
        return;
    }

    var host = context.Request.Host.Host;
    if (!(host is "127.0.0.1" or "localhost" or "[::1]" or "::1"))
    {
        context.Response.StatusCode = StatusCodes.Status421MisdirectedRequest;
        await context.Response.WriteAsJsonAsync(new { error = "The WinRelease helper only answers requests addressed to a loopback name." });
        return;
    }

    // Chromium's Private Network Access preflight: a public page reaching a loopback address asks for this explicitly.
    // Only answered for an allow-listed origin, so it grants nothing the CORS policy below does not.
    if (context.Request.Headers.ContainsKey("Access-Control-Request-Private-Network")
        && context.Request.Headers.TryGetValue("Origin", out var origin)
        && allowedOrigins.Contains(origin.ToString(), StringComparer.OrdinalIgnoreCase))
    {
        context.Response.OnStarting(() =>
        {
            context.Response.Headers["Access-Control-Allow-Private-Network"] = "true";
            return Task.CompletedTask;
        });
    }

    await next();
});

app.UseCors(ConsoleCorsPolicy);

// Every /api/* route (not /health - the Console pings that first, before it's decided to use this
// helper at all, so it can't already be sending a header that implies that decision) requires this
// header. A same-origin request (this process's own tests, curl, Postman) must set it too - the
// point isn't "prove you're the real Console", it's "force any cross-origin caller through a real
// CORS preflight first", which only an allow-listed origin can pass. OPTIONS is exempt outright - a
// preflight request can never legitimately carry this header (the browser sends it, per CORS spec,
// only on the real request a successful preflight unblocks), so checking for it here would reject
// every preflight before UseCors above ever gets to answer it.
app.Use(async (context, next) =>
{
    if (context.Request.Method != HttpMethods.Options
        && context.Request.Path.StartsWithSegments("/api")
        && !context.Request.Headers.ContainsKey(HelperHeaderName))
    {
        context.Response.StatusCode = StatusCodes.Status400BadRequest;
        await context.Response.WriteAsJsonAsync(new { error = $"Missing required '{HelperHeaderName}' header." });
        return;
    }

    await next();
});

app.MapHealthChecks("/health");

// A lightweight liveness/version probe distinct from /health - lets the Console show "helper vX.Y.Z
// is running" and, later, a "newer helper available" banner (docs/roadmap/helper-exe-strategy.md's
// Distribution section) without parsing /health's plain-text body.
// Whether the `wix` tool is installed: a downloaded Helper is self-contained, but the MSI compiler it drives is not (ADR 0101).
// Checked lazily, so a missing tool is reported to the Console instead of surfacing as a confusing build failure; a "not found" answer is looked at
// again every few seconds (SetupCheck), because the usual first-run order installs the Helper first and WiX afterwards.
var wixAvailable = new SetupCheck<bool>(() =>
{
    try
    {
        var runner = new SystemProcessRunner();
        return runner.Run(new ProcessStartRequest("wix", ["--version"], Directory.GetCurrentDirectory(), TimeSpan.FromSeconds(15))).ExitCode == 0;
    }
    catch
    {
        return false;
    }
}, found => found, TimeSpan.FromSeconds(4));

// Whether the WiX UI extension (the installer screens) is added. Only worth asking once the tool itself is there; looked at again while missing, like the others.
var wixUiExtension = new SetupCheck<bool>(() =>
{
    try
    {
        if (!wixAvailable.Value) return false;
        var result = new SystemProcessRunner().Run(new ProcessStartRequest("wix", ["extension", "list", "--global", "-acceptEula", "wix7"], Directory.GetCurrentDirectory(), TimeSpan.FromSeconds(20)));
        return result.ExitCode == 0 && WixSetup.ListShowsUiExtension(result.StandardOutput);
    }
    catch
    {
        return false;
    }
}, found => found, TimeSpan.FromSeconds(4));

// The highest installed .NET SDK version, or null when `dotnet` is missing or has no SDK. The Console cannot see this from a browser, and
// "dotnet tool install" (the WiX setup step) needs an SDK, so a non-technical user is told which of the two setup steps is missing.
var dotnetSdkVersion = new SetupCheck<string?>(() =>
{
    try
    {
        var runner = new SystemProcessRunner();
        var result = runner.Run(new ProcessStartRequest("dotnet", ["--list-sdks"], Directory.GetCurrentDirectory(), TimeSpan.FromSeconds(15)));
        if (result.ExitCode != 0) return null;
        return result.StandardOutput
            .Split('\n', StringSplitOptions.RemoveEmptyEntries)
            .Select(line => line.Split(' ')[0].Trim())
            .Where(v => Version.TryParse(v.Split('-')[0], out _))
            .OrderByDescending(v => Version.Parse(v.Split('-')[0]))
            .FirstOrDefault();
    }
    catch
    {
        return null;
    }
}, version => version is not null, TimeSpan.FromSeconds(4));

app.MapGet("/api/info", () => Results.Ok(new HelperInfo(HelperVersion.Current, wixAvailable.Value, dotnetSdkVersion.Value, wixUiExtension.Value)));

// A newer Helper started on the same PC asks the running older one to quit so it can take over (ADR 0106). Same origin/header/host guards as
// every /api route; refused unless the caller really is a newer version, so it cannot be used to stop an up-to-date Helper.
app.MapPost("/api/quit", (QuitRequest request, IHostApplicationLifetime lifetime) =>
{
    if (!HelperStartup.ShouldYieldTo(HelperVersion.Current, request.Version))
    {
        return Results.Conflict(new { error = "This Helper is not older than the one asking." });
    }

    _ = Task.Run(async () =>
    {
        await Task.Delay(300); // let this response go out first
        lifetime.StopApplication();
    });
    return Results.Accepted();
});

app.MapPost("/api/manifest/parse", [Microsoft.AspNetCore.Mvc.RequestSizeLimit(1024 * 1024)] async (HttpRequest request) =>
{
    using var reader = new StreamReader(request.Body);
    var json = await reader.ReadToEndAsync();

    var result = ManifestParser.Parse(json);

    return result.IsSuccess
        ? Results.Ok(result.Manifest)
        : Results.ValidationProblem(result.Errors.ToDictionary(kv => kv.Key, kv => kv.Value));
});

app.MapPost("/api/manifest/upgrade-code", (UpgradeCodeRequest request) =>
{
    if (string.IsNullOrWhiteSpace(request.Name) || string.IsNullOrWhiteSpace(request.Manufacturer))
    {
        return Results.ValidationProblem(new Dictionary<string, string[]>
        {
            ["name"] = ["Name and Manufacturer are both required to generate a deterministic UpgradeCode."],
        });
    }

    return Results.Ok(new UpgradeCodeResponse(UpgradeCodeGenerator.For(request.Name, request.Manufacturer)));
});

// Same wire contract WinRelease.Local/WinRelease.API's /api/build already use (ADR 0026): multipart
// 'manifest' + 'sources', .msi bytes back, a 422 { standardOutput, standardError } on a compile
// failure, the captured wix output base64'd into response headers on success.
app.MapPost("/api/build", async (HttpRequest request, BuildGate gate) =>
{
    if (!request.HasFormContentType)
    {
        return Results.BadRequest(new { error = "Expected multipart/form-data with 'manifest' and 'sources' parts." });
    }

    IFormCollection form;
    try
    {
        form = await request.ReadFormAsync();
    }
    catch (BadHttpRequestException bad)
    {
        // Kestrel's own refusal (body over the upload limit, framing error): keep its status instead of a 500.
        return Results.Json(new { error = bad.Message }, statusCode: bad.StatusCode);
    }
    catch (Exception ex) when (ex is InvalidDataException or IOException or OverflowException or ArgumentException)
    {
        // A malformed or truncated multipart body is the caller's problem (found by UAT T7: it was an unhandled 500).
        return Results.BadRequest(new { error = "The upload isn't valid multipart form data." });
    }
    var manifestFile = form.Files["manifest"];
    var sourcesFile = form.Files["sources"];

    if (manifestFile is null || sourcesFile is null)
    {
        return Results.BadRequest(new { error = "Both 'manifest' (winrelease.json) and 'sources' (zip) form parts are required." });
    }

    if (manifestFile.Length > MaxManifestBytes)
    {
        return Results.BadRequest(new { error = $"The manifest part is larger than {MaxManifestBytes / 1024} KB." });
    }

    string manifestJson;
    using (var reader = new StreamReader(manifestFile.OpenReadStream()))
    {
        manifestJson = await reader.ReadToEndAsync();
    }

    var parseResult = ManifestParser.Parse(manifestJson);
    if (!parseResult.IsSuccess)
    {
        return Results.ValidationProblem(parseResult.Errors.ToDictionary(kv => kv.Key, kv => kv.Value));
    }

    // At most Limits:MaxConcurrentBuilds compiles at once; past that, refuse rather than queue without bound.
    using var buildSlot = gate.TryEnter();
    if (buildSlot is null)
    {
        request.HttpContext.Response.Headers.RetryAfter = "30";
        return Results.Json(new { error = "The build service is busy. Try again in a moment." }, statusCode: StatusCodes.Status503ServiceUnavailable);
    }

    try
    {
    await using var sourcesStream = sourcesFile.OpenReadStream();
    var outcome = await MsiBuildPipeline.RunAsync(
        parseResult.Manifest!, sourcesStream, new SystemProcessRunner(), request.HttpContext.RequestAborted,
        request.HttpContext.RequestServices.GetRequiredService<IConfiguration>().GetSection("Limits").Get<BuildLimits>());

    if (!outcome.Succeeded)
    {
        return Results.Json(
            new { title = WixSetup.FailureTitle(outcome.StandardOutput, outcome.StandardError), standardOutput = outcome.StandardOutput, standardError = outcome.StandardError },
            statusCode: StatusCodes.Status422UnprocessableEntity);
    }

    request.HttpContext.Response.Headers["X-Wix-StdOut-Base64"] = Convert.ToBase64String(Encoding.UTF8.GetBytes(outcome.StandardOutput ?? ""));
    request.HttpContext.Response.Headers["X-Wix-StdErr-Base64"] = Convert.ToBase64String(Encoding.UTF8.GetBytes(outcome.StandardError ?? ""));

    return Results.File(outcome.MsiBytes!, "application/octet-stream", outcome.FileName);
    }
    catch (System.ComponentModel.Win32Exception ex) when (ex.NativeErrorCode == 2)
    {
        // 'wix' is not on this PC (found by the VM first-run test, defect 73): without this the caller got an empty HTTP 500.
        return Results.Json(new { title = WixSetup.MissingToolTitle, standardOutput = "", standardError = ex.Message }, statusCode: StatusCodes.Status422UnprocessableEntity);
    }
});

var boundUrl = builder.Configuration["Urls"] ?? "http://127.0.0.1:5601";

// Open decision #1 from docs/roadmap/helper-exe-strategy.md: what happens on a port conflict. Two
// different cases, two different outcomes - a customer double-launching the Helper shouldn't see an
// error at all (there's nothing actually wrong), but something *else* already on the port is a real
// problem that deserves a clear message instead of a raw SocketException stack trace.
//
// Skipped entirely under a test host (WebApplicationFactory's TestServer, detected by its own
// registered IServer rather than by environment name - nothing here sets EnvironmentName, and
// relying on that would be guessing): a TestServer never binds a real OS port at all, so "is
// something else already using this port" is a meaningless question in that context - worse,
// answering it anyway means making a real network call to whatever happens to be reachable at
// 127.0.0.1:5601 on the machine running the tests. A real Helper left running from a manual launch
// (start-helper.ps1) answers that call honestly, correctly looks like "another Helper," and this
// code does exactly what it says: returns before app.RunAsync() ever runs - which is also exactly
// why WinRelease.Helper.Tests was failing with "the server has not been started."
var isTestHost = app.Services.GetService<Microsoft.AspNetCore.Hosting.Server.IServer>()?.GetType().FullName == "Microsoft.AspNetCore.TestHost.TestServer";
if (!isTestHost)
{
    using var probeClient = new HttpClient { Timeout = TimeSpan.FromSeconds(1) };
    if (await HelperStartup.IsAnotherHelperAlreadyRunningAsync(probeClient, boundUrl, HelperHeaderName, CancellationToken.None))
    {
        app.Logger.LogInformation(
            "A WinRelease Helper is already running at {Url} - nothing to do here. Close that window first if you need to restart it.",
            boundUrl);
        if (trayMode && !launchedFromLink)
        {
            HelperTray.Notify($"Another WinRelease Helper is already running at {boundUrl}. Close it first (or use that one).");
        }

        return;
    }
}

// Logged from ApplicationStarted, not right before RunAsync() - this only fires once Kestrel has
// actually bound the port, so a genuine bind failure (something else on the port) never gets
// followed by a confusing "is running" line right before the error below.
app.Lifetime.ApplicationStarted.Register(() => app.Logger.LogInformation(
    trayMode
        ? "WinRelease Helper v{Version} is running at {Url}. It quits by itself when the website has been closed for a few minutes."
        : "WinRelease Helper v{Version} is running at {Url} - leave this window open while you use the Console. Press Ctrl+C to stop it.",
    HelperVersion.Current, boundUrl));

app.Lifetime.ApplicationStarted.Register(() =>
{
    if (dotnetSdkVersion.Value is null)
    {
        app.Logger.LogWarning("The .NET SDK was not found. Install it first:  winget install Microsoft.DotNet.SDK.9  (then open a new terminal and start this Helper again).");
    }

    if (!wixAvailable.Value)
    {
        app.Logger.LogWarning(
            "The 'wix' tool was not found. Builds will fail until it is installed: install the .NET 9 SDK, then run  dotnet tool install --global wix --version 7.0.0  and restart this Helper.");
    }
});

HelperTray? tray = null;
if (trayMode && !isTestHost)
{
    var exePath = Environment.ProcessPath ?? "";
    HelperInstall.RefreshRegistration(exePath, HelperVersion.Current);
    tray = new HelperTray(SiteUrl, logPath, HelperVersion.Current, app.Lifetime.StopApplication, message => app.Logger.LogInformation("{Message}", message));
    tray.Start();

    var installedFrom = args.FirstOrDefault(a => a.StartsWith(HelperStartup.InstalledFromArgument, StringComparison.OrdinalIgnoreCase))?[HelperStartup.InstalledFromArgument.Length..];
    if (installedFrom is { Length: > 0 })
    {
        // Off the startup path: the message box waits for a click.
        _ = Task.Run(() => HelperTray.Notify(
            $"WinRelease Helper v{HelperVersion.Current} is installed for you in {HelperInstall.InstallFolder} and is running (orange W near the clock).\n\n" +
            $"You can delete the file you downloaded:\n{installedFrom}\n\nTo remove the Helper later: right-click its icon > Uninstall, or Settings > Apps."));
    }
}

try
{
    await app.RunAsync();
}
catch (IOException ex) when (HelperStartup.IsAddressInUseException(ex))
{
    // Console.Error, not app.Logger: a failed RunAsync() can leave the host mid-teardown, and this
    // message is the one thing that must always reach the person running this regardless of whatever
    // state the logging pipeline is in by the time this catch block runs.
    var portMessage =
        $"Couldn't start - port {new Uri(boundUrl).Port} is already being used by something else (not another WinRelease Helper, which was already checked for). " +
        "Close whatever's using it, or point this at a different port by setting \"Urls\" in appsettings.json, then try again.";
    Console.Error.WriteLine(portMessage);
    if (trayMode) HelperTray.Notify(portMessage);
    Environment.ExitCode = 1;
}
finally
{
    tray?.Dispose();
    singleInstance?.Dispose();
}

public partial class Program;

/// <summary>Request activity for the idle-exit check: how many are in flight and when the last one finished.</summary>
public sealed class HelperActivity
{
    private int _active;
    private long _lastTicks = Environment.TickCount64;

    public int ActiveRequests => Volatile.Read(ref _active);

    public bool SeenAnyRequest { get; private set; }

    public TimeSpan IdleFor => TimeSpan.FromMilliseconds(Environment.TickCount64 - Interlocked.Read(ref _lastTicks));

    public void Begin()
    {
        SeenAnyRequest = true;
        Interlocked.Increment(ref _active);
        Interlocked.Exchange(ref _lastTicks, Environment.TickCount64);
    }

    public void End()
    {
        Interlocked.Decrement(ref _active);
        Interlocked.Exchange(ref _lastTicks, Environment.TickCount64);
    }
}

public sealed record UpgradeCodeRequest(string Name, string Manufacturer);

public sealed record UpgradeCodeResponse(Guid UpgradeCode);

public sealed record HelperInfo(string Version, bool WixAvailable, string? DotnetSdkVersion, bool WixUiExtensionAvailable = false);

public sealed record QuitRequest(string? Version);

/// <summary>
/// Single source of truth for the version the Console's "a newer helper is available" check
/// (docs/roadmap/helper-exe-strategy.md) compares against. Bump by hand on release until there's a
/// real build/release pipeline to generate it - deliberately not tied to the assembly version, which
/// defaults to 1.0.0.0 unmanaged and isn't meant to carry product-release meaning.
/// </summary>
public static class HelperVersion
{
    public const string Current = "0.1.15";
}

/// <summary>
/// The port-conflict logic from the top-level Program.Main above, pulled out into testable static
/// methods - a top-level program's own locals (HelperHeaderName etc.) aren't visible to a separate
/// type in the same file, and the real behaviors (parsing a SocketException out of whatever Kestrel
/// actually throws, deciding whether an /api/info body looks like a genuine Helper) are worth unit
/// tests that don't need a real Kestrel bind to exercise.
/// </summary>
public static class HelperStartup
{
    /// <summary>
    /// Kestrel wraps a bind failure in an IOException whose inner exception is the real
    /// SocketException - walks the whole InnerException chain rather than assuming exactly one level
    /// of wrapping, since that's an implementation detail this shouldn't be brittle against.
    /// </summary>
    public static bool IsAddressInUseException(Exception? ex)
    {
        for (var current = ex; current is not null; current = current.InnerException)
        {
            if (current is SocketException { SocketErrorCode: SocketError.AddressAlreadyInUse })
            {
                return true;
            }
        }

        return false;
    }

    /// <summary>
    /// The arguments handed to the host's configuration. The link text is only a "start" signal and must never reach configuration (ADR 0105).
    /// --console/--tray are this program's own switches: passed on, the configuration reader treats a bare "--console" as a key that takes
    /// the next argument as its value, so "--console --urls=http://127.0.0.1:5602" silently lost the port (hit twice in UAT, 2026-10-28).
    /// </summary>
    public static string[] HostArguments(string[] args) => args
        .Where(a => !a.StartsWith(HelperTray.LinkScheme + ":", StringComparison.OrdinalIgnoreCase))
        .Where(a => !a.Equals("--console", StringComparison.OrdinalIgnoreCase) && !a.Equals("--tray", StringComparison.OrdinalIgnoreCase))
        .Where(a => !a.Equals("--uninstall", StringComparison.OrdinalIgnoreCase) && !a.Equals("--quiet", StringComparison.OrdinalIgnoreCase))
        .Where(a => !a.StartsWith(InstalledFromArgument, StringComparison.OrdinalIgnoreCase))
        .ToArray();

    /// <summary>Passed by a downloaded copy to the installed copy it started, so the installed one can say where the download is (ADR 0110).</summary>
    public const string InstalledFromArgument = "--installed-from=";

    /// <summary>
    /// True when a connection comes from this PC. A Helper started with <c>--urls=http://0.0.0.0:...</c> would otherwise answer the whole
    /// network, and a non-browser caller can send any Host header it likes, so the Host check alone does not stop it. A null address only
    /// happens under the in-memory test server (Kestrel always sets it for a real socket).
    /// </summary>
    public static bool IsLocalCaller(IPAddress? remoteAddress) =>
        remoteAddress is null || IPAddress.IsLoopback(remoteAddress.IsIPv4MappedToIPv6 ? remoteAddress.MapToIPv4() : remoteAddress);

    /// <summary>
    /// The configured listen addresses that are not this PC's loopback (ADR 0111): <c>Urls</c> (the --urls switch, ASPNETCORE_URLS, appsettings)
    /// and any Kestrel endpoint's <c>Url</c>. Wildcards (+, *, 0.0.0.0, [::]), LAN addresses, other host names and anything that does not parse
    /// are returned; 127.x.x.x, ::1 and localhost are fine.
    /// </summary>
    public static IReadOnlyList<string> NonLoopbackUrls(IConfiguration configuration)
    {
        var urls = SplitUrls(configuration["Urls"]).ToList();
        foreach (var endpoint in configuration.GetSection("Kestrel:Endpoints").GetChildren())
        {
            urls.AddRange(SplitUrls(endpoint["Url"]));
        }

        return urls.Where(url => !IsLoopbackUrl(url)).ToList();
    }

    public static IReadOnlyList<string> NonLoopbackUrls(string? urls) => SplitUrls(urls).Where(url => !IsLoopbackUrl(url)).ToList();

    private static IEnumerable<string> SplitUrls(string? urls) =>
        (urls ?? "").Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

    private static bool IsLoopbackUrl(string url)
    {
        // Kestrel's wildcard forms (http://+:5601, http://*:5601) are not valid URIs, so they fail here and are refused.
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri) || uri.HostNameType == UriHostNameType.Unknown) return false;
        var host = uri.Host.Trim('[', ']');
        return host.Equals("localhost", StringComparison.OrdinalIgnoreCase)
            || (IPAddress.TryParse(host, out var address) && IPAddress.IsLoopback(address));
    }

    /// <summary>True only when <paramref name="requestedVersion"/> parses and is strictly newer than <paramref name="currentVersion"/>.</summary>
    public static bool ShouldYieldTo(string currentVersion, string? requestedVersion) =>
        Version.TryParse(currentVersion, out var current)
        && Version.TryParse(requestedVersion, out var requested)
        && requested > current;

    /// <summary>Asks the Helper already running on <paramref name="baseUrl"/> to quit. True when it agreed (it is older); false for any other answer or no answer.</summary>
    public static async Task<bool> AskOlderHelperToQuitAsync(HttpClient client, string baseUrl, string helperHeaderName, string myVersion)
    {
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, $"{baseUrl}/api/quit")
            {
                Content = JsonContent.Create(new QuitRequest(myVersion)),
            };
            request.Headers.Add(helperHeaderName, "1");
            using var response = await client.SendAsync(request);
            return response.StatusCode == HttpStatusCode.Accepted;
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            return false;
        }
    }

    /// <summary>A reasonably specific check, not just "did something answer" - an unrelated service on the same port shouldn't be mistaken for a Helper just because it happens to return 200 JSON with a "version" field.</summary>
    public static bool LooksLikeWinReleaseHelperInfoResponse(string? responseBody)
    {
        if (string.IsNullOrWhiteSpace(responseBody))
        {
            return false;
        }

        try
        {
            using var document = JsonDocument.Parse(responseBody);
            return document.RootElement.TryGetProperty("version", out var version)
                && version.ValueKind == JsonValueKind.String
                && !string.IsNullOrWhiteSpace(version.GetString());
        }
        catch (JsonException)
        {
            return false;
        }
    }

    /// <summary>
    /// Probes {baseUrl}/api/info with the required helper header (ADR 0067 - /api/* refuses requests
    /// without it) and a short timeout. Any failure (nothing listening, a non-Helper service, a
    /// timeout) is treated as "no Helper there" - this only needs to be right about the positive case
    /// (skip startup, don't error) since the negative case still goes through the normal bind attempt
    /// and its own address-in-use handling.
    /// </summary>
    public static async Task<bool> IsAnotherHelperAlreadyRunningAsync(HttpClient client, string baseUrl, string helperHeaderName, CancellationToken cancellationToken)
    {
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, $"{baseUrl}/api/info");
            request.Headers.Add(helperHeaderName, "1");
            using var response = await client.SendAsync(request, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                return false;
            }

            return LooksLikeWinReleaseHelperInfoResponse(await response.Content.ReadAsStringAsync(cancellationToken));
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            return false;
        }
    }
}
