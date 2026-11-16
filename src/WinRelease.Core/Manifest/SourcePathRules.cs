namespace WinRelease.Core.Manifest;

/// <summary>
/// Rules for manifest paths that WiX reads from the uploaded sources (<c>sourcePath</c>,
/// <c>sourceFolder</c>, shortcut/ARP <c>iconPath</c>). Without them a manifest could name
/// <c>C:\Windows\win.ini</c> or <c>..\..\secrets.txt</c> and have the build host read an arbitrary
/// local file into the produced MSI - a file-disclosure hole once the compiler is reachable by
/// anyone but its owner. Enforced twice: at manifest validation (a clear, early error) and again
/// when the build resolves each path against the extracted sources (defense in depth).
/// </summary>
public static class SourcePathRules
{
    private static readonly char[] Separators = ['/', '\\'];

    /// <summary>True for a non-empty, relative path with no drive/UNC/rooted form and no <c>..</c> segment.</summary>
    public static bool IsSafeRelative(string? path)
    {
        if (string.IsNullOrWhiteSpace(path) || path.Contains('\0') || path.Contains(':'))
        {
            return false;
        }

        if (path[0] is '/' or '\\')
        {
            return false;
        }

        // Windows silently drops trailing dots and spaces from a path segment, so ".. " or "..." can still mean ".."; and a
        // segment such as CON or NUL is a device, not a file. Both are refused (found by UAT T7).
        foreach (var segment in path.Split(Separators))
        {
            if (segment == "." || segment.Length == 0)
            {
                continue;
            }

            var trimmed = segment.TrimEnd(' ', '.');
            if (trimmed.Length == 0 || trimmed.Length != segment.Length || IsReservedDeviceName(trimmed) || segment.Any(char.IsControl))
            {
                return false;
            }
        }

        return true;
    }

    private static readonly HashSet<string> ReservedNames = new(StringComparer.OrdinalIgnoreCase)
    {
        "CON", "PRN", "AUX", "NUL", "CONIN$", "CONOUT$",
        "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
        "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
    };

    private static readonly char[] InvalidSegmentChars = ['<', '>', ':', '"', '|', '?', '*', '\\', '/'];

    /// <summary>
    /// A folder or file name an installer can create: not "." or "..", no characters Windows forbids in names, no control
    /// characters, no device names (CON, NUL...), no trailing dot or space, at most 255 characters. Used for install paths
    /// and the target directory - a ".." segment would otherwise make the MSI write outside the folder it declares.
    /// </summary>
    public static string? SegmentProblem(string segment)
    {
        if (segment is "." or "..")
        {
            return $"'{segment}' isn't allowed";
        }

        if (segment.Length > 255)
        {
            return "a name longer than 255 characters";
        }

        if (segment.IndexOfAny(InvalidSegmentChars) >= 0 || segment.Any(char.IsControl))
        {
            return $"'{segment}' contains a character Windows doesn't allow in a file or folder name";
        }

        if (segment.EndsWith(' ') || segment.EndsWith('.'))
        {
            return $"'{segment}' ends with a dot or space, which Windows removes";
        }

        return IsReservedDeviceName(segment) ? $"'{segment}' is a reserved Windows device name" : null;
    }

    /// <summary>
    /// The narrower check for the freeform target directory (ADR 0038 deliberately leaves segment text to WiX/MSI): only
    /// traversal ("." / "..") and control characters, which can send files outside the folder the package declares.
    /// </summary>
    public static string? TraversalProblem(string segment) =>
        segment is "." or ".." ? $"'{segment}' isn't allowed" : segment.Any(char.IsControl) ? "a control character isn't allowed" : null;

    /// <summary>The first problem in a slash- or backslash-separated install path, or null when every segment is usable.</summary>
    public static string? InstallPathProblem(string? installPath)
    {
        foreach (var segment in (installPath ?? "").Split(Separators, StringSplitOptions.RemoveEmptyEntries))
        {
            if (SegmentProblem(segment) is { } problem)
            {
                return problem;
            }
        }

        return null;
    }

    /// <summary>True for a Windows device name, with or without an extension (<c>CON</c>, <c>nul.txt</c>, <c>COM1.log</c>).</summary>
    public static bool IsReservedDeviceName(string segment)
    {
        var stem = segment.Split('.')[0].TrimEnd(' ');
        return ReservedNames.Contains(stem);
    }

    /// <summary>
    /// Combines <paramref name="relative"/> onto <paramref name="root"/> and returns the full path only
    /// if it still lies inside <paramref name="root"/>; null when it escapes (or the path is unsafe).
    /// </summary>
    public static string? ResolveContained(string root, string? relative)
    {
        if (!IsSafeRelative(relative))
        {
            return null;
        }

        var rootFull = Path.GetFullPath(root).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar) + Path.DirectorySeparatorChar;
        var full = Path.GetFullPath(Path.Combine(rootFull, relative!));
        return full.StartsWith(rootFull, StringComparison.OrdinalIgnoreCase) ? full : null;
    }
}
