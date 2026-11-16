using WinRelease.Core.Manifest;

namespace WinRelease.Core.Compilation;

/// <summary>
/// ADR 0108. A .reg export shows the 32-bit view of the registry on 64-bit Windows under a <c>WOW6432Node</c> key. WOW6432Node is only the
/// physical home of the redirect, which Microsoft reserves ("applications should not access a key's physical location directly"), so the build
/// never writes that path with a 32-bit Component: it removes the segment and marks the Component 32-bit, and Windows Installer then lands in
/// the same place through the redirector. Doing this anywhere else would move data to the wrong key, because most of the registry is not
/// redirected: <c>HKCU\SOFTWARE</c> is shared, <c>Classes</c> is shared apart from a few children, and some <c>HKLM\SOFTWARE</c> keys are shared
/// (https://learn.microsoft.com/windows/win32/winprog64/shared-registry-keys). So exactly one segment is removed, and only at these places:
/// <list type="bullet">
/// <item><c>HKLM\SOFTWARE\WOW6432Node\...</c></item>
/// <item><c>HKLM or HKCU\SOFTWARE\Classes\WOW6432Node\{CLSID|Interface|DirectShow|Media Type|MediaFoundation}\...</c></item>
/// <item><c>HKCR\WOW6432Node\{same children}\...</c></item>
/// </list>
/// Any other key containing WOW6432Node is written exactly as typed.
/// </summary>
public static class Wow6432Redirect
{
    private const string Node = "WOW6432Node";

    /// <summary>The children of <c>Classes</c> that are redirected (the rest of <c>Classes</c> is shared) on Windows 7 and later.</summary>
    private static readonly string[] RedirectedClassesChildren = ["CLSID", "Interface", "DirectShow", "Media Type", "MediaFoundation"];

    /// <summary>True when <paramref name="key"/> under <paramref name="root"/> names the 32-bit view through WOW6432Node; <paramref name="resolvedKey"/> is the key without that one segment.</summary>
    public static bool TryResolve(RegistryRoot root, string key, out string resolvedKey)
    {
        resolvedKey = key;
        var segments = key.Split('\\');
        var nodeIndex = FindRedirectPoint(root, segments);
        if (nodeIndex < 0) return false;

        resolvedKey = string.Join('\\', segments.Where((_, i) => i != nodeIndex));
        return true;
    }

    /// <summary>True when the key contains a WOW6432Node segment that is not a redirect point, so it is written as typed.</summary>
    public static bool IsLiteralWowKey(RegistryRoot root, string key) =>
        key.Split('\\').Any(IsNode) && !TryResolve(root, key, out _);

    private static int FindRedirectPoint(RegistryRoot root, string[] s)
    {
        switch (root)
        {
            case RegistryRoot.Hklm:
                // SOFTWARE\WOW6432Node\<something>
                if (s.Length >= 3 && Is(s[0], "SOFTWARE") && IsNode(s[1])) return 1;
                return ClassesRedirect(s);
            case RegistryRoot.Hkcu:
                return ClassesRedirect(s);
            case RegistryRoot.Hkcr:
                // WOW6432Node\<redirected child>\...
                return s.Length >= 2 && IsNode(s[0]) && IsRedirectedClassesChild(s[1]) ? 0 : -1;
            default:
                return -1;
        }
    }

    // SOFTWARE\Classes\WOW6432Node\<redirected child>
    private static int ClassesRedirect(string[] s) =>
        s.Length >= 4 && Is(s[0], "SOFTWARE") && Is(s[1], "Classes") && IsNode(s[2]) && IsRedirectedClassesChild(s[3]) ? 2 : -1;

    private static bool IsRedirectedClassesChild(string name) => RedirectedClassesChildren.Any(c => Is(name, c));

    private static bool IsNode(string segment) => Is(segment, Node);

    private static bool Is(string a, string b) => a.Equals(b, StringComparison.OrdinalIgnoreCase);
}
