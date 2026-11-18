namespace WinRelease.Helper;

/// <summary>
/// What a first-run PC is missing besides <c>wix</c> itself, and how a failed build should say so. The installer screens (Installer Screens in App Info,
/// on by default) need the WiX UI extension, which WiX 7 does not bring with the tool: it is added once with <c>wix extension add</c>. Without it
/// the build stops with the raw WIX0144 below, which means nothing to someone who has never used WiX.
/// </summary>
public static class WixSetup
{
    public const string UiExtensionId = "WixToolset.UI.wixext";

    /// <summary>
    /// The command that adds the extension. WiX 7 refuses every command until the person has accepted its terms, and the Helper's own acceptance covers
    /// only the commands the Helper runs, so the flag is part of the command the person types: the acceptance stays theirs, in plain sight.
    /// </summary>
    public const string AddUiExtensionCommand = "wix extension add --global WixToolset.UI.wixext/7.0.0 -acceptEula wix7";

    /// <summary>The headline when the <c>wix</c> tool itself is not on this PC (a build was asked for before the setup guide's step 2): plain words and the two commands.</summary>
    public const string MissingToolTitle =
        "WiX is not installed on this PC yet, so the MSI cannot be built. In a normal terminal run: dotnet tool install --global wix --version 7.0.0  then  " +
        AddUiExtensionCommand + "  (this needs the .NET 10 SDK first: winget install Microsoft.DotNet.SDK.10). The Helper notices when it is done, no restart needed. See Settings for the full steps.";

    /// <summary>True when the output of <c>wix extension list --global</c> includes the UI extension.</summary>
    public static bool ListShowsUiExtension(string? listOutput) =>
        listOutput is not null && listOutput.Split('\n').Any(line => line.TrimStart().StartsWith(UiExtensionId, StringComparison.OrdinalIgnoreCase));

    /// <summary>The headline for a failed build: plain words, with the exact fix when the cause is the missing UI extension; the compiler's own log follows unchanged.</summary>
    public static string FailureTitle(string? standardOutput, string? standardError)
    {
        var log = $"{standardOutput}\n{standardError}";
        return log.Contains("WIX0144", StringComparison.Ordinal) && log.Contains(UiExtensionId, StringComparison.OrdinalIgnoreCase)
            ? "WiX is missing its installer-screens add-on (WixToolset.UI.wixext). In a normal terminal run: " + AddUiExtensionCommand + "  (the last part accepts the WiX terms, see Build Help > Disclaimer). Then build again. " +
              "Or switch off Installer Screens in App Info to build without it."
            : "The MSI could not be built. The compiler's own output is below.";
    }
}
