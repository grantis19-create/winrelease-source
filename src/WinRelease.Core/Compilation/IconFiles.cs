using System.Reflection.PortableExecutable;
using System.Security.Cryptography;
using System.Text;

namespace WinRelease.Core.Compilation;

/// <summary>
/// ADR 0112: icons for the Add/Remove Programs entry and for shortcuts. Windows Installer wants small icon files in the Icon table
/// (Microsoft: "author separate files containing only the icons"), but wix copies a whole .exe/.dll named as an icon source into the MSI,
/// and builds a file that is not an icon without a word. This reads the first icon group out of a program file into a small .ico, and
/// checks that an icon file really is one.
/// </summary>
public static class IconFiles
{
    private const int ResourceTypeIcon = 3;
    private const int ResourceTypeGroupIcon = 14;

    /// <summary>The problem with <paramref name="path"/> as an icon source, or null when it is a usable .ico or a program file that holds an icon.</summary>
    public static string? Problem(string path)
    {
        try
        {
            var head = ReadHead(path);
            if (LooksLikeIco(head))
            {
                return IsConsistentIco(path) ? null : "is damaged (its image data does not fit inside the file)";
            }

            if (head.Length >= 2 && head[0] == 'M' && head[1] == 'Z')
            {
                return TryExtract(path) is null ? "has no icon inside it" : null;
            }

            return "is not an icon: use an .ico file, or a program (.exe/.dll) that has an icon inside";
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            return "could not be read";
        }
    }

    /// <summary>
    /// Writes the first icon of a program file to <paramref name="generatedRoot"/> as a small .ico and returns its path. A real .ico is
    /// returned as it is; null when the file is neither (see <see cref="Problem"/>).
    /// </summary>
    public static string? PrepareSource(string path, string generatedRoot)
    {
        if (!File.Exists(path))
        {
            return path;
        }

        var head = ReadHead(path);
        if (LooksLikeIco(head))
        {
            return path;
        }

        if (TryExtract(path) is not { } ico)
        {
            return null;
        }

        Directory.CreateDirectory(generatedRoot);
        var name = "icon-" + Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(Path.GetFullPath(path).ToLowerInvariant())))[..16].ToLowerInvariant() + ".ico";
        var target = Path.Combine(generatedRoot, name);
        File.WriteAllBytes(target, ico);
        return target;
    }

    /// <summary>The first icon group of a program file (the one Windows shows by default) as the bytes of an .ico file, or null when it has none.</summary>
    public static byte[]? TryExtract(string path)
    {
        try
        {
            using var stream = File.OpenRead(path);
            using var pe = new PEReader(stream);
            var directory = pe.PEHeaders.PEHeader?.ResourceTableDirectory;
            if (directory is not { Size: > 0 } resources)
            {
                return null;
            }

            var section = pe.GetSectionData(resources.RelativeVirtualAddress);
            if (section.Length == 0)
            {
                return null;
            }

            var root = section.GetContent().ToArray();
            var groupEntry = FirstLeaf(root, ResourceTypeGroupIcon, null, pe);
            if (groupEntry is not { } group || group.Length < 6)
            {
                return null;
            }

            var count = BitConverter.ToUInt16(group, 4);
            var images = new List<(byte[] Header, byte[] Data)>();
            for (var i = 0; i < count && 6 + (i + 1) * 14 <= group.Length; i++)
            {
                var entry = 6 + i * 14;
                var iconId = BitConverter.ToUInt16(group, entry + 12);
                if (FirstLeaf(root, ResourceTypeIcon, iconId, pe) is { } data && data.Length > 0)
                {
                    images.Add((group[entry..(entry + 12)], data));
                }
            }

            if (images.Count == 0)
            {
                return null;
            }

            using var output = new MemoryStream();
            using var writer = new BinaryWriter(output);
            writer.Write((ushort)0);
            writer.Write((ushort)1);
            writer.Write((ushort)images.Count);
            var offset = 6 + images.Count * 16;
            foreach (var (header, data) in images)
            {
                writer.Write(header[..8]); // width, height, colours, reserved, planes, bit count
                writer.Write(data.Length);
                writer.Write(offset);
                offset += data.Length;
            }

            foreach (var (_, data) in images)
            {
                writer.Write(data);
            }

            return output.ToArray();
        }
        catch (Exception ex) when (ex is BadImageFormatException or InvalidOperationException or ArgumentException or IOException or IndexOutOfRangeException)
        {
            return null;
        }
    }

    /// <summary>
    /// Finds the first resource of <paramref name="type"/> (the one with id <paramref name="id"/>, or the first of any id when null) and
    /// returns its bytes, following the type, name and language levels of the PE resource tree.
    /// </summary>
    private static byte[]? FirstLeaf(byte[] root, int type, int? id, PEReader pe)
    {
        var typeDirectory = FindEntry(root, 0, entryId: type, requireDirectory: true);
        if (typeDirectory is null)
        {
            return null;
        }

        var nameDirectory = FindEntry(root, typeDirectory.Value, entryId: id, requireDirectory: true);
        if (nameDirectory is null)
        {
            return null;
        }

        var leaf = FindEntry(root, nameDirectory.Value, entryId: null, requireDirectory: false);
        if (leaf is null)
        {
            return null;
        }

        var rva = BitConverter.ToInt32(root, leaf.Value);
        var size = BitConverter.ToInt32(root, leaf.Value + 4);
        if (size <= 0 || size > 16 * 1024 * 1024)
        {
            return null;
        }

        var block = pe.GetSectionData(rva);
        return block.Length < size ? null : block.GetContent(0, size).ToArray();
    }

    /// <summary>
    /// One step down the resource tree: the entry at <paramref name="directoryOffset"/> whose id is <paramref name="entryId"/>, or the
    /// first entry (named ones come first, as Windows lists them) when null. Returns the offset of the next directory, or of the data entry
    /// when <paramref name="requireDirectory"/> is false.
    /// </summary>
    private static int? FindEntry(byte[] root, int directoryOffset, int? entryId, bool requireDirectory)
    {
        var named = BitConverter.ToUInt16(root, directoryOffset + 12);
        var ids = BitConverter.ToUInt16(root, directoryOffset + 14);
        var total = named + ids;
        for (var i = 0; i < total; i++)
        {
            var entry = directoryOffset + 16 + i * 8;
            var name = BitConverter.ToUInt32(root, entry);
            var target = BitConverter.ToUInt32(root, entry + 4);
            var isNamed = (name & 0x80000000) != 0;
            if (entryId is { } wanted && (isNamed || (int)name != wanted))
            {
                continue;
            }

            var isDirectory = (target & 0x80000000) != 0;
            if (isDirectory != requireDirectory)
            {
                continue;
            }

            return (int)(target & 0x7FFFFFFF);
        }

        return null;
    }

    private static byte[] ReadHead(string path)
    {
        using var stream = File.OpenRead(path);
        var buffer = new byte[6];
        var read = stream.Read(buffer, 0, buffer.Length);
        return buffer[..read];
    }

    private static bool LooksLikeIco(byte[] head) => head.Length >= 6 && head[0] == 0 && head[1] == 0 && head[2] == 1 && head[3] == 0 && (head[4] | head[5] << 8) > 0;

    private static bool IsConsistentIco(string path)
    {
        var bytes = File.ReadAllBytes(path);
        var count = bytes[4] | bytes[5] << 8;
        if (bytes.Length < 6 + count * 16)
        {
            return false;
        }

        for (var i = 0; i < count; i++)
        {
            var entry = 6 + i * 16;
            var size = BitConverter.ToUInt32(bytes, entry + 8);
            var offset = BitConverter.ToUInt32(bytes, entry + 12);
            if (size == 0 || (long)offset + size > bytes.Length)
            {
                return false;
            }
        }

        return true;
    }
}
