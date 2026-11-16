using System.Xml.Linq;
using WinRelease.Core.Compilation;
using WinRelease.Core.Manifest;
using Xunit;

namespace WinRelease.Core.Tests;

/// <summary>Advertised shortcuts in combination with user-profile installs and program groups (ICE19 / ICE64, found by UAT T8).</summary>
public sealed class AdvertisedShortcutTests
{
    private static readonly XNamespace Wix = "http://wixtoolset.org/schemas/v4/wxs";

    private static XDocument Generate(string targetDirectory, InstallScope scope, string location)
    {
        var manifest = new WinReleaseManifest
        {
            UpgradeCode = Guid.Parse("11111111-2222-3333-4444-555555555555"),
            Name = "Adv",
            Manufacturer = "T",
            DisplayVersion = "1.0.0",
            TargetDirectory = targetDirectory,
            AppInfo = new AppInfo { InstallScope = scope },
            Files = new ManifestFiles { Declared = [new DeclaredFile { Id = "App", SourcePath = "app.exe", InstallPath = "app.exe" }] },
            Shortcuts = [new Shortcut { Name = "Adv", TargetFileId = "App", Location = location, Advertise = true }],
        };

        return WxsGenerator.Generate(manifest, "C:/source");
    }

    [Fact]
    public void AdvertisingAFileUnderTheUserProfile_FallsBackToAnOrdinaryShortcut()
    {
        var doc = Generate(@"[LocalAppDataFolder]Programs\Adv", InstallScope.PerUser, ShortcutLocation.DesktopFolder);

        // The file is keyed on an HKCU value (ICE38), so it cannot be advertised (ICE19): the shortcut gets its own Component and an explicit target.
        var shortcut = doc.Descendants(Wix + "Shortcut").Single();
        Assert.Equal("no", shortcut.Attribute("Advertise")!.Value);
        Assert.StartsWith("[#", shortcut.Attribute("Target")!.Value);
    }

    [Fact]
    public void AdvertisingAFileUnderProgramFiles_StillAdvertises()
    {
        var doc = Generate("[ProgramFiles64Folder]Adv", InstallScope.PerMachine, ShortcutLocation.DesktopFolder);

        var shortcut = doc.Descendants(Wix + "Shortcut").Single();
        Assert.Equal("yes", shortcut.Attribute("Advertise")!.Value);
        Assert.Null(shortcut.Attribute("Target"));
    }

    [Fact]
    public void AnAdvertisedShortcutInAProgramGroup_RemovesTheGroupFolderOnUninstall()
    {
        var doc = Generate("[ProgramFiles64Folder]Adv", InstallScope.PerMachine, "wr:dir:programMenuFolder:Adv Group");

        var fileComponent = doc.Descendants(Wix + "Shortcut").Single().Parent!.Parent!;
        Assert.Single(fileComponent.Elements(Wix + "RemoveFolder"));
        Assert.Equal("uninstall", fileComponent.Element(Wix + "RemoveFolder")!.Attribute("On")!.Value);
    }
}
