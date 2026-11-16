using System.Text.RegularExpressions;

namespace WinRelease.Core.Compilation;

/// <summary>
/// WiX reads a run of <c>$</c> (or <c>!</c>) before <c>(</c> two at a time: each pair is one literal character, and an odd one left over
/// starts a variable. Verified with wix 7.0.0: <c>$$(env.USERNAME)</c> builds as the text <c>$(env.USERNAME)</c>, but
/// <c>$$$(env.USERNAME)</c> builds as <c>$</c> + the build host's user name. So escaping doubles the whole run, never only its last
/// character, and a value is safe exactly when every such run is even.
/// </summary>
public static partial class WixPreprocessorText
{
    /// <summary>The text WiX carries verbatim: every run of <c>$</c> or <c>!</c> before <c>(</c> doubled.</summary>
    public static string Escape(string value) =>
        value.Contains('(') ? MarkerRun().Replace(value, m => m.Value[..^1] + m.Value[..^1] + "(") : value;

    /// <summary>True when WiX would expand something in <paramref name="value"/> at build time (an odd run of <c>$</c> or <c>!</c> before <c>(</c>).</summary>
    public static bool Expands(string value) =>
        value.Contains('(') && MarkerRun().Matches(value).Any(m => (m.Length - 1) % 2 == 1);

    [GeneratedRegex(@"(?:\$+|!+)\(")]
    private static partial Regex MarkerRun();
}
