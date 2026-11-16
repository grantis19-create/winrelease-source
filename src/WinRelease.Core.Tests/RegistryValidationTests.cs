using System.Xml.Linq;
using WinRelease.Core.Compilation;
using WinRelease.Core.Manifest;
using Xunit;

namespace WinRelease.Core.Tests;

/// <summary>Registry/COM validation and value encoding found by UAT T4 (ADR 0086).</summary>
public sealed class RegistryValidationTests
{
    private static readonly XNamespace Wix = "http://wixtoolset.org/schemas/v4/wxs";

    private static WinReleaseManifest With(InstallScope scope = InstallScope.PerMachine, params RegistryEntry[] entries) => new()
    {
        UpgradeCode = Guid.NewGuid(),
        Name = "Reg",
        Manufacturer = "T",
        DisplayVersion = "1.0.0",
        AppInfo = new AppInfo { InstallScope = scope },
        Files = new ManifestFiles { Declared = [new DeclaredFile { Id = "App", SourcePath = "app.exe", InstallPath = "app.exe" }] },
        Registry = [.. entries],
    };

    private static RegistryEntry Entry(string key, string name = "N", RegistryRoot root = RegistryRoot.Hklm, string value = "v", RegistryValueType type = RegistryValueType.String) =>
        new() { Root = root, Key = key, Name = name, Value = value, ValueType = type };

    [Theory]
    [InlineData("")]
    [InlineData("\\Software\\X")]
    [InlineData("Software\\X\\")]
    [InlineData("Software\\\\X")]
    [InlineData("HKEY_LOCAL_MACHINE\\Software\\X")]
    [InlineData("HKLM\\Software\\X")]
    public void RejectsMalformedKeys(string key) => Assert.Contains("registry.key", ManifestParser.Validate(With(entries: Entry(key))).Keys);

    [Fact]
    public void RejectsTheSameValueTwice_IgnoringCase() =>
        Assert.Contains("registry.key", ManifestParser.Validate(With(entries: [Entry("Software\\X", "A"), Entry("software\\x", "a", value: "other")])).Keys);

    [Fact]
    public void AllowsTwoDifferentValuesInOneKey() =>
        Assert.DoesNotContain("registry.key", ManifestParser.Validate(With(entries: [Entry("Software\\X", "A"), Entry("Software\\X", "B")])).Keys);

    [Fact]
    public void RejectsHklmInAPerUserInstall() =>
        Assert.Contains("registry.root", ManifestParser.Validate(With(InstallScope.PerUser, Entry("Software\\X"))).Keys);

    [Fact]
    public void AllowsHkcuAndHkcrInAPerUserInstall() =>
        Assert.DoesNotContain("registry.root", ManifestParser.Validate(With(InstallScope.PerUser, Entry("Software\\X", root: RegistryRoot.Hkcu), Entry("UAT.X", root: RegistryRoot.Hkcr))).Keys);

    [Fact]
    public void MultiStringNewlinesBecomeMsiSeparators()
    {
        var doc = WxsGenerator.Generate(With(entries: Entry("Software\\X", "M", value: "one\ntwo\r\nthree", type: RegistryValueType.MultiString)), "C:/source");

        Assert.Equal("one[~]two[~]three", doc.Descendants(Wix + "RegistryValue").Single(v => v.Attribute("Name")?.Value == "M").Attribute("Value")!.Value);
    }

    [Fact]
    public void RegistryOnlyComponentsAreNotUnderTheInstallFolder()
    {
        var doc = WxsGenerator.Generate(With(entries: Entry("Software\\X")), "C:/source");

        var component = doc.Descendants(Wix + "RegistryValue").Single(v => v.Attribute("Name")?.Value == "N").Parent!;
        Assert.Equal("TARGETDIR", component.Attribute("Directory")!.Value);
    }

    [Fact]
    public void RejectsDuplicateClsidAndProgId()
    {
        var clsid = Guid.NewGuid();
        var manifest = With() with
        {
            ComClasses =
            [
                new ComClass { ClassId = clsid, FileId = "App", ProgId = "Acme.Thing.1" },
                new ComClass { ClassId = clsid, FileId = "App", ProgId = "ACME.thing.1" },
            ],
        };

        var errors = ManifestParser.Validate(manifest);

        Assert.Contains("comClasses.classId", errors.Keys);
        Assert.Contains("comClasses.progId", errors.Keys);
    }
}
