using System.Xml.Linq;
using WinRelease.Core.Compilation;
using WinRelease.Core.Manifest;
using Xunit;

namespace WinRelease.Core.Tests;

/// <summary>ADR 0108: WOW6432Node is removed (and the Component marked 32-bit) only at the places Windows really redirects, exactly once.</summary>
public class Wow6432RedirectTests
{
    private static readonly XNamespace Ns = "http://wixtoolset.org/schemas/v4/wxs";

    [Theory]
    [InlineData(RegistryRoot.Hklm, @"SOFTWARE\WOW6432Node\Vendor", @"SOFTWARE\Vendor")]
    [InlineData(RegistryRoot.Hklm, @"software\wow6432node\Vendor\App", @"software\Vendor\App")]
    [InlineData(RegistryRoot.Hklm, @"SOFTWARE\WOW6432Node\WOW6432Node\X", @"SOFTWARE\WOW6432Node\X")] // only one segment, never the nested one
    [InlineData(RegistryRoot.Hklm, @"SOFTWARE\Classes\WOW6432Node\CLSID\{X}", @"SOFTWARE\Classes\CLSID\{X}")]
    [InlineData(RegistryRoot.Hklm, @"SOFTWARE\Classes\WOW6432Node\Media Type\X", @"SOFTWARE\Classes\Media Type\X")]
    [InlineData(RegistryRoot.Hkcu, @"SOFTWARE\Classes\WOW6432Node\Interface\{X}", @"SOFTWARE\Classes\Interface\{X}")]
    [InlineData(RegistryRoot.Hkcr, @"WOW6432Node\CLSID\{X}", @"CLSID\{X}")]
    public void TryResolve_RemovesTheOneSegmentAtARealRedirectPoint(RegistryRoot root, string key, string expected)
    {
        Assert.True(Wow6432Redirect.TryResolve(root, key, out var resolved));
        Assert.Equal(expected, resolved);
        Assert.False(Wow6432Redirect.IsLiteralWowKey(root, key));
    }

    [Theory]
    [InlineData(RegistryRoot.Hklm, @"SOFTWARE\WOW6432Node")] // nothing under it
    [InlineData(RegistryRoot.Hklm, @"SOFTWARE\Vendor\WOW6432Node\X")] // not at the redirect point
    [InlineData(RegistryRoot.Hkcu, @"SOFTWARE\WOW6432Node\X")] // HKCU\SOFTWARE is shared: an ordinary key name
    [InlineData(RegistryRoot.Hklm, @"SOFTWARE\Classes\WOW6432Node\MyApp.Doc")] // Classes is shared except a few children
    [InlineData(RegistryRoot.Hkcr, @"WOW6432Node\MyApp.Doc")]
    [InlineData(RegistryRoot.Hklm, @"SYSTEM\WOW6432Node\X")] // HKLM\SYSTEM is not redirected
    [InlineData(RegistryRoot.Hku, @"S-1-5-21-1\SOFTWARE\Classes\WOW6432Node\CLSID\{X}")]
    public void TryResolve_LeavesEverythingElseExactlyAsTyped(RegistryRoot root, string key)
    {
        Assert.False(Wow6432Redirect.TryResolve(root, key, out var resolved));
        Assert.Equal(key, resolved);
        Assert.True(Wow6432Redirect.IsLiteralWowKey(root, key));
    }

    [Fact]
    public void IsLiteralWowKey_IsFalseWhenThereIsNoWowSegmentAtAll()
    {
        Assert.False(Wow6432Redirect.IsLiteralWowKey(RegistryRoot.Hklm, @"SOFTWARE\Vendor\NotWOW6432NodeHere"));
    }

    [Fact]
    public void Generate_LiteralWowKey_IsWrittenAsTypedInA64BitComponent()
    {
        var manifest = new WinReleaseManifest
        {
            Name = "App",
            Manufacturer = "Acme",
            DisplayVersion = "1.0.0",
            UpgradeCode = Guid.Parse("66666666-6666-6666-6666-666666666666"),
            Registry = [new RegistryEntry { Root = RegistryRoot.Hkcu, Key = @"SOFTWARE\WOW6432Node\X", Name = "A", Value = "1" }],
        };

        var doc = WxsGenerator.Generate(manifest, "C:/source");

        var value = doc.Descendants(Ns + "RegistryValue").Single(v => v.Attribute("Name")?.Value == "A");
        Assert.Equal(@"SOFTWARE\WOW6432Node\X", value.Attribute("Key")!.Value);
        Assert.Null(value.Parent!.Attribute("Bitness"));
    }

    private static WinReleaseManifest ManifestWith(params string[] hklmKeys) => new()
    {
        Name = "App",
        Manufacturer = "Acme",
        DisplayVersion = "1.0.0",
        UpgradeCode = Guid.Parse("77777777-7777-7777-7777-777777777777"),
        Registry = hklmKeys.Select((key, i) => new RegistryEntry { Root = RegistryRoot.Hklm, Key = key, Name = "V" + i, Value = "1" }).ToList(),
    };

    /// <summary>The guard against the Wow6432Node\Wow6432Node loop seen in badly authored packages: one WOW6432Node typed in a key becomes none in the built
    /// key (the 32-bit Component supplies it through Windows), so the result never holds more than the author wrote, minus the one Windows redirects.</summary>
    [Fact]
    public void Generate_ASingleWow6432Node_BecomesNoneInTheBuiltKey_AndTheComponentIs32Bit()
    {
        var doc = WxsGenerator.Generate(ManifestWith(@"SOFTWARE\WOW6432Node\Acme"), "C:/source");

        var value = doc.Descendants(Ns + "RegistryValue").Single(v => v.Attribute("Name")?.Value == "V0");
        Assert.Equal(@"SOFTWARE\Acme", value.Attribute("Key")!.Value);
        Assert.Equal("always32", value.Parent!.Attribute("Bitness")?.Value);
        Assert.DoesNotContain(doc.Descendants(Ns + "RegistryValue"), v => v.Attribute("Key")!.Value.Contains("WOW6432Node", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void Generate_NeverAddsAWow6432Node_ThatTheAuthorDidNotType()
    {
        var keys = new[] { @"SOFTWARE\Acme", @"SOFTWARE\WOW6432Node\Acme", @"SOFTWARE\WOW6432Node\WOW6432Node\Acme", @"SOFTWARE\Classes\WOW6432Node\CLSID\{X}" };
        var doc = WxsGenerator.Generate(ManifestWith(keys), "C:/source");

        var built = doc.Descendants(Ns + "RegistryValue").Select(v => v.Attribute("Key")!.Value).ToList();
        for (var i = 0; i < keys.Length; i++)
        {
            var typed = keys[i].Split('\\').Count(s => s.Equals("WOW6432Node", StringComparison.OrdinalIgnoreCase));
            var after = built[i].Split('\\').Count(s => s.Equals("WOW6432Node", StringComparison.OrdinalIgnoreCase));
            Assert.True(after <= typed, $"'{keys[i]}' built as '{built[i]}': it gained a WOW6432Node.");
        }
        // A WOW6432Node typed twice keeps exactly one: the second is the author's, not something we invent.
        Assert.Equal(@"SOFTWARE\WOW6432Node\Acme", built[2]);
    }
}
