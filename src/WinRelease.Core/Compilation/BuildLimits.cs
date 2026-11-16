using WinRelease.Core.Manifest;
using System.IO.Compression;

namespace WinRelease.Core.Compilation;

/// <summary>
/// Resource ceilings for one build. Defaults suit a single customer's installer sources; a public
/// host should keep them (or lower them) - the point is that no upload, however crafted, can make the
/// build host write unbounded data or run unbounded work.
/// </summary>
public sealed record BuildLimits
{
    public static BuildLimits Default { get; } = new();

    /// <summary>Most entries (files + folders) the sources zip may contain.</summary>
    public int MaxEntries { get; init; } = 20_000;

    /// <summary>Most total bytes the zip may expand to - counted while extracting, never trusted from the zip's own headers.</summary>
    public long MaxTotalUncompressedBytes { get; init; } = 1L * 1024 * 1024 * 1024;

    /// <summary>Most bytes any single extracted file may be.</summary>
    public long MaxEntryBytes { get; init; } = 512L * 1024 * 1024;

    /// <summary>Hard wall-clock limit for the <c>wix build</c> process; it is killed (with its children) past this.</summary>
    public TimeSpan WixTimeout { get; init; } = TimeSpan.FromMinutes(5);
}

/// <summary>A build input broke a <see cref="BuildLimits"/> ceiling or isn't a usable zip - a user-facing message, not a server fault.</summary>
public sealed class BuildInputException(string message) : Exception(message);

/// <summary>
/// Extracts a sources zip with limits. <see cref="ZipFile.ExtractToDirectory(string,string)"/> alone
/// blocks path traversal but not a zip bomb (a few KB expanding to terabytes), so each entry is copied
/// by hand with a running byte budget that aborts the moment it's exceeded.
/// </summary>
public static class SafeZipExtractor
{
    public static void Extract(string zipPath, string destinationDirectory, BuildLimits limits)
    {
        var root = Path.GetFullPath(destinationDirectory).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar) + Path.DirectorySeparatorChar;

        try
        {
            using var archive = ZipFile.OpenRead(zipPath);

            if (archive.Entries.Count > limits.MaxEntries)
            {
                throw new BuildInputException($"The sources zip has {archive.Entries.Count:N0} entries; the limit is {limits.MaxEntries:N0}.");
            }

            long total = 0;
            foreach (var entry in archive.Entries)
            {
                if (!SourcePathRules.IsSafeRelative(entry.FullName.TrimEnd('/')))
                {
                    throw new BuildInputException($"The sources zip contains an entry name that isn't allowed: '{Printable(entry.FullName)}' (drive letters, '..', device names such as CON/NUL, ':' streams and control characters are refused).");
                }

                var target = Path.GetFullPath(Path.Combine(root, entry.FullName));
                if (!target.StartsWith(root, StringComparison.OrdinalIgnoreCase))
                {
                    throw new BuildInputException($"The sources zip contains an entry that escapes the extraction folder: '{entry.FullName}'.");
                }

                // A trailing separator marks a directory entry (empty Name).
                if (entry.Name.Length == 0)
                {
                    Directory.CreateDirectory(target);
                    continue;
                }

                Directory.CreateDirectory(Path.GetDirectoryName(target)!);

                using var input = entry.Open();
                using var output = File.Create(target);
                var buffer = new byte[81920];
                long entryBytes = 0;
                int read;
                while ((read = input.Read(buffer, 0, buffer.Length)) > 0)
                {
                    entryBytes += read;
                    total += read;
                    if (entryBytes > limits.MaxEntryBytes)
                    {
                        throw new BuildInputException($"'{entry.FullName}' expands past the per-file limit of {limits.MaxEntryBytes / (1024 * 1024):N0} MB.");
                    }

                    if (total > limits.MaxTotalUncompressedBytes)
                    {
                        throw new BuildInputException($"The sources zip expands past the total limit of {limits.MaxTotalUncompressedBytes / (1024 * 1024):N0} MB.");
                    }

                    output.Write(buffer, 0, read);
                }
            }
        }
        catch (InvalidDataException ex)
        {
            throw new BuildInputException($"The sources upload isn't a valid zip file ({ex.Message}).");
        }
        catch (Exception ex) when (ex is DirectoryNotFoundException or PathTooLongException or ArgumentException)
        {
            throw new BuildInputException($"The sources zip contains a file or folder name Windows can't create ({ex.GetType().Name}).");
        }
        catch (NotSupportedException ex)
        {
            throw new BuildInputException($"The sources zip uses a feature that isn't supported (encryption or an unusual compression method): {ex.Message}");
        }
    }

    private static string Printable(string name) => new string(name.Select(c => char.IsControl(c) ? '?' : c).Take(120).ToArray());
}
