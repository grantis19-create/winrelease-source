using System.ComponentModel.DataAnnotations;
using System.Xml.Linq;
using WinRelease.Core.Compilation;
using WinRelease.Core.Manifest;
using Xunit;

namespace WinRelease.Core.Tests;

/// <summary>ADR 0053: curated MSI properties authored into the Property table.</summary>
public class MsiPropertiesTests
{
    private static readonly XNamespace Ns = WxsGenerator.Namespace;

    private static WinReleaseManifest Manifest(params MsiProperty[] properties) => new()
    {
        UpgradeCode = Guid.NewGuid(),
        Name = "Test App",
        Manufacturer = "Test",
        DisplayVersion = "1.0.0",
        Files = new ManifestFiles { Declared = [new DeclaredFile { Id = "MainExe", SourcePath = "app.exe", InstallPath = "app.exe" }] },
        Properties = [.. properties],
    };

    private static List<ValidationResult> Validate(WinReleaseManifest manifest)
    {
        var results = new List<ValidationResult>();
        Validator.TryValidateObject(manifest, new ValidationContext(manifest), results, validateAllProperties: true);
        return results;
    }

    [Fact]
    public void Generate_EmitsOnePropertyElementPerEntry()
    {
        var manifest = Manifest(
            new MsiProperty { Id = "REBOOT", Value = "ReallySuppress" },
            new MsiProperty { Id = "MSIRESTARTMANAGERCONTROL", Value = "Disable" });

        var doc = WxsGenerator.Generate(manifest, "C:/source");

        var emitted = doc.Descendants(Ns + "Property").ToDictionary(p => p.Attribute("Id")!.Value, p => p.Attribute("Value")!.Value);
        Assert.Equal("ReallySuppress", emitted["REBOOT"]);
        Assert.Equal("Disable", emitted["MSIRESTARTMANAGERCONTROL"]);
    }

    [Fact]
    public void Generate_NoProperties_EmitsNoExtraPropertyElements()
    {
        var doc = WxsGenerator.Generate(Manifest(), "C:/source");

        Assert.DoesNotContain(doc.Descendants(Ns + "Property"), p => p.Attribute("Id")!.Value == "REBOOT");
    }

    [Fact]
    public void Valid_CuratedProperties_PassValidation()
    {
        var manifest = Manifest(
            new MsiProperty { Id = "REBOOT", Value = "ReallySuppress" },
            new MsiProperty { Id = "MSIFASTINSTALL", Value = "7" });

        Assert.Empty(Validate(manifest));
    }

    [Theory]
    [InlineData("reboot")]
    [InlineData("Reboot")]
    [InlineData("1BAD")]
    [InlineData("HAS SPACE")]
    [InlineData("")]
    public void InvalidName_IsRejected(string id)
    {
        Assert.NotEmpty(Validate(Manifest(new MsiProperty { Id = id, Value = "1" })));
    }

    [Theory]
    [InlineData("ALLUSERS")]
    [InlineData("ARPNOMODIFY")]
    [InlineData("PRODUCTCODE")]
    [InlineData("INSTALLFOLDER")]
    public void PropertyAlreadyAuthoredElsewhere_IsRejected(string id)
    {
        var results = Validate(Manifest(new MsiProperty { Id = id, Value = "1" }));

        Assert.Contains(results, r => r.ErrorMessage!.Contains("another field"));
    }

    [Fact]
    public void DuplicateProperty_IsRejected()
    {
        var manifest = Manifest(
            new MsiProperty { Id = "REBOOT", Value = "ReallySuppress" },
            new MsiProperty { Id = "REBOOT", Value = "Force" });

        Assert.Contains(Validate(manifest), r => r.ErrorMessage!.Contains("more than once"));
    }

    [Theory]
    [InlineData("")]
    [InlineData("a\r\nb")]
    public void EmptyOrMultilineValue_IsRejected(string value)
    {
        Assert.NotEmpty(Validate(Manifest(new MsiProperty { Id = "REBOOT", Value = value })));
    }
}
