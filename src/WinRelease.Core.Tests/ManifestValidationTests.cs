using System.ComponentModel.DataAnnotations;
using WinRelease.Core.Manifest;
using Xunit;

namespace WinRelease.Core.Tests;

/// <summary>
/// ADR 0035: a Shortcut targets exactly one of a declared File (TargetFileId)
/// or a raw WiX Target expression (TargetPath) - a URL, a path inside a
/// Harvest Folder, or anything else WiX's Target attribute accepts.
/// </summary>
public class ManifestValidationTests
{
    private static WinReleaseManifest BaseManifest(List<Shortcut>? shortcuts = null) => new()
    {
        UpgradeCode = Guid.NewGuid(),
        Name = "Test App",
        Manufacturer = "Test",
        DisplayVersion = "1.0.0",
        Files = new ManifestFiles { Declared = [new DeclaredFile { Id = "MainExe", SourcePath = "app.exe", InstallPath = "app.exe" }] },
        Shortcuts = shortcuts ?? [],
    };

    [Theory]
    [InlineData("", "Acme", "Name")]
    [InlineData("   ", "Acme", "Name")]
    [InlineData("App", "", "Manufacturer")]
    [InlineData("App", "  ", "Manufacturer")]
    public void BlankNameOrManufacturer_IsInvalid_BecauseWixRejectsIt(string name, string manufacturer, string field)
    {
        var manifest = BaseManifest() with { Name = name, Manufacturer = manufacturer };

        Assert.Contains(field, Validate(manifest).SelectMany(r => r.MemberNames));
    }

    [Fact]
    public void Shortcut_WithOnlyTargetFileId_IsValid()
    {
        var manifest = BaseManifest([new Shortcut { Name = "App", TargetFileId = "MainExe", Location = ShortcutLocation.DesktopFolder }]);

        Assert.Empty(Validate(manifest));
    }

    [Fact]
    public void Shortcut_WithOnlyTargetPath_IsValid()
    {
        var manifest = BaseManifest([new Shortcut { Name = "Docs", TargetPath = "https://example.com/docs", Location = ShortcutLocation.DesktopFolder }]);

        Assert.Empty(Validate(manifest));
    }

    [Theory]
    [InlineData(@"C:\Tools\app.exe")]
    [InlineData(@"c:/Tools/app.exe")]
    [InlineData(@"\\server\share\tool.exe")]
    [InlineData("[INSTALLFOLDER]bin\tool.exe")]
    [InlineData("[System64Folder]notepad.exe")]
    [InlineData("https://example.com/docs")]
    public void Shortcut_TargetPath_AcceptedForms_AreValid(string target)
    {
        var manifest = BaseManifest([new Shortcut { Name = "Tool", TargetPath = target, Location = ShortcutLocation.DesktopFolder }]);

        Assert.Empty(Validate(manifest));
    }

    /// <summary>A bare file name or a relative path builds and installs but makes no shortcut (MSI reads a Target with no brackets as a Feature name), so it is refused up front.</summary>
    [Theory]
    [InlineData("notepad.exe")]
    [InlineData(@"tools\app.exe")]
    [InlineData("INSTALLFOLDER")]
    public void Shortcut_TargetPath_BareNameOrRelativePath_IsInvalid(string target)
    {
        var manifest = BaseManifest([new Shortcut { Name = "Tool", TargetPath = target, Location = ShortcutLocation.DesktopFolder }]);

        var errors = Validate(manifest).ToList();

        Assert.Contains(errors, e => e.ErrorMessage!.Contains("isn't one WinRelease can use"));
    }

    /// <summary>ADR 0094: non-standard versions are allowed (wix builds them, warning WIX1148); only an empty one is rejected. The range check is advice, not a rule.</summary>
    [Theory]
    [InlineData("1.0.0", true)]
    [InlineData("255.255.65535", true)]
    [InlineData("256.0.0", true)]
    [InlineData("300.0.0", true)]
    [InlineData("1.0", true)]
    [InlineData("1.0.0.0", true)]
    [InlineData("1.0.0-beta", true)]
    [InlineData("", false)]
    public void ProductVersion_IsAdvisoryExceptWhenEmpty(string version, bool accepted)
    {
        var manifest = BaseManifest() with { DisplayVersion = version };

        Assert.Equal(accepted, !Validate(manifest).Any(r => r.MemberNames.Contains("ProductVersion")));
    }

    [Theory]
    [InlineData("1.0.0", true)]
    [InlineData("255.255.65535", true)]
    [InlineData("256.0.0", false)]
    [InlineData("1.0.65536", false)]
    [InlineData("1.0", false)]
    [InlineData("1.0.0.0", false)]
    [InlineData("1.x.0", false)]
    public void VersionMapper_ReportsWhetherAVersionIsInWindowsInstallersRange(string version, bool wellFormed) =>
        Assert.Equal(wellFormed, VersionMapper.IsWellFormedProductVersion(version));

    [Fact]
    public void Shortcut_UrlTargetWithLineBreak_IsInvalid_BecauseItWouldInjectKeysIntoTheUrlFile()
    {
        var manifest = BaseManifest([new Shortcut { Name = "Docs", TargetPath = "https://example.com\r\nIconFile=C:\\x.dll", Location = ShortcutLocation.DesktopFolder }]);

        Assert.NotEmpty(Validate(manifest));
    }

    [Fact]
    public void Shortcut_WithNeitherTargetFileIdNorTargetPath_IsInvalid()
    {
        var manifest = BaseManifest([new Shortcut { Name = "App", Location = ShortcutLocation.DesktopFolder }]);

        Assert.NotEmpty(Validate(manifest));
    }

    [Fact]
    public void Shortcut_WithBothTargetFileIdAndTargetPath_IsInvalid()
    {
        var manifest = BaseManifest(
            [new Shortcut { Name = "App", TargetFileId = "MainExe", TargetPath = "https://example.com", Location = ShortcutLocation.DesktopFolder }]);

        Assert.NotEmpty(Validate(manifest));
    }

    [Fact]
    public void Shortcut_TargetFileIdNotDeclared_IsInvalid()
    {
        var manifest = BaseManifest([new Shortcut { Name = "App", TargetFileId = "NoSuchFile", Location = ShortcutLocation.DesktopFolder }]);

        Assert.NotEmpty(Validate(manifest));
    }

    [Theory]
    [InlineData("[ProgramFiles64Folder]")]
    [InlineData("[ProgramFiles64Folder]Acme\\App")]
    [InlineData("C:\\Program Files\\Acme\\App")]
    [InlineData("[AppDataFolder]MyApp")]
    [InlineData("[CommonAppDataFolder]")]
    [InlineData("C:\\ProgramData\\Acme\\App")]
    public void TargetDirectory_RecognizedRootOrLiteralPath_IsValid(string targetDirectory)
    {
        var manifest = BaseManifest() with { TargetDirectory = targetDirectory };

        Assert.Empty(Validate(manifest));
    }

    [Theory]
    [InlineData("")]
    [InlineData("[NotARealToken]App")]
    [InlineData("D:\\SomeOtherDrive\\App")]
    public void TargetDirectory_UnrecognizedRootOrPath_IsInvalid(string targetDirectory)
    {
        var manifest = BaseManifest() with { TargetDirectory = targetDirectory };

        Assert.NotEmpty(Validate(manifest));
    }

    /// <summary>
    /// "Graceful Ingestion, Deferred Native Errors" pass: WinRelease no longer pre-emptively
    /// rejects a recognized root's subpath segments against its own invented Windows folder-name
    /// rule set (illegal characters, trailing space/period, reserved device names) - Rule 1, let
    /// native `wix build` be the sole evaluator of WiX-level path validity. A value that would
    /// have failed the old DirectorySegmentRules check is valid at this layer now; whether
    /// `wix build` itself objects is a build-time concern, surfaced verbatim (Rule 3), not a
    /// manifest-save-time one.
    /// </summary>
    [Theory]
    [InlineData("[ProgramFiles64Folder]Tester Folder\\ main app \\test further\\did this fail. 6$%$%^")]
    [InlineData("[ProgramFiles64Folder]Trailing Dot.")]
    [InlineData("[ProgramFiles64Folder]Bad<Char")]
    [InlineData("[ProgramFiles64Folder]CON")]
    [InlineData("[ProgramFiles64Folder]COM1")]
    public void TargetDirectory_RecognizedRootWithAnySegmentText_IsNoLongerRejectedPreEmptively(string targetDirectory)
    {
        var manifest = BaseManifest() with { TargetDirectory = targetDirectory };

        Assert.Empty(Validate(manifest));
    }

    private static List<ValidationResult> Validate(WinReleaseManifest manifest)
    {
        var results = new List<ValidationResult>();
        Validator.TryValidateObject(manifest, new ValidationContext(manifest), results, validateAllProperties: true);
        return results;
    }
}
