using System.Xml.Linq;
using WinRelease.Core.Compilation;
using WinRelease.Core.Manifest;
using Xunit;

namespace WinRelease.Core.Tests;

/// <summary>ADR 0092: registry values share a Component per hive+key instead of one Component per value.</summary>
public sealed class RegistryGroupingTests
{
    private static readonly XNamespace Wix = "http://wixtoolset.org/schemas/v4/wxs";

    private static RegistryEntry Write(string key, string name, RegistryRoot root = RegistryRoot.Hklm) =>
        new() { Root = root, Key = key, Name = name, Value = "v", ValueType = RegistryValueType.String };

    private static XDocument Generate(params RegistryEntry[] entries) => WxsGenerator.Generate(new WinReleaseManifest
    {
        UpgradeCode = Guid.Parse("11111111-2222-3333-4444-555555555555"),
        Name = "Reg",
        Manufacturer = "T",
        DisplayVersion = "1.0.0",
        Files = new ManifestFiles { Declared = [new DeclaredFile { Id = "App", SourcePath = "app.exe", InstallPath = "app.exe" }] },
        Registry = [.. entries],
    }, "C:/source");

    private static List<XElement> RegistryComponents(XDocument doc) =>
        doc.Descendants(Wix + "Component").Where(c => c.Element(Wix + "RegistryValue") is not null && c.Element(Wix + "File") is null).ToList();

    [Fact]
    public void ValuesInOneKeyShareOneComponent_FirstValueIsTheKeyPath()
    {
        var doc = Generate(Write("Software\\Acme", "A"), Write("Software\\Acme", "B"), Write("Software\\Acme", "C"));

        var component = Assert.Single(RegistryComponents(doc));
        var values = component.Elements(Wix + "RegistryValue").ToList();
        Assert.Equal(3, values.Count);
        Assert.Equal("yes", values[0].Attribute("KeyPath")!.Value);
        Assert.All(values.Skip(1), v => Assert.Null(v.Attribute("KeyPath")));
    }

    [Fact]
    public void DifferentKeysOrHives_GetTheirOwnComponents()
    {
        var doc = Generate(Write("Software\\Acme", "A"), Write("Software\\Acme\\Sub", "A"), Write("Software\\Acme", "A", RegistryRoot.Hkcu));

        Assert.Equal(3, RegistryComponents(doc).Count);
    }

    [Fact]
    public void KeyNamesAreComparedIgnoringCase_BecauseTheRegistryIs() =>
        Assert.Single(RegistryComponents(Generate(Write("Software\\Acme", "A"), Write("software\\ACME", "B"))));

    [Fact]
    public void ComponentIdentityDependsOnTheKeyNotTheValues()
    {
        var one = RegistryComponents(Generate(Write("Software\\Acme", "A"))).Single().Attribute("Guid")!.Value;
        var two = RegistryComponents(Generate(Write("Software\\Acme", "A"), Write("Software\\Acme", "B"))).Single().Attribute("Guid")!.Value;

        Assert.Equal(one, two);
    }

    [Fact]
    public void RemoveActionsStayInTheirOwnComponents()
    {
        var doc = Generate(
            Write("Software\\Acme", "A"),
            new RegistryEntry { Root = RegistryRoot.Hklm, Key = "Software\\Acme", Name = "Old", Action = RegistryEntryAction.RemoveValue },
            Write("Software\\Acme", "B"));

        Assert.Equal(2, RegistryComponents(doc).Count);
    }
}
