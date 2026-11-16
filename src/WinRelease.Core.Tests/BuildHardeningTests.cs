using System.IO.Compression;
using WinRelease.Core.Compilation;
using WinRelease.Core.Manifest;
using Xunit;

namespace WinRelease.Core.Tests;

/// <summary>
/// The build host takes untrusted uploads once it's public (docs/roadmap/free-compiler-mvp.md,
/// Phase 3): these prove a crafted manifest or zip can't read host files, exhaust disk, or hang a build.
/// </summary>
public sealed class BuildHardeningTests
{
    private sealed class ThrowingRunner : IProcessRunner
    {
        public ProcessResult Run(ProcessStartRequest request) => throw new InvalidOperationException("wix must not be reached");
    }

    private static WinReleaseManifest ManifestWith(string sourcePath) => new()
    {
        UpgradeCode = Guid.NewGuid(),
        Name = "Hardening Test",
        Manufacturer = "WinRelease Tests",
        DisplayVersion = "1.0.0",
        Files = new ManifestFiles { Declared = [new DeclaredFile { Id = "f1", SourcePath = sourcePath, InstallPath = "a.txt" }] },
    };

    private static MemoryStream ZipOf(params (string Name, byte[] Content)[] entries)
    {
        var stream = new MemoryStream();
        using (var archive = new ZipArchive(stream, ZipArchiveMode.Create, leaveOpen: true))
        {
            foreach (var (name, content) in entries)
            {
                using var entryStream = archive.CreateEntry(name).Open();
                entryStream.Write(content);
            }
        }

        stream.Position = 0;
        return stream;
    }

    [Theory]
    [InlineData("a.txt", true)]
    [InlineData("bin/app.exe", true)]
    [InlineData("bin\\app.exe", true)]
    [InlineData("..\\secret.txt", false)]
    [InlineData("a/../../b", false)]
    [InlineData("C:\\Windows\\win.ini", false)]
    [InlineData("\\\\server\\share\\x", false)]
    [InlineData("/etc/passwd", false)]
    [InlineData("", false)]
    public void IsSafeRelative_AcceptsOnlyContainedRelativePaths(string path, bool expected) =>
        Assert.Equal(expected, SourcePathRules.IsSafeRelative(path));

    [Theory]
    [InlineData("..\\..\\Windows\\win.ini")]
    [InlineData("C:\\Windows\\win.ini")]
    public void ManifestValidation_RejectsSourcePathsOutsideTheSources(string sourcePath)
    {
        var errors = ManifestParser.Validate(ManifestWith(sourcePath));
        Assert.Contains(errors.Keys, key => key.Contains("sourcePath", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task Pipeline_RejectsAZipBomb_WithoutReachingWix()
    {
        // Compresses to a few KB but expands to 3 MB, over the 1 MB total this test allows.
        using var zip = ZipOf(("a.txt", new byte[3 * 1024 * 1024]));
        var limits = new BuildLimits { MaxTotalUncompressedBytes = 1024 * 1024 };

        var outcome = await MsiBuildPipeline.RunAsync(ManifestWith("a.txt"), zip, new ThrowingRunner(), default, limits);

        Assert.False(outcome.Succeeded);
        Assert.Contains("limit", outcome.StandardError, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Pipeline_RejectsTooManyEntries()
    {
        using var zip = ZipOf(("a.txt", [1]), ("b.txt", [1]), ("c.txt", [1]));

        var outcome = await MsiBuildPipeline.RunAsync(ManifestWith("a.txt"), zip, new ThrowingRunner(), default, new BuildLimits { MaxEntries = 2 });

        Assert.False(outcome.Succeeded);
        Assert.Contains("entries", outcome.StandardError);
    }

    [Fact]
    public async Task Pipeline_ReportsANonZipUpload_AsAnInputError_NotACrash()
    {
        using var notAZip = new MemoryStream("definitely not a zip"u8.ToArray());

        var outcome = await MsiBuildPipeline.RunAsync(ManifestWith("a.txt"), notAZip, new ThrowingRunner());

        Assert.False(outcome.Succeeded);
        Assert.Contains("zip", outcome.StandardError, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Pipeline_NeverTreatsAnAbsoluteSourcePath_AsFound_EvenIfTheHostFileExists()
    {
        // A manifest built in code (bypassing Validate) still can't pull in a real host file.
        var hostFile = Path.GetTempFileName();
        try
        {
            using var zip = ZipOf(("other.txt", [1]));

            var outcome = await MsiBuildPipeline.RunAsync(ManifestWith(hostFile), zip, new ThrowingRunner());

            Assert.False(outcome.Succeeded);
            Assert.Contains("not found", outcome.StandardError);
        }
        finally
        {
            File.Delete(hostFile);
        }
    }

    [Fact]
    public void BuildGate_RefusesPastItsCap_AndFreesTheSlotOnDispose()
    {
        var gate = new BuildGate(1);

        var first = gate.TryEnter();
        Assert.NotNull(first);
        Assert.Null(gate.TryEnter());

        first.Dispose();
        first.Dispose(); // idempotent - must not release twice
        using var second = gate.TryEnter();
        Assert.NotNull(second);
        Assert.Null(gate.TryEnter());
    }

    [Fact]
    public void SystemProcessRunner_KillsAProcessThatExceedsItsTimeout()
    {
        var (file, args) = OperatingSystem.IsWindows()
            ? ("powershell", new[] { "-NoProfile", "-Command", "Start-Sleep -Seconds 60" })
            : ("sleep", new[] { "60" });

        var started = DateTime.UtcNow;
        var result = new SystemProcessRunner().Run(new ProcessStartRequest(file, args, Path.GetTempPath(), TimeSpan.FromSeconds(1)));

        Assert.True(DateTime.UtcNow - started < TimeSpan.FromSeconds(30));
        Assert.Equal(-1, result.ExitCode);
        Assert.Contains("time limit", result.StandardError);
    }
}
