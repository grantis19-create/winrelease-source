using System.Xml.Linq;
using WinRelease.Core.Compilation;
using WinRelease.Core.Manifest;
using Xunit;

namespace WinRelease.Core.Tests;

/// <summary>ADR 0084: File/Component ids stay unique and within MSI's 72-character key limit; ids that already worked don't change.</summary>
public sealed class FileIdStabilityTests : IDisposable
{
    private static readonly XNamespace Wix = "http://wixtoolset.org/schemas/v4/wxs";
    private readonly string _root = Directory.CreateTempSubdirectory("winrelease-ids-").FullName;

    private void Touch(string relative)
    {
        var full = Path.Combine(_root, relative);
        Directory.CreateDirectory(Path.GetDirectoryName(full)!);
        File.WriteAllText(full, "x");
    }

    private IReadOnlyList<XElement> Components(WinReleaseManifest manifest) =>
        WxsGenerator.Generate(manifest, _root, _root).Descendants(Wix + "Component").Where(c => c.Element(Wix + "File") is not null).ToList();

    private static WinReleaseManifest Manifest(List<DeclaredFile>? declared = null, params HarvestFolder[] harvest) => new()
    {
        UpgradeCode = Guid.Parse("11111111-2222-3333-4444-555555555555"),
        Name = "Ids",
        Manufacturer = "T",
        DisplayVersion = "1.0.0",
        Files = new ManifestFiles { Declared = declared ?? [], Harvest = [.. harvest] },
    };

    [Fact]
    public void TwoHarvestFoldersWithTheSameRelativePath_GetDistinctIdsAndGuids()
    {
        Touch("a/x.txt");
        Touch("b/x.txt");

        var components = Components(Manifest(null, new HarvestFolder { SourceFolder = "a", InstallPath = "a" }, new HarvestFolder { SourceFolder = "b", InstallPath = "b" }));

        Assert.Equal(2, components.Select(c => c.Attribute("Id")!.Value).Distinct().Count());
        Assert.Equal(2, components.Select(c => c.Attribute("Guid")!.Value).Distinct().Count());
    }

    [Fact]
    public void NamesThatSanitizeToTheSameId_GetDistinctIds()
    {
        Touch("h/lib/a.dll");
        Touch("h/lib_a.dll");
        Touch("h/lib a.dll");

        var ids = Components(Manifest(null, new HarvestFolder { SourceFolder = "h", InstallPath = "h" })).Select(c => c.Attribute("Id")!.Value).ToList();

        Assert.Equal(3, ids.Distinct().Count());
    }

    [Fact]
    public void AVeryDeepPath_StaysWithinTheMsiKeyLimit()
    {
        Touch(string.Join('/', Enumerable.Range(1, 30).Select(i => $"level{i}")) + "/file.dat");

        var id = Components(Manifest(null, new HarvestFolder { SourceFolder = ".", InstallPath = "deep" })).Single().Attribute("Id")!.Value;

        Assert.True(id.Length <= 72, id);
    }

    [Fact]
    public void AnIdThatAlreadyWorked_IsUnchanged()
    {
        Touch("conf/app.ini");

        var id = Components(Manifest(null, new HarvestFolder { SourceFolder = "conf", InstallPath = "conf" })).Single().Attribute("Id")!.Value;

        Assert.Equal("app.ini", id);
    }

    public void Dispose() => Directory.Delete(_root, recursive: true);
}
