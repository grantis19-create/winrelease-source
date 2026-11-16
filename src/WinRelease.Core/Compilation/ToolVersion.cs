using System.Reflection;

namespace WinRelease.Core.Compilation;

/// <summary>
/// ADR 0113: the version of the WinRelease program doing the build (the Helper, the Local host, the API), written into the MSI's details because
/// enterprise QA sheets ask for "the tooling and version used to create the package". Read from the host's own assembly so a release bumps it in
/// one place; a host that is not one of the WinRelease programs (a test run, the UAT runner) gets no version rather than a wrong one.
/// </summary>
public static class ToolVersion
{
    private static readonly string[] Hosts = ["WinRelease.Helper", "WinRelease.Local", "WinRelease.API", "WinRelease.BuildWorker"];

    public static string? Current { get; } = Resolve(Assembly.GetEntryAssembly());

    public static string? Resolve(Assembly? host)
    {
        if (host?.GetName().Name is not { } name || !Hosts.Contains(name))
        {
            return null;
        }

        var version = host.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion ?? host.GetName().Version?.ToString();
        var plus = version?.IndexOf('+') ?? -1;
        return plus >= 0 ? version![..plus] : version;
    }
}
