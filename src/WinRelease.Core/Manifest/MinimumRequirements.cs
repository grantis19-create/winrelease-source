using System.Globalization;
using System.Text.RegularExpressions;

namespace WinRelease.Core.Manifest;

/// <summary>
/// The minimum a manifest has to satisfy for the MSI to build AND install, each rule checked against the real toolchain (wix 7.0.0 and msiexec on Windows 11, 2026-11-18).
/// Before these existed the Console said "Manifest is valid" for a version WiX refuses (WIX0108), a registry Integer of "abc" (the MSI built, then the install failed with 1603),
/// a Binary value of odd length (written as different bytes without a word), an Integer above 4294967295 (silently stored as 0), an empty or duplicate file destination, and a
/// package with nothing in it. See ADR 0122.
/// </summary>
public static partial class MinimumRequirements
{
    /// <summary>
    /// What WiX accepts for Package/@Version: an optional v, one to four numbers (each at most 4294967295), then an optional -label and an optional +metadata, made of letters,
    /// digits, hyphens and dots. Checked: "1", "1.0", "1.2.3.4", "01.0.0", "v1.0.0", "1.0.0-beta.1", "1.0.0+b5" build; "abc", "1.2.3.4.5", "1.0.0-", "1.0.0.", ".1", "1.-1.0",
    /// "1.0.0 beta", "1.0.0-beta_1" and "4294967296.0.0" fail with WIX0108. Whether a buildable version is a *usual* one is advice, not a rule (ADR 0094).
    /// </summary>
    public static bool IsBuildableVersion(string? version)
    {
        if (string.IsNullOrEmpty(version) || !VersionPattern().IsMatch(version))
        {
            return false;
        }

        var numbers = version.TrimStart('v').Split('-', '+')[0].Split('.');
        return numbers.All(n => ulong.TryParse(n, NumberStyles.None, CultureInfo.InvariantCulture, out var value) && value <= uint.MaxValue);
    }

    /// <summary>
    /// A package with nothing in it builds into an MSI that does nothing. Registry values, environment variables or shortcuts alone are enough (UAT T4-26/27, T3). This is not part of
    /// manifest validation, because a project being filled in is legitimately empty while it is saved (the Console just disables Build); the build refuses it instead (ADR 0122).
    /// </summary>
    public static bool HasNothingToInstall(WinReleaseManifest manifest) =>
        manifest.Files.Declared.Count == 0 && manifest.Files.Harvest.Count == 0 && manifest.Registry.Count == 0
        && manifest.EnvironmentVariables.Count == 0 && manifest.Shortcuts.Count == 0;

    public const string NothingToInstallMessage = "There is nothing to install yet. Add files, registry entries, environment variables or shortcuts, then build again.";

    /// <summary>
    /// An Integer registry value is written as a 32-bit number. Decimal digits with an optional minus sign install (-1, 42, 4294967295); "0x10", "1.5", " 42" and "" make the install
    /// fail with 1603, and 4294967296 is stored as 0 without any error. Null when the value is usable.
    /// </summary>
    public static string? IntegerProblem(string? value)
    {
        if (string.IsNullOrEmpty(value) || !IntegerPattern().IsMatch(value))
        {
            return "must be a whole number written in decimal digits (for example 42 or -1), with no spaces, decimals or 0x prefix";
        }

        if (!long.TryParse(value, NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture, out var number) || number < int.MinValue || number > uint.MaxValue)
        {
            return "must be between -2147483648 and 4294967295 (a larger number would be stored as the wrong value)";
        }

        return null;
    }

    /// <summary>
    /// A Binary registry value is hex digits in pairs. An odd count is read as different bytes ("ABC" became 0A BC) and spaces, commas, "0x" or letters beyond F make the install
    /// fail with 1603. The empty string is a valid empty binary value. Null when the value is usable.
    /// </summary>
    public static string? BinaryProblem(string? value) =>
        value is null || BinaryPattern().IsMatch(value)
            ? null
            : "must be pairs of hex digits (0-9, A-F) with no spaces, commas or 0x prefix, for example 0A1B2C";

    [GeneratedRegex(@"^v?\d+(\.\d+){0,3}(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$")]
    private static partial Regex VersionPattern();

    [GeneratedRegex(@"^-?\d+$")]
    private static partial Regex IntegerPattern();

    [GeneratedRegex(@"^([0-9A-Fa-f]{2})*$")]
    private static partial Regex BinaryPattern();
}
