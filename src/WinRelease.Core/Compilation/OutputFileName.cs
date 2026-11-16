using System.Text;

namespace WinRelease.Core.Compilation;

/// <summary>
/// Builds a human-readable, Windows-filesystem-legal file name for a compiled artifact (the
/// `.msi`/`.intunewin` the user actually downloads and sees in Explorer) - distinct from
/// <see cref="WixId"/>, which produces a WiX XML identifier (no spaces, must start with a
/// letter/underscore) for an entirely different purpose. Reusing WixId.Sanitize here turned every
/// space in the product name into an underscore (e.g. "Hide Empty Roots Test" -> downloaded as
/// "Hide_Empty_Roots_Test-1.0.0.msi") - this instead only replaces the characters Windows actually
/// forbids in a file name, keeping spaces and the rest of the product name readable.
/// </summary>
public static class OutputFileName
{
    private static readonly char[] IllegalChars = Path.GetInvalidFileNameChars();

    /// <summary>Longest product-name part of an output file name (the version and extension are added after).</summary>
    public const int MaxLength = 100;

    public static string Sanitize(string value)
    {
        var builder = new StringBuilder(value.Length);

        foreach (var c in value)
        {
            builder.Append(Array.IndexOf(IllegalChars, c) >= 0 ? '_' : c);
        }

        // A trailing space or period is stripped by Windows itself when a file is actually saved
        // with one - trimming here keeps the name WixCompiler builds matching what Explorer would
        // show for the same string, not a name with an invisible difference from what's expected.
        // Capped so a very long product name can't push the downloaded file's path past Windows' 260-character limit.
        if (builder.Length > MaxLength)
        {
            builder.Length = MaxLength;
        }

        var trimmed = builder.ToString().Trim().TrimEnd('.');
        return trimmed.Length == 0 ? "WinRelease" : trimmed;
    }
}
