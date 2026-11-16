using System.IO.Compression;
using System.Xml.Linq;
using WinRelease.Core.Compilation;
using WinRelease.Core.Manifest;
using Xunit;

namespace WinRelease.Core.Tests;

/// <summary>UAT T7 (ADR 0089): hostile manifests and zips are refused or carried literally - never executed, expanded or crashed on.</summary>
public sealed class HostileInputTests
{
    private static readonly XNamespace Wix = "http://wixtoolset.org/schemas/v4/wxs";

    private static string Json(string name = "Hostile", string manufacturer = "M") =>
        $$$"""{"schemaVersion":1,"upgradeCode":"{{{Guid.NewGuid()}}}","name":{{{System.Text.Json.JsonSerializer.Serialize(name)}}},"manufacturer":{{{System.Text.Json.JsonSerializer.Serialize(manufacturer)}}},"displayVersion":"1.0.0","files":{"declared":[]}}""";

    [Theory]
    [InlineData("$(env.USERNAME)")]
    [InlineData("$(sys.CURRENTDIR)")]
    [InlineData("!(loc.ProductName)")]
    [InlineData("a $(var.X) b !(bind.property.ProductVersion)")]
    public void PreprocessorSyntax_IsEscapedSoTheBuildHostNeverExpandsIt(string text)
    {
        var manifest = ManifestParser.Parse(Json(name: text)).Manifest!;

        var doc = WxsGenerator.Generate(manifest, "C:/source");

        var name = doc.Descendants(Wix + "Package").Single().Attribute("Name")!.Value;
        // Only the escaped form is emitted; WiX reads "$$(" / "!!(" back as the literal text.
        Assert.Equal(text.Replace("$(", "$$(").Replace("!(", "!!("), name);
    }

    /// <summary>
    /// WiX reads "$$" as one literal "$", so "$$$(env.X)" is "$" + the variable (verified with wix 7.0.0: the MSI got the build
    /// machine's user name). Escaping only the last "$" of a run let a name typed as "$$(env.USERNAME)" through; the whole run is doubled.
    /// </summary>
    [Theory]
    [InlineData("$$(env.USERNAME)", "$$$$(env.USERNAME)")]
    [InlineData("$$$(env.USERNAME)", "$$$$$$(env.USERNAME)")]
    [InlineData("a$$(x) $(y)", "a$$$$(x) $$(y)")]
    [InlineData("!!(loc.X)", "!!!!(loc.X)")]
    [InlineData("costs $5 (approx)", "costs $5 (approx)")]
    public void APreprocessorRun_IsEscapedWhole(string text, string expected)
    {
        var manifest = ManifestParser.Parse(Json(name: text)).Manifest!;

        var name = WxsGenerator.Generate(manifest, "C:/source").Descendants(Wix + "Package").Single().Attribute("Name")!.Value;

        Assert.Equal(expected, name);
        Assert.False(WixPreprocessorText.Expands(name));
    }

    [Theory]
    [InlineData("a\\u0001b")]
    [InlineData("x\\ud800y")]
    [InlineData("\\uffff")]
    public void CharactersXmlCannotCarry_AreRejectedByTheParser(string escaped)
    {
        var json = $$$"""{"schemaVersion":1,"upgradeCode":"{{{Guid.NewGuid()}}}","name":"{{{escaped}}}","manufacturer":"M","displayVersion":"1.0.0","files":{"declared":[]}}""";

        var result = ManifestParser.Parse(json);

        Assert.False(result.IsSuccess);
        Assert.Contains("character", result.Errors.Values.SelectMany(v => v).First());
    }

    [Fact]
    public void TabsAndNewlinesInValuesAreStillFine() => Assert.True(ManifestParser.Parse(Json(name: "line1\nline2\ttab")).IsSuccess);

    [Theory]
    [InlineData("a.txt", true)]
    [InlineData("dir/a.txt", true)]
    [InlineData(".. /x", false)]
    [InlineData("..../x", false)]
    [InlineData("name /x", false)]
    [InlineData("name./x", false)]
    [InlineData("CON", false)]
    [InlineData("dir/NUL.txt", false)]
    [InlineData("com1", false)]
    [InlineData("a.txt:stream", false)]
    [InlineData("a\u0001b", false)]
    public void SourcePaths_RejectWindowsPathTricks(string path, bool safe) => Assert.Equal(safe, SourcePathRules.IsSafeRelative(path));

    [Theory]
    [InlineData("..", false)]
    [InlineData(".", false)]
    [InlineData("ok name", true)]
    [InlineData("trailing.", false)]
    [InlineData("a:b", false)]
    [InlineData("LPT3", false)]
    public void InstallSegments_RejectTraversalAndIllegalNames(string segment, bool ok) => Assert.Equal(ok, SourcePathRules.SegmentProblem(segment) is null);

    private static string ExtractDir() => Directory.CreateTempSubdirectory("winrelease-extract-").FullName;

    private static string ZipWith(params (string Name, string Content)[] entries)
    {
        var path = Path.Combine(Path.GetTempPath(), $"zip-{Guid.NewGuid():N}.zip");
        using var archive = ZipFile.Open(path, ZipArchiveMode.Create);
        foreach (var (name, content) in entries)
        {
            using var writer = new StreamWriter(archive.CreateEntry(name).Open());
            writer.Write(content);
        }

        return path;
    }

    [Theory]
    [InlineData("../evil.txt")]
    [InlineData("C:/evil.txt")]
    [InlineData("/evil.txt")]
    [InlineData("a/../../evil.txt")]
    [InlineData("CON")]
    [InlineData("x/aux.log")]
    [InlineData("s.txt:ads")]
    [InlineData("dir /x.txt")]
    public void Extractor_RefusesHostileEntryNames_AndWritesNothing(string entryName)
    {
        var zip = ZipWith(("ok.txt", "x"), (entryName, "evil"));
        var target = ExtractDir();
        try
        {
            Assert.Throws<BuildInputException>(() => SafeZipExtractor.Extract(zip, target, BuildLimits.Default));
            Assert.False(File.Exists(Path.Combine(Path.GetDirectoryName(target)!, "evil.txt")));
        }
        finally
        {
            Directory.Delete(target, recursive: true);
            File.Delete(zip);
        }
    }
}
