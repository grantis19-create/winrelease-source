using System.Xml.Linq;
using WinRelease.Core.Compilation;
using WinRelease.Core.Manifest;
using Xunit;

namespace WinRelease.Core.Tests;

/// <summary>ADR 0090: a loose file placed in the same standard folder the install folder lives in used to emit its parent folders twice (WIX0091).</summary>
public sealed class InstallFolderMergeTests
{
    private static readonly XNamespace Wix = "http://wixtoolset.org/schemas/v4/wxs";

    private static XDocument Generate(params DeclaredFile[] files)
    {
        var manifest = new WinReleaseManifest
        {
            UpgradeCode = Guid.Parse("11111111-2222-3333-4444-555555555555"),
            Name = "Merge",
            Manufacturer = "T",
            DisplayVersion = "1.0.0",
            TargetDirectory = @"[ProgramFiles64Folder]Acme\App",
            Files = new ManifestFiles { Declared = [.. files] },
        };

        return WxsGenerator.Generate(manifest, "C:/source");
    }

    [Fact]
    public void ALooseFileBesideTheInstallFolderChain_DoesNotDuplicateTheSharedParent()
    {
        var doc = Generate(
            new DeclaredFile { Id = "Main", SourcePath = "a.exe", InstallPath = "a.exe" },
            new DeclaredFile { Id = "Loose", SourcePath = "b.txt", InstallPath = "Acme/loose.txt", Root = InstallRoot.ProgramFiles64Folder });

        var ids = doc.Descendants(Wix + "Directory").Select(d => d.Attribute("Id")!.Value).ToList();

        Assert.Equal(ids.Count, ids.Distinct().Count());
        var acme = doc.Descendants(Wix + "Directory").Single(d => d.Attribute("Name")?.Value == "Acme");
        Assert.Contains(acme.Descendants(Wix + "File"), f => f.Attribute("Source")!.Value.EndsWith("b.txt"));
        Assert.Equal("INSTALLFOLDER", acme.Element(Wix + "Directory")!.Attribute("Id")!.Value);
    }

    [Fact]
    public void ALooseFileInsideTheInstallFoldersOwnPath_JoinsTheInstallFolder()
    {
        var doc = Generate(
            new DeclaredFile { Id = "Main", SourcePath = "a.exe", InstallPath = "a.exe" },
            new DeclaredFile { Id = "Same", SourcePath = "c.txt", InstallPath = "Acme/App/same.txt", Root = InstallRoot.ProgramFiles64Folder });

        var install = doc.Descendants(Wix + "Directory").Single(d => d.Attribute("Id")!.Value == "INSTALLFOLDER");

        Assert.Equal(2, install.Descendants(Wix + "File").Count());
        Assert.Single(doc.Descendants(Wix + "Directory"), d => d.Attribute("Name")?.Value == "App");
    }

    [Fact]
    public void WithoutALooseFile_TheOutputIsTheSameShapeAsBefore()
    {
        var doc = Generate(new DeclaredFile { Id = "Main", SourcePath = "a.exe", InstallPath = "a.exe" });

        var chain = doc.Descendants(Wix + "StandardDirectory").Single(d => d.Attribute("Id")!.Value == "ProgramFiles64Folder");
        Assert.Equal("Acme", chain.Element(Wix + "Directory")!.Attribute("Name")!.Value);
        Assert.Equal("INSTALLFOLDER", chain.Element(Wix + "Directory")!.Element(Wix + "Directory")!.Attribute("Id")!.Value);
    }
}
