using System.Xml.Linq;
using WinRelease.Core.Compilation;
using WinRelease.Core.Manifest;
using Xunit;

namespace WinRelease.Core.Tests;

/// <summary>COM class/type library registration (ADR 0083): nested in the server file's own one-file Component.</summary>
public sealed class ComRegistrationTests : IDisposable
{
    private static readonly XNamespace Wix = "http://wixtoolset.org/schemas/v4/wxs";
    private readonly string _sourceRoot = Directory.CreateTempSubdirectory("winrelease-com-").FullName;
    private readonly Guid _classId = Guid.Parse("22222222-2222-3333-4444-555555555555");
    private readonly Guid _typeLibId = Guid.Parse("33333333-2222-3333-4444-555555555555");

    private WinReleaseManifest Manifest(List<ComClass>? classes = null, List<ComTypeLib>? typeLibs = null)
    {
        File.WriteAllText(Path.Combine(_sourceRoot, "server.dll"), "fake dll");
        return new WinReleaseManifest
        {
            UpgradeCode = Guid.NewGuid(),
            Name = "Com Test",
            Manufacturer = "WinRelease Tests",
            DisplayVersion = "1.0.0",
            Files = new ManifestFiles { Declared = [new DeclaredFile { Id = "Server", SourcePath = "server.dll", InstallPath = "server.dll" }] },
            ComClasses = classes ?? [],
            ComTypeLibs = typeLibs ?? [],
        };
    }

    [Fact]
    public void Generate_NestsClassProgIdAndTypeLibInsideTheServerFilesOwnComponent()
    {
        var manifest = Manifest(
            [new ComClass { ClassId = _classId, FileId = "Server", ThreadingModel = ComThreadingModel.Apartment, Description = "Widget", ProgId = "Acme.Widget.1", VersionIndependentProgId = "Acme.Widget" }],
            [new ComTypeLib { TypeLibId = _typeLibId, FileId = "Server", Description = "Widget Lib", MajorVersion = 2, MinorVersion = 1 }]);

        var doc = WxsGenerator.Generate(manifest, _sourceRoot, _sourceRoot);

        var file = doc.Descendants(Wix + "File").Single(f => f.Attribute("Source")!.Value.EndsWith("server.dll"));
        Assert.Single(file.Parent!.Elements(Wix + "File")); // one file per component
        var cls = file.Element(Wix + "Class")!;
        Assert.Equal("{22222222-2222-3333-4444-555555555555}", cls.Attribute("Id")!.Value);
        Assert.Equal("apartment", cls.Attribute("ThreadingModel")!.Value);
        Assert.Equal("Acme.Widget.1", cls.Element(Wix + "ProgId")!.Attribute("Id")!.Value);
        Assert.Equal("Acme.Widget", cls.Element(Wix + "ProgId")!.Element(Wix + "ProgId")!.Attribute("Id")!.Value);
        var lib = file.Element(Wix + "TypeLib")!;
        Assert.Equal("2", lib.Attribute("MajorVersion")!.Value);
        Assert.Equal("1", lib.Attribute("MinorVersion")!.Value);
    }

    [Fact]
    public void Validate_RejectsUnknownFileEmptyGuidAndBadProgId()
    {
        var manifest = Manifest(
            [new ComClass { ClassId = Guid.Empty, FileId = "Nope", ProgId = "bad progid" }],
            [new ComTypeLib { TypeLibId = Guid.Empty, FileId = "Nope" }]);

        var errors = ManifestParser.Validate(manifest);

        Assert.Contains("comClasses.classId", errors.Keys);
        Assert.Contains("comClasses.fileId", errors.Keys);
        Assert.Contains("comClasses.progId", errors.Keys);
        Assert.Contains("comTypeLibs.typeLibId", errors.Keys);
        Assert.Contains("comTypeLibs.fileId", errors.Keys);
    }

    [Fact]
    public void Validate_RejectsThreadingModelOnALocalServer()
    {
        var manifest = Manifest([new ComClass { ClassId = _classId, FileId = "Server", Context = ComServerContext.LocalServer32, ThreadingModel = ComThreadingModel.Both }]);

        Assert.Contains("comClasses.threadingModel", ManifestParser.Validate(manifest).Keys);
    }

    [Fact]
    [Trait("Category", "Integration")]
    public void RealWix_AcceptsTheComRegistration_AndProducesAnMsi()
    {
        var manifest = Manifest(
            [new ComClass { ClassId = _classId, FileId = "Server", ThreadingModel = ComThreadingModel.Both, ProgId = "Acme.Widget.1", VersionIndependentProgId = "Acme.Widget" }],
            [new ComTypeLib { TypeLibId = _typeLibId, FileId = "Server" }]);

        var result = new WixCompiler(new SystemProcessRunner()).Compile(manifest, _sourceRoot, Path.Combine(_sourceRoot, "out"));

        Assert.True(result.Succeeded, result.StandardError);
        Assert.True(File.Exists(result.OutputMsiPath));
    }

    public void Dispose() => Directory.Delete(_sourceRoot, recursive: true);
}
