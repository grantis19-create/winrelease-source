using System.IO.Compression;
using WinRelease.Core.Compilation;
using WinRelease.Core.Manifest;
using Xunit;

namespace WinRelease.Core.Tests;

/// <summary>Environment variable, architecture, icon and output-name checks found by UAT T5 (ADR 0087).</summary>
public sealed class EnvironmentAndArchitectureValidationTests
{
    private static WinReleaseManifest Manifest(
        InstallScope scope = InstallScope.PerMachine,
        PackageArchitecture architecture = PackageArchitecture.X64,
        string target = "[ProgramFiles64Folder]",
        IEnumerable<DeclaredFile>? files = null,
        params EnvironmentVariableEntry[] variables) => new()
    {
        UpgradeCode = Guid.NewGuid(),
        Name = "Env",
        Manufacturer = "T",
        DisplayVersion = "1.0.0",
        Architecture = architecture,
        TargetDirectory = target,
        AppInfo = new AppInfo { InstallScope = scope },
        Files = new ManifestFiles { Declared = [.. files ?? [new DeclaredFile { Id = "App", SourcePath = "app.exe", InstallPath = "app.exe" }]] },
        EnvironmentVariables = [.. variables],
    };

    private static EnvironmentVariableEntry Var(string name, bool system = false, EnvironmentVariablePart part = EnvironmentVariablePart.All, string separator = ";", EnvironmentVariableAction action = EnvironmentVariableAction.Set) =>
        new() { Name = name, Value = "v", System = system, Part = part, Separator = separator, Action = action };

    private static bool Rejects(WinReleaseManifest manifest) => ManifestParser.Validate(manifest).ContainsKey("EnvironmentVariables") || ManifestParser.Validate(manifest).ContainsKey("environmentVariables");

    [Theory]
    [InlineData("BAD=NAME")]
    [InlineData("tab\tname")]
    public void RejectsIllegalNames(string name) => Assert.True(Rejects(Manifest(variables: Var(name))));

    [Fact]
    public void RejectsTheSameVariableTwice_IgnoringCase() => Assert.True(Rejects(Manifest(variables: [Var("PATH"), Var("path")])));

    [Fact]
    public void AllowsTheSameNameForUserAndSystem() => Assert.False(Rejects(Manifest(variables: [Var("X", system: false), Var("X", system: true)])));

    [Fact]
    public void RejectsAnAppendWithoutASeparator() => Assert.True(Rejects(Manifest(variables: Var("PATH", part: EnvironmentVariablePart.Last, separator: ""))));

    [Fact]
    public void RejectsASystemVariableInAPerUserInstall() => Assert.True(Rejects(Manifest(InstallScope.PerUser, variables: Var("X", system: true))));

    [Fact]
    public void AllowsAUserVariableInAPerUserInstall() => Assert.False(Rejects(Manifest(InstallScope.PerUser, variables: Var("X"))));

    [Fact]
    public void RejectsAnX86PackageWithA64BitFile()
    {
        var manifest = Manifest(
            architecture: PackageArchitecture.X86,
            target: "[ProgramFilesFolder]T",
            files: [new DeclaredFile { Id = "Big", SourcePath = "b.dll", InstallPath = "b.dll", Root = InstallRoot.ProgramFiles64Folder }]);

        Assert.Contains("files.declared.root", ManifestParser.Validate(manifest).Keys);
    }

    [Fact]
    public void RejectsAnX86PackageWithTheDefault64BitTargetDirectory() =>
        Assert.Contains("targetDirectory", ManifestParser.Validate(Manifest(architecture: PackageArchitecture.X86)).Keys);

    [Fact]
    public void AcceptsAnX86PackageWith32BitFolders() =>
        Assert.Empty(ManifestParser.Validate(Manifest(architecture: PackageArchitecture.X86, target: "[ProgramFilesFolder]T")));

    // A 32-bit program in a 64-bit package is normal (it only needs a 32-bit component, which the generator sets), so validation must never block it.
    [Theory]
    [InlineData(InstallRoot.ProgramFilesFolder)]
    [InlineData(InstallRoot.CommonFilesFolder)]
    [InlineData(InstallRoot.SystemFolder)]
    public void AcceptsAnX64PackageThatInstallsA32BitProgramIntoA32BitFolder(InstallRoot root) =>
        Assert.Empty(ManifestParser.Validate(Manifest(files: [new DeclaredFile { Id = "Old", SourcePath = "old.exe", InstallPath = "old.exe", Root = root }])));

    private static WinReleaseManifest X86WithRegistry(params string[] keys) =>
        Manifest(architecture: PackageArchitecture.X86, target: "[ProgramFilesFolder]T") with
        {
            Registry = [.. keys.Select(k => new RegistryEntry { Root = RegistryRoot.Hklm, Key = k, Name = "V", Value = "1" })],
        };

    // An x86 package has only the 32-bit view, so the plain key and its WOW6432Node twin are one key: listing both used to reach wix as a duplicate Registry id.
    [Fact]
    public void RejectsAnX86PackageWithAKeyAndItsWow6432NodeTwin()
    {
        var errors = ManifestParser.Validate(X86WithRegistry(@"SOFTWARE\GE\App", @"SOFTWARE\WOW6432Node\GE\App"));

        Assert.Contains(errors["registry.key"], m => m.Contains("32-bit registry"));
    }

    [Fact]
    public void AcceptsAnX64PackageWithAKeyAndItsWow6432NodeTwin() =>
        Assert.DoesNotContain("registry.key", ManifestParser.Validate(Manifest() with
        {
            Registry =
            [
                new RegistryEntry { Root = RegistryRoot.Hklm, Key = @"SOFTWARE\GE\App", Name = "V", Value = "1" },
                new RegistryEntry { Root = RegistryRoot.Hklm, Key = @"SOFTWARE\WOW6432Node\GE\App", Name = "V", Value = "1" },
            ],
        }).Keys);

    [Fact]
    public void AcceptsAnX86PackageWithOneKey() =>
        Assert.DoesNotContain("registry.key", ManifestParser.Validate(X86WithRegistry(@"SOFTWARE\GE\App")).Keys);

    [Fact]
    public void OutputFileName_IsCapped()
    {
        var name = OutputFileName.Sanitize(new string('N', 500));

        Assert.Equal(OutputFileName.MaxLength, name.Length);
    }

    [Fact]
    public async Task Pipeline_ReportsAMissingIconFile_BeforeReachingWix()
    {
        var manifest = Manifest() with { AppInfo = new AppInfo { IconPath = "assets/missing.ico", AutoExtractIcon = false } };
        using var zip = new MemoryStream();
        using (var archive = new ZipArchive(zip, ZipArchiveMode.Create, leaveOpen: true))
        {
            using var writer = new StreamWriter(archive.CreateEntry("app.exe").Open());
            writer.Write("x");
        }

        zip.Position = 0;
        var outcome = await MsiBuildPipeline.RunAsync(manifest, zip, new ThrowingRunner());

        Assert.False(outcome.Succeeded);
        Assert.Contains("assets/missing.ico", outcome.StandardError);
    }

    private sealed class ThrowingRunner : IProcessRunner
    {
        public ProcessResult Run(ProcessStartRequest request) => throw new InvalidOperationException("wix must not be reached");
    }
}
