using WinRelease.Core.Manifest;
using Xunit;

namespace WinRelease.Core.Tests;

/// <summary>A shortcut's Name becomes a file name - rejected up front in plain words, not as a raw WIX0027 about a temp path (UAT T3).</summary>
public sealed class ShortcutNameValidationTests
{
    private static WinReleaseManifest With(string name) => new()
    {
        UpgradeCode = Guid.NewGuid(),
        Name = "App",
        Manufacturer = "T",
        DisplayVersion = "1.0.0",
        Files = new ManifestFiles { Declared = [new DeclaredFile { Id = "App", SourcePath = "app.exe", InstallPath = "app.exe" }] },
        Shortcuts = [new Shortcut { Name = name, TargetFileId = "App", Location = ShortcutLocation.DesktopFolder }],
    };

    [Theory]
    [InlineData("Bad: name")]
    [InlineData("Bad/name")]
    [InlineData("Bad\name")]
    [InlineData("What?")]
    [InlineData("trailing dot.")]
    [InlineData("trailing space ")]
    public void RejectsNamesWindowsCannotSaveAsAFile(string name) =>
        Assert.Contains("shortcuts.name", ManifestParser.Validate(With(name)).Keys);

    [Fact]
    public void RejectsAnEmptyName() => Assert.Contains("shortcuts.name", ManifestParser.Validate(With("")).Keys);

    [Theory]
    [InlineData("Plain Name")]
    [InlineData("R&D Tools")]
    [InlineData("Café 日本語")]
    [InlineData("Paren (x64) #1, 100%")]
    public void AcceptsOrdinaryNames(string name) => Assert.DoesNotContain("shortcuts.name", ManifestParser.Validate(With(name)).Keys);
}
