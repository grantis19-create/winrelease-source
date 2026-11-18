using WinRelease.Core.Compilation;
using WinRelease.Core.Manifest;
using Xunit;

namespace WinRelease.Core.Tests;

/// <summary>ADR 0122: what a manifest needs for the MSI to build and install. Every expectation here was measured with wix 7.0.0 and msiexec on Windows 11 (2026-11-18).</summary>
public sealed class MinimumRequirementsTests
{
    [Theory]
    [InlineData("1", true)]
    [InlineData("1.0", true)]
    [InlineData("1.2.3.4", true)]
    [InlineData("01.0.0", true)]
    [InlineData("v1.0.0", true)]
    [InlineData("1.0.0-beta.1", true)]
    [InlineData("1.0.0-BETA", true)]
    [InlineData("1.0.0-1", true)]
    [InlineData("1.0.0+build5", true)]
    [InlineData("1.0.0-beta+x", true)]
    [InlineData("4294967295.0.0", true)]
    [InlineData("65535.65535.65535.65535", true)]
    [InlineData("abc", false)]
    [InlineData("", false)]
    [InlineData("1.2.3.4.5", false)]
    [InlineData("1.0.0-", false)]
    [InlineData("1.0.0-beta_1", false)]
    [InlineData("1.0.0.", false)]
    [InlineData(".1", false)]
    [InlineData("1.-1.0", false)]
    [InlineData("1.0.0 beta", false)]
    [InlineData(" 1.0.0 ", false)]
    [InlineData("4294967296.0.0", false)]
    [InlineData("99999999999.0.0", false)]
    [InlineData("1.0.0é", false)]
    [InlineData("x.y", false)]
    public void IsBuildableVersion_MatchesWhatWixAccepts(string version, bool expected) =>
        Assert.Equal(expected, MinimumRequirements.IsBuildableVersion(version));

    [Theory]
    [InlineData("42", true)]
    [InlineData("0", true)]
    [InlineData("-1", true)]
    [InlineData("-2147483648", true)]
    [InlineData("4294967295", true)]
    [InlineData("4294967296", false)]
    [InlineData("-2147483649", false)]
    [InlineData("abc", false)]
    [InlineData("0x10", false)]
    [InlineData("1.5", false)]
    [InlineData(" 42", false)]
    [InlineData("42 ", false)]
    [InlineData("", false)]
    public void IntegerProblem_AcceptsOnlyWhatInstalls(string value, bool usable) =>
        Assert.Equal(usable, MinimumRequirements.IntegerProblem(value) is null);

    [Theory]
    [InlineData("", true)]
    [InlineData("0A1B", true)]
    [InlineData("0a1b", true)]
    [InlineData("00", true)]
    [InlineData("ABC", false)]
    [InlineData("0A 1B", false)]
    [InlineData("0A,1B", false)]
    [InlineData("0x0A1B", false)]
    [InlineData("GG", false)]
    public void BinaryProblem_AcceptsOnlyWhatInstalls(string value, bool usable) =>
        Assert.Equal(usable, MinimumRequirements.BinaryProblem(value) is null);

    private static string Json(string extra = "", string version = "1.0.0", string files = """[{"id":"A","sourcePath":"a.txt","installPath":"a.txt"}]""") =>
        $$$"""{"schemaVersion":1,"upgradeCode":"3F2504E0-4F89-41D3-9A0C-0305E82C3301","name":"App","manufacturer":"Acme","displayVersion":"{{{version}}}","files":{"declared":{{{files}}}}{{{(extra.Length > 0 ? "," + extra : "")}}}}""";

    private static string Registry(string type, string value) =>
        "\"registry\":[{\"root\":\"hkcu\",\"key\":\"Software\\\\Acme\",\"name\":\"N\",\"value\":\"" + value + "\",\"valueType\":\"" + type + "\"}]";

    private static IReadOnlyDictionary<string, string[]> Errors(string json) => ManifestParser.Parse(json).Errors;

    [Fact]
    public void ANormalManifest_IsValid() => Assert.True(ManifestParser.Parse(Json()).IsSuccess);

    [Theory]
    [InlineData("abc")]
    [InlineData("1.2.3.4.5")]
    [InlineData("1.0.0 beta")]
    [InlineData("99999999999.0.0")]
    public void ADisplayVersionWixRefuses_IsRejectedBeforeTheBuild(string version)
    {
        var errors = Errors(Json(version: version));

        Assert.Contains("displayVersion", errors.Keys);
        Assert.Contains("isn't a version Windows Installer can build", errors["displayVersion"][0]);
    }

    [Fact]
    public void AnExplicitProductVersionWixRefuses_IsRejected() =>
        Assert.Contains("productVersion", Errors(Json(extra: "\"productVersion\":\"x.y\"")).Keys);

    [Fact]
    public void ALabelledDisplayVersion_StillBuildsBecauseTheLabelIsStripped() =>
        Assert.True(ManifestParser.Parse(Json(version: "2.4.1-beta.1")).IsSuccess);

    [Fact]
    public void ANonStandardButBuildableVersion_IsOnlyAdvice_NotAnError() =>
        Assert.True(ManifestParser.Parse(Json(version: "300.0.0")).IsSuccess);

    [Fact]
    public void APinnedEmptyProductCode_IsRejected() =>
        Assert.Contains("productCode", Errors(Json(extra: "\"productCode\":\"00000000-0000-0000-0000-000000000000\"")).Keys);

    [Fact]
    public void APinnedProductCodeEqualToTheUpgradeCode_IsRejected() =>
        Assert.Contains("productCode", Errors(Json(extra: "\"productCode\":\"3F2504E0-4F89-41D3-9A0C-0305E82C3301\"")).Keys);

    [Fact]
    public void APinnedProductCodeThatIsAGoodGuid_IsAccepted() =>
        Assert.True(ManifestParser.Parse(Json(extra: "\"productCode\":\"0A1B2C3D-4E5F-4A6B-8C7D-9E0F1A2B3C4D\"")).IsSuccess);

    [Fact]
    public void APackageWithNothingInIt_IsStillAValidDraft_ButTheBuildRefusesIt()
    {
        var manifest = ManifestParser.Parse(Json(files: "[]")).Manifest!;

        Assert.True(MinimumRequirements.HasNothingToInstall(manifest));
        var outcome = MsiBuildPipeline.RunAsync(manifest, new MemoryStream(), new NeverRuns()).GetAwaiter().GetResult();

        Assert.False(outcome.Succeeded);
        Assert.Equal(MinimumRequirements.NothingToInstallMessage, outcome.StandardError);
    }

    [Fact]
    public void ARegistryEntryAlone_CountsAsSomethingToInstall() =>
        Assert.False(MinimumRequirements.HasNothingToInstall(ManifestParser.Parse(Json(files: "[]", extra: Registry("string", "v"))).Manifest!));

    [Fact]
    public void RegistryAloneIsEnoughToInstall() =>
        Assert.True(ManifestParser.Parse(Json(files: "[]", extra: Registry("string", "v"))).IsSuccess);

    [Fact]
    public void AnEnvironmentVariableAloneIsEnoughToInstall() =>
        Assert.True(ManifestParser.Parse(Json(files: "[]", extra: "\"environmentVariables\":[{\"name\":\"ACME_HOME\",\"value\":\"x\",\"action\":\"set\",\"scope\":\"machine\"}]")).IsSuccess);

    [Theory]
    [InlineData("""[{"id":"A","sourcePath":"a.txt","installPath":""}]""")]
    [InlineData("""[{"id":"A","sourcePath":"a.txt","installPath":"dir/"}]""")]
    [InlineData("""[{"id":"A","sourcePath":"a.txt","installPath":"dir\\"}]""")]
    public void AFileWithoutAFileNameAtTheEndOfItsInstallPath_IsRejected(string files) =>
        Assert.Contains("files.declared.installPath", Errors(Json(files: files)).Keys);

    [Fact]
    public void TwoFilesToTheSameDestination_AreRejected_EvenWhenOnlyTheCaseDiffers()
    {
        var errors = Errors(Json(files: """[{"id":"A","sourcePath":"a.txt","installPath":"Same.txt"},{"id":"B","sourcePath":"b.txt","installPath":"sub/../same.TXT"}]"""));
        // "sub/../" is refused by the path rules on its own; the plain case-only duplicate is what this checks.
        var plain = Errors(Json(files: """[{"id":"A","sourcePath":"a.txt","installPath":"Same.txt"},{"id":"B","sourcePath":"b.txt","installPath":"same.TXT"}]"""));

        Assert.NotEmpty(errors);
        Assert.Contains(plain["files.declared.installPath"], m => m.Contains("both install to"));
    }

    [Fact]
    public void TheSameInstallPathUnderDifferentRoots_IsNotADuplicate() =>
        Assert.True(ManifestParser.Parse(Json(files: """[{"id":"A","sourcePath":"a.txt","installPath":"x.txt"},{"id":"B","sourcePath":"b.txt","installPath":"x.txt","root":"programFilesFolder"}]""")).IsSuccess);

    [Theory]
    [InlineData("integer", "abc")]
    [InlineData("integer", "0x10")]
    [InlineData("integer", "4294967296")]
    [InlineData("integer", "")]
    [InlineData("binary", "ABC")]
    [InlineData("binary", "0A 1B")]
    public void ARegistryValueThatCannotBeInstalled_IsRejected(string type, string value) =>
        Assert.Contains("registry.value", Errors(Json(extra: Registry(type, value))).Keys);

    [Theory]
    [InlineData("integer", "42")]
    [InlineData("integer", "-1")]
    [InlineData("integer", "4294967295")]
    [InlineData("binary", "0A1B")]
    [InlineData("binary", "")]
    [InlineData("string", "anything [at] all")]
    public void ARegistryValueThatInstalls_IsAccepted(string type, string value)
    {
        var result = ManifestParser.Parse(Json(extra: Registry(type, value)));

        Assert.True(result.IsSuccess, string.Join(" | ", result.Errors.SelectMany(e => e.Value.Select(m => e.Key + ": " + m))));
    }

    private sealed class NeverRuns : IProcessRunner
    {
        public ProcessResult Run(ProcessStartRequest request) => throw new InvalidOperationException("wix should never start for an empty package.");
    }
}
