using System.IO.Compression;
using WinRelease.Core.Compilation;
using WinRelease.Core.Manifest;
using Xunit;

namespace WinRelease.Core.Tests;

/// <summary>
/// Before this, a declared file or harvest folder with nothing behind it in the sources zip only
/// surfaced as a raw `wix build` failure (an LGHT0103-style "cannot find file" pointing at this
/// process's own throwaway temp path) - true, but useless to whoever needs to know which of *their*
/// files it was or what the manifest expected it to be named. MsiBuildPipeline now checks before ever
/// invoking wix - these tests prove that check fires, names the right things, and never reaches the
/// process runner at all (a runner that throws if invoked is how "wix was never started" is proven,
/// not just inferred from the result).
/// </summary>
public sealed class MsiBuildPipelineMissingSourcesTests
{
    // Throws unconditionally if ever invoked - used both to prove wix is never reached when sources
    // are missing (NeverCalled below) and, in reverse, to prove the pre-check let a satisfied manifest
    // through to the real compile step at all (the one test that expects this exception).
    private static readonly IProcessRunner NeverCalled = new ThrowingProcessRunner();

    private static WinReleaseManifest ManifestWith(List<DeclaredFile> declared, List<HarvestFolder> harvest) => new()
    {
        UpgradeCode = Guid.NewGuid(),
        Name = "Missing Sources Test",
        Manufacturer = "WinRelease Tests",
        DisplayVersion = "1.0.0",
        Files = new ManifestFiles { Declared = declared, Harvest = harvest },
    };

    private static MemoryStream ZipOf(params (string Name, string Content)[] entries)
    {
        var stream = new MemoryStream();
        using (var archive = new ZipArchive(stream, ZipArchiveMode.Create, leaveOpen: true))
        {
            foreach (var (name, content) in entries)
            {
                using var writer = new StreamWriter(archive.CreateEntry(name).Open());
                writer.Write(content);
            }
        }
        stream.Position = 0;
        return stream;
    }

    [Fact]
    public async Task RunAsync_ReportsAMissingDeclaredFile_ByIdAndExpectedPath_WithoutEverInvokingWix()
    {
        var manifest = ManifestWith(
            declared: [new DeclaredFile { Id = "HelloCmd", SourcePath = "hello.cmd", InstallPath = "hello.cmd" }],
            harvest: []);
        using var zip = ZipOf(("unrelated.txt", "x")); // hello.cmd deliberately absent

        var outcome = await MsiBuildPipeline.RunAsync(manifest, zip, NeverCalled);

        Assert.False(outcome.Succeeded);
        Assert.Contains("hello.cmd", outcome.StandardError);
        Assert.Contains("HelloCmd", outcome.StandardError);
        Assert.Null(outcome.MsiBytes);
    }

    // ADR 0112: wix builds a file that is not an icon without a word, leaving a blank icon in the MSI.
    [Fact]
    public async Task RunAsync_RefusesAShortcutIconThatIsNotAnIcon_WithoutEverInvokingWix()
    {
        var manifest = ManifestWith(declared: [new DeclaredFile { Id = "App", SourcePath = "app.exe", InstallPath = "app.exe" }], harvest: []) with
        {
            Shortcuts = [new Shortcut { Name = "App", TargetFileId = "App", Location = ShortcutLocation.DesktopFolder, IconPath = "pic.png" }],
        };
        using var zip = ZipOf(("app.exe", "x"), ("pic.png", "this is text, not an icon"));

        var outcome = await MsiBuildPipeline.RunAsync(manifest, zip, NeverCalled);

        Assert.False(outcome.Succeeded);
        Assert.Contains("pic.png", outcome.StandardError);
        Assert.Contains("not an icon", outcome.StandardError);
        Assert.Contains("icon of shortcut 'App'", outcome.StandardError);
    }

    [Fact]
    public async Task RunAsync_ReportsAMissingHarvestFolder_ByExpectedPath()
    {
        var manifest = ManifestWith(declared: [], harvest: [new HarvestFolder { SourceFolder = "assets", InstallPath = "assets" }]);
        using var zip = ZipOf(("unrelated.txt", "x")); // "assets/" deliberately never created

        var outcome = await MsiBuildPipeline.RunAsync(manifest, zip, NeverCalled);

        Assert.False(outcome.Succeeded);
        Assert.Contains("assets", outcome.StandardError);
    }

    [Fact]
    public async Task RunAsync_ListsEveryMissingItem_NotJustTheFirst()
    {
        var manifest = ManifestWith(
            declared:
            [
                new DeclaredFile { Id = "First", SourcePath = "first.txt", InstallPath = "first.txt" },
                new DeclaredFile { Id = "Second", SourcePath = "second.txt", InstallPath = "second.txt" },
            ],
            harvest: []);
        using var zip = ZipOf(("unrelated.txt", "x"));

        var outcome = await MsiBuildPipeline.RunAsync(manifest, zip, NeverCalled);

        Assert.Contains("first.txt", outcome.StandardError);
        Assert.Contains("second.txt", outcome.StandardError);
    }

    [Fact]
    public async Task RunAsync_DoesNotFlagADeclaredFileThatIsActuallyPresent()
    {
        var manifest = ManifestWith(
            declared: [new DeclaredFile { Id = "HelloCmd", SourcePath = "hello.cmd", InstallPath = "hello.cmd" }],
            harvest: []);
        using var zip = ZipOf(("hello.cmd", "@echo off"));

        // Nothing missing -> the pre-check passes and the pipeline moves on to the real compile step,
        // which NeverCalled then throws on by design - proving this test's zip genuinely satisfied the
        // check (reached wix) rather than merely failing to produce a "missing sources" error.
        await Assert.ThrowsAsync<InvalidOperationException>(() => MsiBuildPipeline.RunAsync(manifest, zip, NeverCalled));
    }

    private sealed class ThrowingProcessRunner : IProcessRunner
    {
        public ProcessResult Run(ProcessStartRequest request) =>
            throw new InvalidOperationException("wix should never be invoked when required sources are missing.");
    }
}
