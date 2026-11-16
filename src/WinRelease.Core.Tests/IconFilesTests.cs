using WinRelease.Core.Compilation;
using WinRelease.Core.Manifest;
using Xunit;

namespace WinRelease.Core.Tests;

/// <summary>ADR 0112: icons are small .ico files, and a file that is not an icon is refused in plain words.</summary>
public sealed class IconFilesTests : IDisposable
{
    private readonly string _dir = Directory.CreateTempSubdirectory("winrelease-icons-").FullName;

    public void Dispose() => Directory.Delete(_dir, recursive: true);

    private static readonly string Regedit = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), "regedit.exe");

    private string Write(string name, byte[] bytes)
    {
        var path = Path.Combine(_dir, name);
        File.WriteAllBytes(path, bytes);
        return path;
    }

    /// <summary>A 1-image .ico: header, one directory entry, a few bytes of "image".</summary>
    private static byte[] TinyIco(int declaredSize = 4) =>
        [0, 0, 1, 0, 1, 0, 16, 16, 0, 0, 1, 0, 32, 0, (byte)declaredSize, 0, 0, 0, 22, 0, 0, 0, 1, 2, 3, 4];

    [Fact]
    public void AnIcoFileIsAccepted() => Assert.Null(IconFiles.Problem(Write("a.ico", TinyIco())));

    [Fact]
    public void AnIcoWhoseImageDataRunsPastTheEndIsDamaged() =>
        Assert.Contains("damaged", IconFiles.Problem(Write("a.ico", TinyIco(declaredSize: 200))));

    [Fact]
    public void AnIcoIsJudgedByItsContentNotItsName() => Assert.Null(IconFiles.Problem(Write("renamed.png", TinyIco())));

    [Fact]
    public void TextWithAPngNameIsNotAnIcon() =>
        Assert.Contains("not an icon", IconFiles.Problem(Write("pic.png", "not an icon"u8.ToArray())));

    [Fact]
    public void ATextFileNamedExeIsNotAnIcon() =>
        Assert.Contains("not an icon", IconFiles.Problem(Write("fake.exe", "not really an exe"u8.ToArray())));

    [Fact]
    public void AProgramWithAnIconYieldsASmallIco()
    {
        if (!File.Exists(Regedit)) return;

        var ico = IconFiles.TryExtract(Regedit);

        Assert.NotNull(ico);
        Assert.True(ico!.Length < 200_000, $"icon is {ico.Length} bytes");
        Assert.Equal([0, 0, 1, 0], ico[..4]);
        var path = Write("extracted.ico", ico);
        Assert.Null(IconFiles.Problem(path));
        Assert.Null(IconFiles.Problem(Regedit));
    }

    [Fact]
    public void PrepareSource_LeavesAnIcoAlone_AndReplacesAProgramWithItsIcon()
    {
        var generated = Path.Combine(_dir, "generated");
        var ico = Write("a.ico", TinyIco());

        Assert.Equal(ico, IconFiles.PrepareSource(ico, generated));
        if (!File.Exists(Regedit)) return;
        var extracted = IconFiles.PrepareSource(Regedit, generated);
        Assert.NotNull(extracted);
        Assert.EndsWith(".ico", extracted);
        Assert.True(new FileInfo(extracted!).Length < new FileInfo(Regedit).Length / 2);
    }

    [Fact]
    public void AutoExtract_SkipsAProgramWithoutAnIconAndTakesTheNextOne()
    {
        if (!File.Exists(Regedit)) return;
        File.WriteAllText(Path.Combine(_dir, "first.exe"), "no icon here");
        File.Copy(Regedit, Path.Combine(_dir, "second.exe"));
        var manifest = new WinReleaseManifest
        {
            UpgradeCode = Guid.NewGuid(), Name = "P", Manufacturer = "M", DisplayVersion = "1.0.0",
            AppInfo = new AppInfo { AutoExtractIcon = true },
            Files = new ManifestFiles
            {
                Declared =
                [
                    new DeclaredFile { Id = "First", SourcePath = "first.exe", InstallPath = "first.exe" },
                    new DeclaredFile { Id = "Second", SourcePath = "second.exe", InstallPath = "second.exe" },
                ],
            },
        };

        var doc = WxsGenerator.Generate(manifest, _dir, Path.Combine(_dir, "generated"));

        var icon = doc.Descendants(System.Xml.Linq.XName.Get("Icon", "http://wixtoolset.org/schemas/v4/wxs")).Single();
        Assert.EndsWith(".ico", icon.Attribute("SourceFile")!.Value);
    }
}
