using Xunit;

namespace WinRelease.Helper.Tests;

/// <summary>A fresh PC has wix but not the UI extension: say so in plain words instead of the raw WIX0144.</summary>
public sealed class WixSetupTests
{
    private const string RawError = "wix.exe : error WIX0144: The extension 'WixToolset.UI.wixext' could not be found. Checked paths: WixToolset.UI.wixext";

    [Fact]
    public void TheMissingUiExtensionGetsAHeadlineWithTheExactFix()
    {
        var title = WixSetup.FailureTitle("", RawError);

        Assert.Contains("wix extension add --global WixToolset.UI.wixext/7.0.0 -acceptEula wix7", title);
        Assert.Contains("Installer Screens", title);
    }

    [Fact]
    public void AnyOtherFailureGetsAPlainHeadlineAndLeavesTheCompilerLogAlone() =>
        Assert.StartsWith("The MSI could not be built", WixSetup.FailureTitle("", "wix.exe : error WIX0006: a name is required"));

    [Fact]
    public void ADifferentMissingExtensionIsNotMistakenForTheUiOne() =>
        Assert.StartsWith("The MSI could not be built", WixSetup.FailureTitle("", "error WIX0144: The extension 'WixToolset.Util.wixext' could not be found."));

    [Fact]
    public void AMissingWixToolGetsAHeadlineWithBothCommandsAndNoRestartNeeded()
    {
        var title = WixSetup.MissingToolTitle;

        Assert.Contains("dotnet tool install --global wix --version 7.0.0", title);
        Assert.Contains(WixSetup.AddUiExtensionCommand, title);
        Assert.Contains("winget install Microsoft.DotNet.SDK.9", title);
        Assert.Contains("no restart needed", title);
    }

    [Theory]
    [InlineData("WixToolset.UI.wixext 7.0.0\nWixToolset.Util.wixext 7.0.0", true)]
    [InlineData("WixToolset.Util.wixext 7.0.0\r\n  WixToolset.UI.wixext 7.0.0\r\n", true)]
    [InlineData("WixToolset.Util.wixext 7.0.0", false)]
    [InlineData("", false)]
    [InlineData(null, false)]
    public void TheExtensionListIsReadLineByLine(string? output, bool expected) => Assert.Equal(expected, WixSetup.ListShowsUiExtension(output));
}
