using System.Xml.Linq;
using WinRelease.Core.Compilation;
using WinRelease.Core.Manifest;
using Xunit;

namespace WinRelease.Core.Tests;

/// <summary>
/// The literal-path forms of Target Directory. The Windows system folders depend on the package's bitness: [SystemFolder] is the 32-bit system folder
/// (SysWOW64 on 64-bit Windows) and [System64Folder] is the real System32. Verified 2026-11-17 by building MSIs through the Helper code and reading
/// INSTALLFOLDER with the Windows Installer API: a literal System32 path in a 64-bit package used to land in SysWOW64.
/// </summary>
public class TargetDirectoryResolverTests
{
    private static readonly XNamespace Ns = WxsGenerator.Namespace;

    [Theory]
    [InlineData(@"C:\Windows\System32\Acme", PackageArchitecture.X64, "System64Folder", "Acme")]
    [InlineData(@"C:\Windows\System32\Acme", PackageArchitecture.Arm64, "System64Folder", "Acme")]
    [InlineData(@"C:\Windows\System32\Acme", PackageArchitecture.X86, "SystemFolder", "Acme")]
    [InlineData(@"c:\windows\system32\Acme\Sub", PackageArchitecture.X64, "System64Folder", "Acme|Sub")]
    [InlineData(@"C:\Windows\SysWOW64\Acme", PackageArchitecture.X64, "SystemFolder", "Acme")]
    [InlineData(@"C:\Windows\SysWOW64\Acme", PackageArchitecture.X86, "SystemFolder", "Acme")]
    [InlineData(@"C:\Program Files\Acme", PackageArchitecture.X64, "ProgramFiles64Folder", "Acme")]
    [InlineData(@"C:\Program Files (x86)\Acme", PackageArchitecture.X64, "ProgramFilesFolder", "Acme")]
    [InlineData(@"C:\Program Files\Common Files\Acme", PackageArchitecture.X64, "CommonFiles64Folder", "Acme")]
    [InlineData(@"C:\Program Files (x86)\Common Files\Acme", PackageArchitecture.X64, "CommonFilesFolder", "Acme")]
    [InlineData(@"C:\ProgramData\Acme", PackageArchitecture.X64, "CommonAppDataFolder", "Acme")]
    public void TryParse_LiteralPath_MapsToTheRightRootForThePackageArchitecture(string raw, PackageArchitecture architecture, string expectedRoot, string expectedSegments)
    {
        Assert.True(TargetDirectoryResolver.TryParse(raw, out var rootId, out var segments, architecture));

        Assert.Equal(expectedRoot, rootId);
        Assert.Equal(expectedSegments.Split('|'), segments);
    }

    [Fact]
    public void TryParse_WithoutAnArchitecture_TreatsThePackageAs64Bit()
    {
        Assert.True(TargetDirectoryResolver.TryParse(@"C:\Windows\System32\Acme", out var rootId, out _));

        Assert.Equal("System64Folder", rootId);
    }

    [Theory]
    [InlineData("[SystemFolder]Acme", "SystemFolder")]
    [InlineData("[System64Folder]Acme", "System64Folder")]
    public void TryParse_BracketedToken_IsNeverRemappedByArchitecture(string raw, string expectedRoot)
    {
        foreach (var architecture in new[] { PackageArchitecture.X64, PackageArchitecture.X86, PackageArchitecture.Arm64 })
        {
            Assert.True(TargetDirectoryResolver.TryParse(raw, out var rootId, out _, architecture));
            Assert.Equal(expectedRoot, rootId);
        }
    }

    [Fact]
    public void ExampleBasePath_SystemFolderIsSysWow64_AndSystem64FolderIsSystem32()
    {
        Assert.Equal(@"C:\Windows\SysWOW64", TargetDirectoryResolver.ExampleBasePath("SystemFolder"));
        Assert.Equal(@"C:\Windows\System32", TargetDirectoryResolver.ExampleBasePath("System64Folder"));
    }

    [Fact]
    public void Generate_LiteralSystem32InA64BitPackage_InstallsIntoSystem64Folder()
    {
        var manifest = new WinReleaseManifest
        {
            UpgradeCode = Guid.NewGuid(),
            Name = "Test App",
            Manufacturer = "Test",
            DisplayVersion = "1.0.0",
            TargetDirectory = @"C:\Windows\System32\AcmeMap",
            Architecture = PackageArchitecture.X64,
            Files = new ManifestFiles { Declared = [new DeclaredFile { Id = "MainExe", SourcePath = "app.exe", InstallPath = "app.exe" }] },
        };

        var doc = WxsGenerator.Generate(manifest, "C:/source");

        var standardDirectoryIds = doc.Descendants(Ns + "StandardDirectory").Select(d => d.Attribute("Id")!.Value).ToList();
        Assert.Contains("System64Folder", standardDirectoryIds);
        Assert.DoesNotContain("SystemFolder", standardDirectoryIds);
    }
}
