using System.Text.RegularExpressions;

namespace WinRelease.Core.Compilation;

/// <summary>
/// The "Custom" shortcut target forms WinRelease understands: a web address, a <c>[Property]</c> path such as
/// <c>[INSTALLFOLDER]bin\tool.exe</c>, or a full Windows path such as <c>C:\Windows\System32\notepad.exe</c>.
/// Anything else would build and install but create no shortcut: MSI reads a Target with no square brackets as a
/// Feature name, so a literal path is carried in a private Property and the shortcut points at <c>[Property]</c>.
/// </summary>
public static partial class ShortcutTarget
{
    [GeneratedRegex(@"^([A-Za-z]:[\x5C/]|\x5C\x5C[^\x5C/]+[\x5C/])")]
    private static partial Regex AbsolutePathPattern();

    /// <summary>A drive path (<c>C:\...</c>) or a UNC path (two backslashes, then the server and share).</summary>
    public static bool IsAbsolutePath(string? target) => target is { Length: > 0 } && AbsolutePathPattern().IsMatch(target);

    /// <summary>A <c>[Property]</c>-prefixed target, which MSI formats into a path at install time.</summary>
    public static bool IsPropertyReference(string? target) => target is { Length: > 1 } && target[0] == '[' && target.IndexOf(']') > 1;

    /// <summary>
    /// Mixed-case on purpose: an all-uppercase name is a public property that msiexec's command line could override.
    /// Deterministic, so the same path always gives the same Id.
    /// </summary>
    public static string PropertyIdFor(Guid upgradeCode, string path) =>
        "ShortcutTarget_" + Uuidv5.Generate(upgradeCode, $"shortcut-target:{path}").ToString("N");
}
