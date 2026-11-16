using System.IO.Compression;
using WinRelease.Core.Compilation;
using WinRelease.Core.Manifest;
using Xunit;

namespace WinRelease.Core.Tests;

/// <summary>Windows Installer can't write a path of 260+ characters (msiexec 1603) - found by UAT T2/T6 (ADR 0088).</summary>
public sealed class InstallPathLengthTests
{
    private static WinReleaseManifest With(string installPath, InstallRoot root = InstallRoot.InstallFolder, string target = "[ProgramFiles64Folder]", params HarvestFolder[] harvest) => new()
    {
        UpgradeCode = Guid.NewGuid(),
        Name = "P",
        Manufacturer = "T",
        DisplayVersion = "1.0.0",
        TargetDirectory = target,
        Files = new ManifestFiles
        {
            Declared = installPath.Length == 0 ? [] : [new DeclaredFile { Id = "F", SourcePath = "f.txt", InstallPath = installPath, Root = root }],
            Harvest = [.. harvest],
        },
    };

    [Fact]
    public void Estimate_AddsTheStandardFolderTargetSegmentsAndFile()
    {
        var estimate = InstallPathLength.Estimate(With("a/b.txt", target: "[ProgramFiles64Folder]Acme\\App"), InstallRoot.InstallFolder, "a/b.txt");

        Assert.Equal(@"C:\Program Files\Acme\App\a\b.txt", estimate);
    }

    [Fact]
    public void Estimate_UsesATypicalUserProfileForAppData()
    {
        var estimate = InstallPathLength.Estimate(With("x.txt", InstallRoot.AppDataFolder), InstallRoot.AppDataFolder, "x.txt");

        Assert.Equal(@"C:\Users\Administrator\AppData\Roaming\x.txt", estimate);
    }

    [Fact]
    public void RejectsADeclaredFileOverTheLimit() =>
        Assert.Contains("files.declared.installPath", ManifestParser.Validate(With(new string('x', 300) + ".txt")).Keys);

    [Fact]
    public void AcceptsADeclaredFileJustUnderTheLimit()
    {
        // "C:\Program Files\" is 17 characters; 259 - 17 = 242 for the relative path.
        Assert.DoesNotContain("files.declared.installPath", ManifestParser.Validate(With(new string('x', 242))).Keys);
        Assert.Contains("files.declared.installPath", ManifestParser.Validate(With(new string('x', 243))).Keys);
    }

    [Fact]
    public async Task Pipeline_RejectsAHarvestedTreeThatInstallsTooDeep()
    {
        var deep = string.Join('/', Enumerable.Range(1, 60).Select(i => $"level{i:00}")) + "/file.dat";
        using var zip = new MemoryStream();
        using (var archive = new ZipArchive(zip, ZipArchiveMode.Create, leaveOpen: true))
        {
            using var writer = new StreamWriter(archive.CreateEntry("tree/" + deep).Open());
            writer.Write("x");
        }

        zip.Position = 0;
        var manifest = With("", harvest: new HarvestFolder { SourceFolder = "tree", InstallPath = "tree" });
        var outcome = await MsiBuildPipeline.RunAsync(manifest, zip, new ThrowingRunner());

        Assert.False(outcome.Succeeded);
        Assert.Contains("259 characters", outcome.StandardError);
    }

    private sealed class ThrowingRunner : IProcessRunner
    {
        public ProcessResult Run(ProcessStartRequest request) => throw new InvalidOperationException("wix must not be reached");
    }
}
