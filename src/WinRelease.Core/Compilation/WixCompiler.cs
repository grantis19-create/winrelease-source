using WinRelease.Core.Manifest;

namespace WinRelease.Core.Compilation;

public sealed record CompileResult(bool Succeeded, string StandardOutput, string StandardError, string? OutputMsiPath);

/// <summary>
/// Compiles a manifest to a real .msi by generating WiX v5 XML in-memory and
/// invoking the `wix build` CLI headlessly - no intermediate .wxs authored by
/// hand, no WixToolset.Sdk MSBuild project (ADR 0022). ICE validation runs
/// inside `wix build` itself; its warnings/errors surface through
/// <see cref="CompileResult.StandardError"/> rather than a separate step.
/// </summary>
public sealed class WixCompiler(IProcessRunner processRunner)
{
    public CompileResult Compile(WinReleaseManifest manifest, string sourceRoot, string outputDirectory, BuildLimits? limits = null)
    {
        var workingDirectory = Directory.CreateTempSubdirectory("winrelease-wix-").FullName;

        try
        {
            // ADR 0052: build-time generated files (the .url files for URL shortcuts) live in the temp
            // working directory, never in the customer's sources.
            var generatedRoot = Path.Combine(workingDirectory, "generated");
            Directory.CreateDirectory(generatedRoot);
            foreach (var (fileName, content) in UrlShortcutFile.For(manifest))
            {
                File.WriteAllText(Path.Combine(generatedRoot, fileName), content);
            }

            var wxs = WxsGenerator.Generate(manifest, sourceRoot, generatedRoot);
            var wxsPath = Path.Combine(workingDirectory, "manifest.wxs");
            wxs.Save(wxsPath);

            Directory.CreateDirectory(outputDirectory);
            var outputMsiPath = Path.Combine(outputDirectory, $"{OutputFileName.Sanitize(manifest.Name)}-{manifest.ResolvedProductVersion}.msi");

            var result = processRunner.Run(new ProcessStartRequest(
                "wix",
                // -acceptEula wix7: conscious acceptance of the WiX v7 Open Source
                // Maintenance Fee EULA, not an accident. See ADR 0024 - WinRelease.io
                // is a commercial product and owes OSMF sponsorship once it clears
                // $10k/year revenue. Update the EULA ID here if the WiX major version changes.
                // -arch: manifest.Architecture (ADR 0038), defaults to x64.
                // -ext WixToolset.UI.wixext: only for the optional install wizard (ADR 0098).
                [.. new[] { "build", wxsPath, "-arch", ArchitectureArg(manifest.Architecture), "-acceptEula", "wix7" },
                 .. manifest.AppInfo.InstallWizard ? new[] { "-ext", "WixToolset.UI.wixext" } : Array.Empty<string>(),
                 "-o", outputMsiPath],
                workingDirectory,
                (limits ?? BuildLimits.Default).WixTimeout));

            return new CompileResult(
                result.ExitCode == 0,
                result.StandardOutput,
                result.StandardError,
                result.ExitCode == 0 ? outputMsiPath : null);
        }
        finally
        {
            // The generated .wxs is only needed for the duration of the wix call - without this,
            // every build leaves a directory behind in the temp folder.
            Directory.Delete(workingDirectory, recursive: true);
        }
    }

    private static string ArchitectureArg(PackageArchitecture architecture) => architecture switch
    {
        PackageArchitecture.X64 => "x64",
        PackageArchitecture.X86 => "x86",
        PackageArchitecture.Arm64 => "arm64",
        _ => "x64",
    };
}
