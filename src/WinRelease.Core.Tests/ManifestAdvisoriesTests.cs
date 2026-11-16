using WinRelease.Core.Manifest;
using Xunit;

namespace WinRelease.Core.Tests;

public class ManifestAdvisoriesTests
{
    private static WinReleaseManifest Manifest(string version = "1.0.0", string target = "[ProgramFiles64Folder]Acme", InstallScope scope = InstallScope.PerMachine) => new()
    {
        UpgradeCode = Guid.NewGuid(),
        Name = "Test App",
        Manufacturer = "Test",
        DisplayVersion = version,
        TargetDirectory = target,
        AppInfo = new AppInfo { InstallScope = scope },
        Files = new ManifestFiles { Declared = [new DeclaredFile { Id = "MainExe", SourcePath = "app.exe", InstallPath = "app.exe" }] },
    };

    [Fact]
    public void AStandardPerMachineManifest_HasNoNotes() => Assert.Empty(ManifestAdvisories.For(Manifest()));

    [Theory]
    [InlineData("[ProgramFiles64Folder]Acme")]
    [InlineData("[ProgramFilesFolder]Acme")]
    [InlineData("[CommonFiles64Folder]Acme")]
    public void PerUserIntoAnAdminOnlyFolder_GetsANote(string target)
    {
        var notes = ManifestAdvisories.For(Manifest(target: target, scope: InstallScope.PerUser));

        Assert.Single(notes);
        Assert.Contains("administrator rights", notes[0]);
    }

    [Fact]
    public void PerUserIntoLocalAppData_HasNoNote() =>
        Assert.Empty(ManifestAdvisories.For(Manifest(target: "[LocalAppDataFolder]Programs\\Acme", scope: InstallScope.PerUser)));

    [Theory]
    [InlineData("1.0")]
    [InlineData("1.2.3.4")]
    [InlineData("300.0.0")]
    public void AnOddVersion_GetsANote_ButStillBuilds(string version)
    {
        var notes = ManifestAdvisories.For(Manifest(version: version));

        Assert.Single(notes);
        Assert.Contains(version, notes[0]);
    }
}
