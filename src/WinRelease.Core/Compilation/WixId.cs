using System.Text;

namespace WinRelease.Core.Compilation;

/// <summary>Sanitizes a string into a legal WiX identifier ([A-Za-z_][A-Za-z0-9_.]*).</summary>
public static class WixId
{
    public static string Sanitize(string value)
    {
        var builder = new StringBuilder(value.Length);

        foreach (var c in value)
        {
            builder.Append(char.IsAsciiLetterOrDigit(c) || c is '_' or '.' ? c : '_');
        }

        if (builder.Length == 0 || char.IsAsciiDigit(builder[0]))
        {
            builder.Insert(0, '_');
        }

        return builder.ToString();
    }
}
