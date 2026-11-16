using System.Xml.Linq;
using WinRelease.Core.Compilation;
using WinRelease.Core.Manifest;
using Xunit;

namespace WinRelease.Core.Tests;

/// <summary>Asserts the generated XML directly, rather than only through a real `wix build` (see WixCompilerIntegrationTests for that). ADR 0033.</summary>
public class WxsGeneratorTests
{
    private static readonly XNamespace Ns = WxsGenerator.Namespace;

    private static WinReleaseManifest BaseManifest(
        List<DeclaredFile>? declared = null,
        List<Shortcut>? shortcuts = null,
        List<RegistryEntry>? registry = null,
        List<EnvironmentVariableEntry>? environmentVariables = null) => new()
    {
        UpgradeCode = Guid.NewGuid(),
        Name = "Test App",
        Manufacturer = "Test",
        DisplayVersion = "1.0.0",
        Files = new ManifestFiles { Declared = declared ?? [] },
        Shortcuts = shortcuts ?? [],
        Registry = registry ?? [],
        EnvironmentVariables = environmentVariables ?? [],
    };

    /// <summary>A package with no files gets no Media table from MediaTemplate, and Windows Installer fails it with error 2607 (UAT T4-27, verified with msiexec).</summary>
    [Fact]
    public void Generate_PackageWithNoFiles_UsesAnExplicitMediaRowInsteadOfMediaTemplate()
    {
        var doc = WxsGenerator.Generate(BaseManifest(environmentVariables: [new EnvironmentVariableEntry { Name = "X", Value = "1", System = true }]), "C:/source");

        Assert.Empty(doc.Descendants(Ns + "MediaTemplate"));
        Assert.Single(doc.Descendants(Ns + "Media"));
    }

    /// <summary>ADR 0098: the install wizard is on by default, skips the placeholder licence page, and is verified buildable with wix 7.0.0.</summary>
    [Fact]
    public void Generate_DefaultsToTheInstallWizardWithoutALicencePage()
    {
        var doc = WxsGenerator.Generate(BaseManifest(), "C:/source");
        var ui = XNamespace.Get("http://wixtoolset.org/schemas/v4/wxs/ui");

        Assert.Equal("WixUI_InstallDir", doc.Descendants(ui + "WixUI").Single().Attribute("Id")!.Value);
        Assert.Contains(doc.Descendants(Ns + "Property"), p => p.Attribute("Id")!.Value == "WIXUI_INSTALLDIR" && p.Attribute("Value")!.Value == "INSTALLFOLDER");
        Assert.Contains(doc.Descendants(Ns + "Publish"), p => p.Attribute("Dialog")!.Value == "WelcomeDlg" && p.Attribute("Value")!.Value == "InstallDirDlg");
    }

    [Fact]
    public void Generate_WizardTurnedOff_EmitsNoUi()
    {
        var manifest = BaseManifest() with { AppInfo = new AppInfo { InstallWizard = false } };
        var doc = WxsGenerator.Generate(manifest, "C:/source");

        Assert.Empty(doc.Descendants().Where(e => e.Name.Namespace.NamespaceName.EndsWith("/ui", StringComparison.Ordinal)));
        Assert.Empty(doc.Descendants(Ns + "UI"));
    }

    /// <summary>UAT 2026-10-28: with the wizard on, WixUI_InstallDir defines ARPNOMODIFY=1 itself and a second row fails with WIX0091.</summary>
    [Theory]
    [InlineData(true, false)]
    [InlineData(false, true)]
    public void Generate_DisableModify_LeavesArpNoModifyToTheWizard(bool wizard, bool expectOwnRow)
    {
        var manifest = BaseManifest() with { AppInfo = new AppInfo { InstallWizard = wizard, DisableModify = true } };
        var doc = WxsGenerator.Generate(manifest, "C:/source");

        Assert.Equal(expectOwnRow ? 1 : 0, doc.Descendants(Ns + "Property").Count(p => p.Attribute("Id")!.Value == "ARPNOMODIFY"));
    }

    /// <summary>UAT 2026-10-28: wix 7 writes code page 1252 by default and fails (WIX0311) on anything outside it.</summary>
    [Theory]
    [InlineData("Test App", null)]
    [InlineData("Café Résumé – “Pro”", null)]
    [InlineData("测试应用", "65001")]
    [InlineData("Ελληνικά", "65001")]
    [InlineData("Rocket 🚀", "65001")]
    public void Generate_UsesUtf8CodepageOnlyWhenTheTextNeedsIt(string name, string? expectedCodepage)
    {
        var doc = WxsGenerator.Generate(BaseManifest() with { Name = name }, "C:/source");

        Assert.Equal(expectedCodepage, doc.Descendants(Ns + "Package").Single().Attribute("Codepage")?.Value);
    }

    [Fact]
    public void Generate_PackageWithFiles_KeepsMediaTemplate()
    {
        var doc = WxsGenerator.Generate(BaseManifest(declared: [new DeclaredFile { Id = "F", SourcePath = "a.txt", InstallPath = "a.txt" }]), "C:/source");

        Assert.Single(doc.Descendants(Ns + "MediaTemplate"));
        Assert.Empty(doc.Descendants(Ns + "Media"));
    }

    [Fact]
    public void Generate_FileWithDefaultRoot_NestsUnderProgramFilesInstallFolder()
    {
        var manifest = BaseManifest(declared: [new DeclaredFile { Id = "MainExe", SourcePath = "app.exe", InstallPath = "app.exe" }]);

        var doc = WxsGenerator.Generate(manifest, "C:/source");

        var programFiles = doc.Descendants(Ns + "StandardDirectory").Single(d => d.Attribute("Id")!.Value == "ProgramFiles64Folder");
        Assert.Contains(programFiles.Descendants(Ns + "File"), f => f.Attribute("Name")!.Value == "app.exe");
    }

    [Fact]
    public void Generate_ByDefault_OmitsReadOnlyAndHiddenAttributes()
    {
        var manifest = BaseManifest(declared: [new DeclaredFile { Id = "MainExe", SourcePath = "app.exe", InstallPath = "app.exe" }]);

        var doc = WxsGenerator.Generate(manifest, "C:/source");

        var file = doc.Descendants(Ns + "File").Single();
        Assert.Null(file.Attribute("ReadOnly"));
        Assert.Null(file.Attribute("Hidden"));
    }

    [Fact]
    public void Generate_FileMarkedReadOnlyAndHidden_EmitsBothAttributes()
    {
        var manifest = BaseManifest(declared: [new DeclaredFile { Id = "Config", SourcePath = "config.ini", InstallPath = "config.ini", ReadOnly = true, Hidden = true }]);

        var doc = WxsGenerator.Generate(manifest, "C:/source");

        var file = doc.Descendants(Ns + "File").Single();
        Assert.Equal("yes", file.Attribute("ReadOnly")!.Value);
        Assert.Equal("yes", file.Attribute("Hidden")!.Value);
    }

    [Theory]
    [InlineData(InstallRoot.CommonFilesFolder, "CommonFilesFolder")]
    [InlineData(InstallRoot.SystemFolder, "SystemFolder")]
    [InlineData(InstallRoot.AppDataFolder, "AppDataFolder")]
    [InlineData(InstallRoot.LocalAppDataFolder, "LocalAppDataFolder")]
    public void Generate_FileWithNonDefaultRoot_EmitsThatStandardDirectory(InstallRoot root, string expectedDirectoryId)
    {
        var manifest = BaseManifest(declared: [new DeclaredFile { Id = "Shared", SourcePath = "shared.dll", InstallPath = "shared.dll", Root = root }]);

        var doc = WxsGenerator.Generate(manifest, "C:/source");

        var standardDirectory = doc.Descendants(Ns + "StandardDirectory").SingleOrDefault(d => d.Attribute("Id")!.Value == expectedDirectoryId);
        Assert.NotNull(standardDirectory);
        Assert.Contains(standardDirectory!.Descendants(Ns + "File"), f => f.Attribute("Name")!.Value == "shared.dll");
    }

    [Fact]
    public void Generate_UnusedOptionalRoots_AreNotEmitted()
    {
        var manifest = BaseManifest(declared: [new DeclaredFile { Id = "MainExe", SourcePath = "app.exe", InstallPath = "app.exe" }]);

        var doc = WxsGenerator.Generate(manifest, "C:/source");

        var standardDirectoryIds = doc.Descendants(Ns + "StandardDirectory").Select(d => d.Attribute("Id")!.Value).ToList();
        Assert.DoesNotContain("CommonFilesFolder", standardDirectoryIds);
        Assert.DoesNotContain("SystemFolder", standardDirectoryIds);
        Assert.DoesNotContain("AppDataFolder", standardDirectoryIds);
        Assert.DoesNotContain("LocalAppDataFolder", standardDirectoryIds);
        Assert.DoesNotContain("ProgramFilesFolder", standardDirectoryIds);
        Assert.DoesNotContain("CommonFiles64Folder", standardDirectoryIds);
        Assert.DoesNotContain("CommonAppDataFolder", standardDirectoryIds);
    }

    [Fact]
    public void Generate_ByDefault_UsesProgramFiles64FolderAsTheRoot()
    {
        var manifest = BaseManifest(declared: [new DeclaredFile { Id = "MainExe", SourcePath = "app.exe", InstallPath = "app.exe" }]);

        var doc = WxsGenerator.Generate(manifest, "C:/source");

        var root = doc.Descendants(Ns + "StandardDirectory").Single(d => d.Attribute("Id")!.Value == "ProgramFiles64Folder");
        var installFolder = Assert.Single(root.Elements(Ns + "Directory"));
        Assert.Equal("INSTALLFOLDER", installFolder.Attribute("Id")!.Value);
        Assert.Equal(".", installFolder.Attribute("Name")!.Value);
        Assert.Contains(installFolder.Descendants(Ns + "File"), f => f.Attribute("Name")!.Value == "app.exe");
    }

    [Fact]
    public void Generate_TargetDirectoryWithSubpath_NestsInstallFolderAtThatPath()
    {
        var manifest = BaseManifest(declared: [new DeclaredFile { Id = "MainExe", SourcePath = "app.exe", InstallPath = "app.exe" }])
            with
        { TargetDirectory = "[ProgramFiles64Folder]Acme\\App" };

        var doc = WxsGenerator.Generate(manifest, "C:/source");

        var root = doc.Descendants(Ns + "StandardDirectory").Single(d => d.Attribute("Id")!.Value == "ProgramFiles64Folder");
        var acme = Assert.Single(root.Elements(Ns + "Directory"));
        Assert.Equal("Acme", acme.Attribute("Name")!.Value);
        Assert.NotEqual("INSTALLFOLDER", acme.Attribute("Id")!.Value);

        var installFolder = Assert.Single(acme.Elements(Ns + "Directory"));
        Assert.Equal("INSTALLFOLDER", installFolder.Attribute("Id")!.Value);
        Assert.Equal("App", installFolder.Attribute("Name")!.Value);
        Assert.Contains(installFolder.Descendants(Ns + "File"), f => f.Attribute("Name")!.Value == "app.exe");
    }

    [Fact]
    public void Generate_TargetDirectoryWithSubpath_IsDeterministicAcrossRuns()
    {
        var manifest = BaseManifest() with { TargetDirectory = "[ProgramFiles64Folder]Acme\\App" };

        var first = WxsGenerator.Generate(manifest, "C:/source");
        var second = WxsGenerator.Generate(manifest, "C:/source");

        string AcmeDirectoryId(XDocument doc) => doc.Descendants(Ns + "StandardDirectory")
            .Single(d => d.Attribute("Id")!.Value == "ProgramFiles64Folder")
            .Elements(Ns + "Directory").Single().Attribute("Id")!.Value;

        Assert.Equal(AcmeDirectoryId(first), AcmeDirectoryId(second));
    }

    [Fact]
    public void Generate_TargetDirectoryAsLiteralPath_ResolvesToTheSameTreeAsTheEquivalentBracketForm()
    {
        var bracket = BaseManifest() with { TargetDirectory = "[ProgramFiles64Folder]Acme\\App" };
        var literal = BaseManifest() with { UpgradeCode = bracket.UpgradeCode, TargetDirectory = "C:\\Program Files\\Acme\\App" };

        var bracketDoc = WxsGenerator.Generate(bracket, "C:/source");
        var literalDoc = WxsGenerator.Generate(literal, "C:/source");

        Assert.Equal(bracketDoc.ToString(), literalDoc.ToString());
    }

    [Fact]
    public void Generate_TargetDirectoryAsProgramDataLiteralPath_ResolvesToTheSameTreeAsTheEquivalentBracketForm()
    {
        var bracket = BaseManifest() with { TargetDirectory = "[CommonAppDataFolder]Acme\\App" };
        var literal = BaseManifest() with { UpgradeCode = bracket.UpgradeCode, TargetDirectory = "C:\\ProgramData\\Acme\\App" };

        var bracketDoc = WxsGenerator.Generate(bracket, "C:/source");
        var literalDoc = WxsGenerator.Generate(literal, "C:/source");

        Assert.Equal(bracketDoc.ToString(), literalDoc.ToString());
    }

    [Fact]
    public void Generate_TargetDirectoryRootCollidingWithARawInstallRoot_MergesIntoOneStandardDirectory()
    {
        var manifest = BaseManifest(declared:
        [
            new DeclaredFile { Id = "MainExe", SourcePath = "app.exe", InstallPath = "app.exe" },
            new DeclaredFile { Id = "Loose", SourcePath = "loose.txt", InstallPath = "loose.txt", Root = InstallRoot.ProgramFiles64Folder },
        ]);

        var doc = WxsGenerator.Generate(manifest, "C:/source");

        var roots = doc.Descendants(Ns + "StandardDirectory").Where(d => d.Attribute("Id")!.Value == "ProgramFiles64Folder").ToList();
        var root = Assert.Single(roots);
        Assert.Contains(root.Elements(Ns + "Directory"), d => d.Attribute("Id")!.Value == "INSTALLFOLDER");
        Assert.Contains(root.Descendants(Ns + "File"), f => f.Attribute("Name")!.Value == "loose.txt");
        Assert.Contains(root.Descendants(Ns + "File"), f => f.Attribute("Name")!.Value == "app.exe");
    }

    [Theory]
    [InlineData(InstallRoot.ProgramFilesFolder, "ProgramFilesFolder")]
    [InlineData(InstallRoot.CommonFiles64Folder, "CommonFiles64Folder")]
    [InlineData(InstallRoot.CommonAppDataFolder, "CommonAppDataFolder")]
    [InlineData(InstallRoot.System64Folder, "System64Folder")]
    public void Generate_FileAtANewRawRoot_EmitsThatStandardDirectory(InstallRoot root, string expectedDirectoryId)
    {
        var manifest = BaseManifest(declared: [new DeclaredFile { Id = "Shared", SourcePath = "shared.dll", InstallPath = "shared.dll", Root = root }]);

        var doc = WxsGenerator.Generate(manifest, "C:/source");

        var standardDirectory = doc.Descendants(Ns + "StandardDirectory").SingleOrDefault(d => d.Attribute("Id")!.Value == expectedDirectoryId);
        Assert.NotNull(standardDirectory);
        Assert.Contains(standardDirectory!.Descendants(Ns + "File"), f => f.Attribute("Name")!.Value == "shared.dll");
    }

    [Fact]
    public void Generate_SystemFolderAndSystem64Folder_AreDistinctStandardDirectories()
    {
        // A pre-existing bug this pass caught: WxsImporter's TryMapStandardRoot used to collapse
        // both WiX Ids onto the single InstallRoot.SystemFolder value - real for a 64-bit build,
        // where SystemFolder (redirected to SysWOW64) and System64Folder (the real System32) are
        // two different install locations.
        var manifest = BaseManifest(declared:
        [
            new DeclaredFile { Id = "ThirtyTwoBit", SourcePath = "a.dll", InstallPath = "a.dll", Root = InstallRoot.SystemFolder },
            new DeclaredFile { Id = "SixtyFourBit", SourcePath = "b.dll", InstallPath = "b.dll", Root = InstallRoot.System64Folder },
        ]);

        var doc = WxsGenerator.Generate(manifest, "C:/source");

        var systemFolder = doc.Descendants(Ns + "StandardDirectory").Single(d => d.Attribute("Id")!.Value == "SystemFolder");
        var system64Folder = doc.Descendants(Ns + "StandardDirectory").Single(d => d.Attribute("Id")!.Value == "System64Folder");
        Assert.Contains(systemFolder.Descendants(Ns + "File"), f => f.Attribute("Name")!.Value == "a.dll");
        Assert.Contains(system64Folder.Descendants(Ns + "File"), f => f.Attribute("Name")!.Value == "b.dll");
    }

    [Fact]
    public void Generate_ProductCodeOverride_IsUsedInsteadOfTheDeterministicDefault()
    {
        var overrideCode = Guid.NewGuid();
        var manifest = BaseManifest() with { ProductCode = overrideCode };

        var doc = WxsGenerator.Generate(manifest, "C:/source");

        var package = doc.Descendants(Ns + "Package").Single();
        Assert.Equal(overrideCode.ToString("B").ToUpperInvariant(), package.Attribute("ProductCode")!.Value);
    }

    [Fact]
    public void Generate_SameSubfolderNameUnderTwoRoots_GetsDistinctDirectoryIds()
    {
        var manifest = BaseManifest(declared:
        [
            new DeclaredFile { Id = "A", SourcePath = "a.dll", InstallPath = "config/a.dll" },
            new DeclaredFile { Id = "B", SourcePath = "b.dll", InstallPath = "config/b.dll", Root = InstallRoot.CommonFilesFolder },
        ]);

        var doc = WxsGenerator.Generate(manifest, "C:/source");

        var configDirectoryIds = doc.Descendants(Ns + "Directory")
            .Where(d => d.Attribute("Name")!.Value == "config")
            .Select(d => d.Attribute("Id")!.Value)
            .ToList();

        Assert.Equal(2, configDirectoryIds.Count);
        Assert.Equal(2, configDirectoryIds.Distinct().Count());
    }

    [Fact]
    public void Generate_DeclaredFileWithBackslashInstallPath_BecomesAFolderAndAFileNotAFileNameWithABackslash()
    {
        // Found by V5 (a real app with bin\gh.exe): the validator accepts backslash-separated install paths, and harvested files are
        // normalised to '/', but a declared file's backslash reached WiX inside File/@Name (error WIX0027).
        var manifest = BaseManifest(declared: [new DeclaredFile { Id = "Main", SourcePath = "app/bin/gh.exe", InstallPath = "bin\\gh.exe" }]);

        var doc = WxsGenerator.Generate(manifest, "C:/source");

        Assert.Equal("gh.exe", doc.Descendants(Ns + "File").Single().Attribute("Name")!.Value);
        Assert.Contains(doc.Descendants(Ns + "Directory"), d => d.Attribute("Name")!.Value == "bin");
    }

    [Fact]
    public void Generate_ShortcutWithOnlyRequiredFields_DefaultsWorkingDirectoryAndOmitsOptionalAttributes()
    {
        var manifest = BaseManifest(
            declared: [new DeclaredFile { Id = "MainExe", SourcePath = "app.exe", InstallPath = "app.exe" }],
            shortcuts: [new Shortcut { Name = "App", TargetFileId = "MainExe", Location = ShortcutLocation.DesktopFolder }]);

        var doc = WxsGenerator.Generate(manifest, "C:/source");

        var shortcut = doc.Descendants(Ns + "Shortcut").Single();
        Assert.Equal("INSTALLFOLDER", shortcut.Attribute("WorkingDirectory")!.Value);
        Assert.Null(shortcut.Attribute("Arguments"));
        Assert.Null(shortcut.Attribute("Description"));
        Assert.Null(shortcut.Attribute("Icon"));
        // WindowStyle defaults to Normal, WiX's own default - nothing to author (ADR 0063).
        Assert.Null(shortcut.Attribute("Show"));
    }

    [Theory]
    [InlineData(ShortcutWindowStyle.Minimized, "minimized")]
    [InlineData(ShortcutWindowStyle.Maximized, "maximized")]
    public void Generate_ShortcutWithNonNormalWindowStyle_EmitsLowercaseShowAttribute(ShortcutWindowStyle style, string expectedShow)
    {
        var manifest = BaseManifest(
            declared: [new DeclaredFile { Id = "MainExe", SourcePath = "app.exe", InstallPath = "app.exe" }],
            shortcuts: [new Shortcut { Name = "App", TargetFileId = "MainExe", Location = ShortcutLocation.DesktopFolder, WindowStyle = style }]);

        var doc = WxsGenerator.Generate(manifest, "C:/source");

        var shortcut = doc.Descendants(Ns + "Shortcut").Single();
        Assert.Equal(expectedShow, shortcut.Attribute("Show")!.Value);
    }

    [Fact]
    public void Generate_ShortcutWithAllProperties_EmitsThemAndAPackageLevelIcon()
    {
        var manifest = BaseManifest(
            declared: [new DeclaredFile { Id = "MainExe", SourcePath = "app.exe", InstallPath = "app.exe" }],
            shortcuts:
            [
                new Shortcut
                {
                    Name = "App",
                    TargetFileId = "MainExe",
                    Location = ShortcutLocation.StartupFolder,
                    WorkingDirectory = "CustomWorkingDir",
                    Arguments = "/silent",
                    Description = "Launches App",
                    IconPath = "app.ico",
                },
            ]);

        var doc = WxsGenerator.Generate(manifest, "C:/source");

        var shortcut = doc.Descendants(Ns + "Shortcut").Single();
        Assert.Equal("CustomWorkingDir", shortcut.Attribute("WorkingDirectory")!.Value);
        Assert.Equal("/silent", shortcut.Attribute("Arguments")!.Value);
        Assert.Equal("Launches App", shortcut.Attribute("Description")!.Value);

        var iconId = shortcut.Attribute("Icon")!.Value;
        var iconElement = doc.Descendants(Ns + "Icon").Single(i => i.Attribute("Id")!.Value == iconId);
        Assert.EndsWith("app.ico", iconElement.Attribute("SourceFile")!.Value.Replace('\\', '/'));

        Assert.Contains(doc.Descendants(Ns + "StandardDirectory"), d => d.Attribute("Id")!.Value == "StartupFolder");
    }

    /// <summary>
    /// A Shortcut's Location isn't limited to Desktop/Start Menu/Startup - the same wr:dir: sentinel
    /// WorkingDirectory already uses lets it point anywhere in the install tree, including a root
    /// (AppDataFolder) nothing else ever places a file into. Before the "touch the directory chain"
    /// fix, AppDataFolder's StandardDirectory would simply never be emitted here (OptionalRoots only
    /// emitted a root with real Files/Children), leaving the Shortcut's Directory attribute dangling.
    /// </summary>
    [Fact]
    public void Generate_ShortcutLocationPointingAtOtherwiseUnusedRoot_StillEmitsThatStandardDirectory()
    {
        var manifest = BaseManifest(
            declared: [new DeclaredFile { Id = "MainExe", SourcePath = "app.exe", InstallPath = "app.exe" }],
            shortcuts: [new Shortcut { Name = "Settings", TargetFileId = "MainExe", Location = "wr:dir:appDataFolder:" }]);

        var doc = WxsGenerator.Generate(manifest, "C:/source");

        Assert.Contains(doc.Descendants(Ns + "StandardDirectory"), d => d.Attribute("Id")!.Value == "AppDataFolder");
        var shortcut = doc.Descendants(Ns + "Shortcut").Single();
        Assert.Equal("AppDataFolder", shortcut.Attribute("Directory")!.Value);
    }

    /// <summary>
    /// The Start Menu "program group" convention: a Shortcut's Location can nest into a named
    /// subfolder under ProgramMenuFolder (via the wr:dir:programMenuFolder:{path} sentinel), not
    /// just sit flat in the preset. Proves the real nested &lt;Directory&gt; gets built, with
    /// ProgramMenuFolder itself still emitted even though no file ever lives there.
    /// </summary>
    [Fact]
    public void Generate_ShortcutLocationWithStartMenuProgramGroup_EmitsNestedDirectoryUnderProgramMenuFolder()
    {
        var manifest = BaseManifest(
            declared: [new DeclaredFile { Id = "MainExe", SourcePath = "app.exe", InstallPath = "app.exe" }],
            shortcuts: [new Shortcut { Name = "App", TargetFileId = "MainExe", Location = "wr:dir:programMenuFolder:Acme Inc" }]);

        var doc = WxsGenerator.Generate(manifest, "C:/source");

        var programMenu = doc.Descendants(Ns + "StandardDirectory").Single(d => d.Attribute("Id")!.Value == "ProgramMenuFolder");
        var group = Assert.Single(programMenu.Elements(Ns + "Directory"));
        Assert.Equal("Acme Inc", group.Attribute("Name")!.Value);

        var shortcut = doc.Descendants(Ns + "Shortcut").Single();
        Assert.Equal(group.Attribute("Id")!.Value, shortcut.Attribute("Directory")!.Value);
    }

    /// <summary>Two shortcuts in the same program group share one nested &lt;Directory&gt; (same Id, two Shortcuts under it) rather than each getting their own - the same dedup BuildDirectoryChildren already gives any other shared folder.</summary>
    [Fact]
    public void Generate_TwoShortcutsInSameProgramGroup_ShareOneNestedDirectory()
    {
        var manifest = BaseManifest(
            declared: [new DeclaredFile { Id = "MainExe", SourcePath = "app.exe", InstallPath = "app.exe" }],
            shortcuts:
            [
                new Shortcut { Name = "App", TargetFileId = "MainExe", Location = "wr:dir:programMenuFolder:Acme Inc" },
                new Shortcut { Name = "Uninstall App", TargetFileId = "MainExe", Location = "wr:dir:programMenuFolder:Acme Inc" },
            ]);

        var doc = WxsGenerator.Generate(manifest, "C:/source");

        var programMenu = doc.Descendants(Ns + "StandardDirectory").Single(d => d.Attribute("Id")!.Value == "ProgramMenuFolder");
        Assert.Single(programMenu.Elements(Ns + "Directory"));
        Assert.Equal(2, doc.Descendants(Ns + "Shortcut").Count());
    }

    /// <summary>
    /// A manifest saved before Location became a free string had "desktopFolder" (the old enum's
    /// camelCase JSON wire value) on disk - that must keep resolving to the real "DesktopFolder"
    /// Directory Id, not be treated as a literal (nonexistent, case-sensitive-mismatched) Id.
    /// </summary>
    [Theory]
    [InlineData("desktopFolder", "DesktopFolder")]
    [InlineData("programMenuFolder", "ProgramMenuFolder")]
    [InlineData("startupFolder", "StartupFolder")]
    public void Generate_ShortcutWithLegacyCamelCaseLocation_NormalizesToRealDirectoryId(string legacyLocation, string expectedDirectoryId)
    {
        var manifest = BaseManifest(
            declared: [new DeclaredFile { Id = "MainExe", SourcePath = "app.exe", InstallPath = "app.exe" }],
            shortcuts: [new Shortcut { Name = "App", TargetFileId = "MainExe", Location = legacyLocation }]);

        var doc = WxsGenerator.Generate(manifest, "C:/source");

        var shortcut = doc.Descendants(Ns + "Shortcut").Single();
        Assert.Equal(expectedDirectoryId, shortcut.Attribute("Directory")!.Value);
        Assert.Contains(doc.Descendants(Ns + "StandardDirectory"), d => d.Attribute("Id")!.Value == expectedDirectoryId);
    }

    /// <summary>Same as above, one level deeper: a subfolder under INSTALLFOLDER no declared file/harvest folder ever touches.</summary>
    [Fact]
    public void Generate_ShortcutLocationPointingAtOtherwiseUnusedSubfolder_EmitsThatDirectory()
    {
        var manifest = BaseManifest(
            declared: [new DeclaredFile { Id = "MainExe", SourcePath = "app.exe", InstallPath = "app.exe" }],
            shortcuts: [new Shortcut { Name = "View Logs", TargetFileId = "MainExe", Location = "wr:dir:installFolder:Logs" }]);

        var doc = WxsGenerator.Generate(manifest, "C:/source");

        var shortcut = doc.Descendants(Ns + "Shortcut").Single();
        var directoryId = shortcut.Attribute("Directory")!.Value;
        Assert.NotEqual("INSTALLFOLDER", directoryId);
        Assert.Contains(doc.Descendants(Ns + "Directory"), d => d.Attribute("Id")!.Value == directoryId && d.Attribute("Name")!.Value == "Logs");
    }

    /// <summary>ADR 0035: a shortcut with no declared File to target (a URL, or a file inside a Harvest
    /// Folder that WiX can't know about until it scans the folder at build time) gets an explicit
    /// Target instead, and its own synthetic Component - it isn't nested inside a File's Component.
    /// </summary>
    [Fact]
    public void Generate_ShortcutWithTargetPath_EmitsExplicitTargetAndOwnComponent()
    {
        var manifest = BaseManifest(
            shortcuts: [new Shortcut { Name = "Docs", TargetPath = "[INSTALLFOLDER]docs\\readme.txt", Location = ShortcutLocation.DesktopFolder }]);

        var doc = WxsGenerator.Generate(manifest, "C:/source");

        var shortcut = doc.Descendants(Ns + "Shortcut").Single();
        Assert.Equal("[INSTALLFOLDER]docs\\readme.txt", shortcut.Attribute("Target")!.Value);

        var component = shortcut.Parent!;
        Assert.Equal(Ns + "Component", component.Name);
        Assert.DoesNotContain(component.Descendants(Ns + "File"), _ => true);

        var keyPath = component.Elements(Ns + "RegistryValue").Single();
        Assert.Equal("yes", keyPath.Attribute("KeyPath")!.Value);

        // The synthetic Component must actually be installed, not orphaned outside the Feature.
        var componentId = component.Attribute("Id")!.Value;
        var feature = doc.Descendants(Ns + "Feature").Single();
        Assert.Contains(feature.Elements(Ns + "ComponentRef"), r => r.Attribute("Id")!.Value == componentId);
    }

    /// <summary>
    /// A real bug this caught: two shortcuts to the same file in the same location (e.g. two Start
    /// Menu entries for the same .exe with different Arguments) seeded their Shortcut Id and Icon Id
    /// from target+location alone - identical for both, so wix rejected the second with WIX0091
    /// (duplicate symbol) rather than compiling two distinct shortcuts. See ADR 0064.
    /// </summary>
    [Fact]
    public void Generate_TwoShortcutsToSameFileAndLocation_GetDistinctShortcutAndIconIds()
    {
        var manifest = BaseManifest(
            declared: [new DeclaredFile { Id = "MainExe", SourcePath = "app.exe", InstallPath = "app.exe" }],
            shortcuts:
            [
                new Shortcut { Name = "App", TargetFileId = "MainExe", Location = ShortcutLocation.ProgramMenuFolder, Arguments = "/a", IconPath = "app.ico" },
                new Shortcut { Name = "App Safe Mode", TargetFileId = "MainExe", Location = ShortcutLocation.ProgramMenuFolder, Arguments = "/safe", IconPath = "app.ico" },
            ]);

        var doc = WxsGenerator.Generate(manifest, "C:/source");

        var shortcutIds = doc.Descendants(Ns + "Shortcut").Select(s => s.Attribute("Id")!.Value).ToList();
        Assert.Equal(2, shortcutIds.Count);
        Assert.Equal(2, shortcutIds.Distinct().Count());

        var iconIds = doc.Descendants(Ns + "Icon").Select(i => i.Attribute("Id")!.Value).ToList();
        Assert.Equal(2, iconIds.Count);
        Assert.Equal(2, iconIds.Distinct().Count());
    }

    /// <summary>Same collision, the TargetPath-shortcut-only-Component branch (ADR 0035/0064).</summary>
    [Fact]
    public void Generate_TwoCustomPathShortcutsToSameTargetAndLocation_GetDistinctComponentIds()
    {
        var manifest = BaseManifest(
            shortcuts:
            [
                new Shortcut { Name = "Docs", TargetPath = "[INSTALLFOLDER]docs\\readme.txt", Location = ShortcutLocation.DesktopFolder },
                new Shortcut { Name = "Docs (copy)", TargetPath = "[INSTALLFOLDER]docs\\readme.txt", Location = ShortcutLocation.DesktopFolder },
            ]);

        var doc = WxsGenerator.Generate(manifest, "C:/source");

        var shortcuts = doc.Descendants(Ns + "Shortcut").ToList();
        Assert.Equal(2, shortcuts.Count);
        var componentIds = shortcuts.Select(s => s.Parent!.Attribute("Id")!.Value).ToList();
        Assert.Equal(2, componentIds.Distinct().Count());
    }

    /// <summary>
    /// Two shortcuts to the same URL+location get distinct Components (else WIX0091) but share the
    /// one physical generated .url file - UrlShortcutFile.For()'s own DistinctBy already dedupes
    /// that by design, since both would need identical content anyway. ADR 0064.
    /// </summary>
    [Fact]
    public void Generate_TwoUrlShortcutsToSameTargetAndLocation_GetDistinctComponentsSharingOneGeneratedFile()
    {
        var manifest = BaseManifest(
            shortcuts:
            [
                new Shortcut { Name = "Docs", TargetPath = "https://example.com/docs", Location = ShortcutLocation.DesktopFolder },
                new Shortcut { Name = "Docs (copy)", TargetPath = "https://example.com/docs", Location = ShortcutLocation.DesktopFolder },
            ]);

        var doc = WxsGenerator.Generate(manifest, "C:/source", "C:/gen");

        var components = doc.Descendants(Ns + "Component").Where(c => c.Elements(Ns + "File").Any()).ToList();
        Assert.Equal(2, components.Count);
        Assert.Equal(2, components.Select(c => c.Attribute("Id")!.Value).Distinct().Count());

        var sourceFiles = components.Elements(Ns + "File").Select(f => f.Attribute("Source")!.Value).Distinct().ToList();
        Assert.Single(sourceFiles);

        Assert.Single(UrlShortcutFile.For(manifest));
    }

    /// <summary>
    /// ADR 0052: the MSI Shortcut table can't target a URL (CreateShortcuts silently skips the row, verified
    /// with a real install log), so a URL shortcut compiles to a generated .url File in the location folder
    /// - and there is no &lt;Shortcut&gt; element for it at all.
    /// </summary>
    [Theory]
    [InlineData(ShortcutLocation.DesktopFolder, "DesktopFolder")]
    [InlineData(ShortcutLocation.ProgramMenuFolder, "ProgramMenuFolder")]
    [InlineData(ShortcutLocation.StartupFolder, "StartupFolder")]
    public void Generate_UrlShortcut_BecomesGeneratedUrlFileInLocationFolder(string location, string directoryId)
    {
        var manifest = BaseManifest(
            shortcuts: [new Shortcut { Name = "Docs", TargetPath = "https://example.com/docs", Location = location }]);

        var doc = WxsGenerator.Generate(manifest, "C:/source", "C:/gen");

        Assert.DoesNotContain(doc.Descendants(Ns + "Shortcut"), _ => true);
        var component = doc.Descendants(Ns + "Component").Single(c => c.Attribute("Id")!.Value.StartsWith("Url_"));
        Assert.Equal(directoryId, component.Attribute("Directory")!.Value);
        var file = component.Elements(Ns + "File").Single();
        Assert.Equal("Docs.url", file.Attribute("Name")!.Value);
        Assert.StartsWith("C:/gen", file.Attribute("Source")!.Value.Replace('\\', '/'));
        Assert.Equal("yes", component.Elements(Ns + "RegistryValue").Single().Attribute("KeyPath")!.Value);

        var feature = doc.Descendants(Ns + "Feature").Single();
        Assert.Contains(feature.Elements(Ns + "ComponentRef"), r => r.Attribute("Id")!.Value == component.Attribute("Id")!.Value);
    }

    [Fact]
    public void UrlShortcutFile_GeneratesTheFileTheComponentPointsAt()
    {
        var manifest = BaseManifest(
            shortcuts: [new Shortcut { Name = "Docs", TargetPath = "https://example.com/docs", Location = ShortcutLocation.DesktopFolder }]);

        var generated = Assert.Single(UrlShortcutFile.For(manifest));
        var doc = WxsGenerator.Generate(manifest, "C:/source", "C:/gen");

        Assert.Equal("[InternetShortcut]\r\nURL=https://example.com/docs\r\n", generated.Content);
        Assert.EndsWith(generated.FileName, doc.Descendants(Ns + "File").Single().Attribute("Source")!.Value);
    }

    [Theory]
    [InlineData("https://example.com", true)]
    [InlineData("ms-settings://network", true)]
    [InlineData("[INSTALLFOLDER]docs\\readme.txt", false)]
    [InlineData("C:\\Windows\\notepad.exe", false)]
    [InlineData("", false)]
    public void UrlShortcutFile_IsUrl_DetectsSchemeForm(string target, bool expected) =>
        Assert.Equal(expected, UrlShortcutFile.IsUrl(target));

    /// <summary>
    /// ADR 0051: the synthetic KeyPath marker of a shortcut-only Component follows the package scope.
    /// An HKLM marker in a per-user package fails a non-elevated install (MSI Error 1406, verified
    /// with a real msiexec run), so per-user must use HKCU and per-machine keeps HKLM.
    /// </summary>
    [Theory]
    [InlineData(InstallScope.PerUser, "perUser", "HKCU")]
    [InlineData(InstallScope.PerMachine, "perMachine", "HKCU")]
    public void Generate_ShortcutOnlyComponentMarker_FollowsInstallScope(InstallScope scope, string expectedScope, string expectedRoot)
    {
        var manifest = BaseManifest(
            shortcuts: [new Shortcut { Name = "Docs", TargetPath = "[INSTALLFOLDER]docs\\readme.txt", Location = ShortcutLocation.DesktopFolder }]) with
        {
            AppInfo = new AppInfo { InstallScope = scope },
        };

        var doc = WxsGenerator.Generate(manifest, "C:/source");

        Assert.Equal(expectedScope, doc.Descendants(Ns + "Package").Single().Attribute("Scope")!.Value);
        var marker = doc.Descendants(Ns + "Shortcut").Single().Parent!.Elements(Ns + "RegistryValue").Single();
        Assert.Equal(expectedRoot, marker.Attribute("Root")!.Value);
    }

    /// <summary>
    /// ADR 0035: the Console can auto-fill a nested folder's WorkingDirectory with the
    /// <c>wr:dir:{root}:{relativePath}</c> sentinel instead of duplicating WxsGenerator's directory-id
    /// hashing client-side - this proves the resolved value is the exact same Id the real folder got,
    /// not merely "some" Id, by cross-checking against the generated tree itself.
    /// </summary>
    [Fact]
    public void Generate_ShortcutWithWorkingDirectorySentinel_ResolvesToTheRealNestedFolderDirectoryId()
    {
        var manifest = BaseManifest(
            declared:
            [
                new DeclaredFile { Id = "MainExe", SourcePath = "app.exe", InstallPath = "app.exe" },
                new DeclaredFile { Id = "Tool", SourcePath = "tool.exe", InstallPath = "bin/tool.exe" },
            ],
            shortcuts:
            [
                new Shortcut
                {
                    Name = "App",
                    TargetFileId = "MainExe",
                    Location = ShortcutLocation.DesktopFolder,
                    WorkingDirectory = "wr:dir:installFolder:bin",
                },
            ]);

        var doc = WxsGenerator.Generate(manifest, "C:/source");

        var binDirectoryId = doc.Descendants(Ns + "Directory").Single(d => d.Attribute("Name")!.Value == "bin").Attribute("Id")!.Value;
        var shortcut = doc.Descendants(Ns + "Shortcut").Single();
        Assert.Equal(binDirectoryId, shortcut.Attribute("WorkingDirectory")!.Value);
    }

    [Fact]
    public void Generate_AdvertisedFileTargetedShortcut_EmitsAdvertiseYes()
    {
        var manifest = BaseManifest(
            declared: [new DeclaredFile { Id = "MainExe", SourcePath = "app.exe", InstallPath = "app.exe" }],
            shortcuts: [new Shortcut { Name = "App", TargetFileId = "MainExe", Location = ShortcutLocation.ProgramMenuFolder, Advertise = true }]);

        var doc = WxsGenerator.Generate(manifest, "C:/source");

        var shortcut = doc.Descendants(Ns + "Shortcut").Single();
        Assert.Equal("yes", shortcut.Attribute("Advertise")!.Value);
    }

    [Fact]
    public void Generate_ByDefault_ShortcutIsNotAdvertised()
    {
        var manifest = BaseManifest(
            declared: [new DeclaredFile { Id = "MainExe", SourcePath = "app.exe", InstallPath = "app.exe" }],
            shortcuts: [new Shortcut { Name = "App", TargetFileId = "MainExe", Location = ShortcutLocation.ProgramMenuFolder }]);

        var doc = WxsGenerator.Generate(manifest, "C:/source");

        var shortcut = doc.Descendants(Ns + "Shortcut").Single();
        Assert.Equal("no", shortcut.Attribute("Advertise")!.Value);
    }

    /// <summary>
    /// Verified against the real `wix` CLI (WIX0035): Advertise="yes" and an explicit Target
    /// attribute are mutually exclusive, and a Custom-target (TargetPath) shortcut always needs an
    /// explicit Target - WxsGenerator must force Advertise off for it regardless of what the
    /// manifest says, not just rely on WinReleaseManifest.Validate() having caught it upstream
    /// (a hand-built manifest - tests, a direct API caller - might skip validation entirely).
    /// </summary>
    [Fact]
    public void Generate_AdvertisedCustomTargetShortcut_ForcesAdvertiseOff()
    {
        var manifest = BaseManifest(
            shortcuts: [new Shortcut { Name = "Docs", TargetPath = "[INSTALLFOLDER]docs\\readme.txt", Location = ShortcutLocation.DesktopFolder, Advertise = true }]);

        var doc = WxsGenerator.Generate(manifest, "C:/source");

        var shortcut = doc.Descendants(Ns + "Shortcut").Single();
        Assert.Equal("no", shortcut.Attribute("Advertise")!.Value);
        Assert.NotNull(shortcut.Attribute("Target"));
    }

    [Theory]
    [InlineData(ShortcutLocation.PersonalFolder, "PersonalFolder")]
    [InlineData(ShortcutLocation.FavoritesFolder, "FavoritesFolder")]
    [InlineData(ShortcutLocation.FontsFolder, "FontsFolder")]
    [InlineData(ShortcutLocation.SendToFolder, "SendToFolder")]
    [InlineData(ShortcutLocation.TemplateFolder, "TemplateFolder")]
    public void Generate_ShortcutInANewStandardFolder_EmitsThatStandardDirectory(string location, string expectedDirectoryId)
    {
        var manifest = BaseManifest(
            declared: [new DeclaredFile { Id = "MainExe", SourcePath = "app.exe", InstallPath = "app.exe" }],
            shortcuts: [new Shortcut { Name = "App", TargetFileId = "MainExe", Location = location }]);

        var doc = WxsGenerator.Generate(manifest, "C:/source");

        Assert.Contains(doc.Descendants(Ns + "StandardDirectory"), d => d.Attribute("Id")!.Value == expectedDirectoryId);
        var shortcut = doc.Descendants(Ns + "Shortcut").Single();
        Assert.Equal(expectedDirectoryId, shortcut.Attribute("Directory")!.Value);
    }

    [Fact]
    public void Generate_RegistryEntryWithEmptyName_OmitsTheNameAttribute()
    {
        // WiX rejects an empty Name attribute (WIX0006) - it must be omitted
        // entirely to mean "the key's default value", per RegistryEntry.Name's
        // own doc comment. Pre-existing bug this test caught (ADR 0033).
        var manifest = BaseManifest(registry: [new RegistryEntry { Root = RegistryRoot.Hkcr, Key = "myapp", Name = "", Value = "URL:MyApp Protocol", ValueType = RegistryValueType.String }]);

        var doc = WxsGenerator.Generate(manifest, "C:/source");

        var registryValue = doc.Descendants(Ns + "RegistryValue").Single();
        Assert.Null(registryValue.Attribute("Name"));
    }

    [Theory]
    [InlineData(RegistryRoot.Hklm, "HKLM")]
    [InlineData(RegistryRoot.Hkcu, "HKCU")]
    [InlineData(RegistryRoot.Hkcr, "HKCR")]
    [InlineData(RegistryRoot.Hku, "HKU")]
    public void Generate_RegistryEntry_MapsEachRootToItsWixAttribute(RegistryRoot root, string expectedAttribute)
    {
        var manifest = BaseManifest(registry: [new RegistryEntry { Root = root, Key = "Software\\Test", Name = "Value", Value = "1", ValueType = RegistryValueType.String }]);

        var doc = WxsGenerator.Generate(manifest, "C:/source");

        var registryValue = doc.Descendants(Ns + "RegistryValue").Single();
        Assert.Equal(expectedAttribute, registryValue.Attribute("Root")!.Value);
    }

    [Fact]
    public void Generate_ByDefault_RegistryEntryWritesTheValue()
    {
        var manifest = BaseManifest(registry: [new RegistryEntry { Root = RegistryRoot.Hklm, Key = "Software\\Test", Name = "Value", Value = "1", ValueType = RegistryValueType.Integer }]);

        var doc = WxsGenerator.Generate(manifest, "C:/source");

        var registryValue = doc.Descendants(Ns + "RegistryValue").Single();
        Assert.Equal("1", registryValue.Attribute("Value")!.Value);
        Assert.Equal("yes", registryValue.Attribute("KeyPath")!.Value);
        Assert.Empty(doc.Descendants(Ns + "RemoveRegistryValue"));
        Assert.Empty(doc.Descendants(Ns + "RemoveRegistryKey"));
    }

    [Theory]
    [InlineData(PackageArchitecture.X64, "always32", 2)]
    [InlineData(PackageArchitecture.X86, null, 1)]
    public void Generate_Wow6432NodeKey_BecomesA32BitComponentWithoutTheSegment(PackageArchitecture architecture, string? expectedBitness, int expectedComponents)
    {
        var manifest = BaseManifest(registry:
        [
            new RegistryEntry { Root = RegistryRoot.Hklm, Key = "SOFTWARE\\WOW6432Node\\Vendor", Name = "A", Value = "1" },
            new RegistryEntry { Root = RegistryRoot.Hklm, Key = "SOFTWARE\\Vendor", Name = "B", Value = "2" },
        ]) with { Architecture = architecture };

        var doc = WxsGenerator.Generate(manifest, "C:/source");

        var values = doc.Descendants(Ns + "RegistryValue").ToList();
        Assert.All(values, v => Assert.Equal("SOFTWARE\\Vendor", v.Attribute("Key")!.Value));
        // In a 64-bit package the 32-bit and 64-bit copies of a key are different places; in a 32-bit package they are the same key.
        Assert.Equal(expectedComponents, values.Select(v => v.Parent).Distinct().Count());
        Assert.Equal(expectedBitness, values.Single(v => v.Attribute("Name")!.Value == "A").Parent!.Attribute("Bitness")?.Value);
        Assert.Null(values.Single(v => v.Attribute("Name")!.Value == "B").Parent!.Attribute("Bitness"));
    }

    // The owner's own case: the same key and value name written to the 64-bit view and, through WOW6432Node, to the 32-bit view of an x64 package.
    [Fact]
    public void Generate_TheSameKeyAndValueNameInBothViews_BuildsOne64BitAndOne32BitComponent()
    {
        var manifest = BaseManifest(registry:
        [
            new RegistryEntry { Root = RegistryRoot.Hklm, Key = @"SOFTWARE\GE\App", Name = "OrcarInstalled", Value = "1" },
            new RegistryEntry { Root = RegistryRoot.Hklm, Key = @"SOFTWARE\WOW6432Node\GE\App", Name = "OrcarInstalled", Value = "1" },
        ]);

        var doc = WxsGenerator.Generate(manifest, "C:/source");

        var values = doc.Descendants(Ns + "RegistryValue").ToList();
        Assert.Equal(2, values.Count);
        Assert.All(values, v => Assert.Equal(@"SOFTWARE\GE\App", v.Attribute("Key")!.Value));
        var components = values.Select(v => v.Parent!).ToList();
        Assert.Equal(2, components.Select(c => c.Attribute("Id")!.Value).Distinct().Count());
        Assert.Single(components, c => c.Attribute("Bitness")?.Value == "always32");
        Assert.Single(components, c => c.Attribute("Bitness") is null);
    }

    // Found by the spec review: turning the credit off must hold even when no ANSI code page can hold the product name.
    [Theory]
    [InlineData("😀 App")]
    [InlineData("日本語 App")]
    public void Generate_WithTheCreditOff_NeverWritesTheCreditIntoTheSummaryInformation(string name)
    {
        var doc = WxsGenerator.Generate(BaseManifest() with { Name = name, AppInfo = new AppInfo { PackagedWithCredit = false } }, "C:/source");

        var summary = doc.Descendants(Ns + "SummaryInformation").SingleOrDefault();
        var comments = summary?.Attribute("Comments")?.Value;
        Assert.True(comments is null || !comments.Contains("WinRelease"), $"Comments were '{comments}'");
    }

    [Fact]
    public void Generate_RemoveValueAction_EmitsRemoveRegistryValueWithASyntheticKeyPath()
    {
        var manifest = BaseManifest(
            registry: [new RegistryEntry { Root = RegistryRoot.Hklm, Key = "Software\\Legacy", Name = "Stale", Value = "", ValueType = RegistryValueType.String, Action = RegistryEntryAction.RemoveValue }]);

        var doc = WxsGenerator.Generate(manifest, "C:/source");

        var removeValue = doc.Descendants(Ns + "RemoveRegistryValue").Single();
        Assert.Equal("HKLM", removeValue.Attribute("Root")!.Value);
        Assert.Equal("Software\\Legacy", removeValue.Attribute("Key")!.Value);
        Assert.Equal("Stale", removeValue.Attribute("Name")!.Value);
        // RemoveRegistryValue can't be its own KeyPath (verified against the real `wix` CLI) -
        // the owning Component needs the same synthetic-marker RegistryValue trick shortcut-only
        // components already use.
        var component = removeValue.Parent!;
        Assert.Equal(Ns + "Component", component.Name);
        var marker = component.Elements(Ns + "RegistryValue").Single();
        Assert.Equal("yes", marker.Attribute("KeyPath")!.Value);
        Assert.DoesNotContain(doc.Descendants(Ns + "RegistryValue"), e => e.Attribute("Value")?.Value == "Stale");
    }

    [Theory]
    [InlineData(false, "removeOnInstall")]
    [InlineData(true, "removeOnUninstall")]
    public void Generate_RemoveKeyAction_EmitsRemoveRegistryKeyWithTheRightTiming(bool removeOnUninstall, string expectedAction)
    {
        var manifest = BaseManifest(
            registry: [new RegistryEntry { Root = RegistryRoot.Hkcu, Key = "Software\\Legacy\\Stale", Name = "", Value = "", ValueType = RegistryValueType.String, Action = RegistryEntryAction.RemoveKey, RemoveOnUninstall = removeOnUninstall }]);

        var doc = WxsGenerator.Generate(manifest, "C:/source");

        var removeKey = doc.Descendants(Ns + "RemoveRegistryKey").Single();
        Assert.Equal("HKCU", removeKey.Attribute("Root")!.Value);
        Assert.Equal("Software\\Legacy\\Stale", removeKey.Attribute("Key")!.Value);
        Assert.Equal(expectedAction, removeKey.Attribute("Action")!.Value);
    }

    /// <summary>Same ADR 0051 scope-awareness as the shortcut-only Component marker - a RemoveValue/RemoveKey entry's synthetic KeyPath marker must follow package scope regardless of which Root the removal itself targets.</summary>
    [Theory]
    [InlineData(InstallScope.PerUser, "HKCU")]
    [InlineData(InstallScope.PerMachine, "HKLM")]
    public void Generate_RegistryRemovalMarker_FollowsInstallScope(InstallScope scope, string expectedRoot)
    {
        var manifest = BaseManifest(
            registry: [new RegistryEntry { Root = RegistryRoot.Hklm, Key = "Software\\Legacy", Name = "Stale", Value = "", ValueType = RegistryValueType.String, Action = RegistryEntryAction.RemoveValue }]) with
        {
            AppInfo = new AppInfo { InstallScope = scope },
        };

        var doc = WxsGenerator.Generate(manifest, "C:/source");

        var marker = doc.Descendants(Ns + "RemoveRegistryValue").Single().Parent!.Elements(Ns + "RegistryValue").Single();
        Assert.Equal(expectedRoot, marker.Attribute("Root")!.Value);
    }

    [Fact]
    public void Generate_EnvironmentVariable_EmitsItWithASyntheticKeyPath()
    {
        var manifest = BaseManifest(environmentVariables:
        [
            new EnvironmentVariableEntry { Name = "ACME_HOME", Value = "[INSTALLFOLDER]", Action = EnvironmentVariableAction.Set, Part = EnvironmentVariablePart.All, System = true, Permanent = false },
        ]);

        var doc = WxsGenerator.Generate(manifest, "C:/source");

        var environment = doc.Descendants(Ns + "Environment").Single();
        Assert.Equal("ACME_HOME", environment.Attribute("Name")!.Value);
        Assert.Equal("[INSTALLFOLDER]", environment.Attribute("Value")!.Value);
        Assert.Equal("set", environment.Attribute("Action")!.Value);
        Assert.Equal("all", environment.Attribute("Part")!.Value);
        Assert.Equal("yes", environment.Attribute("System")!.Value);
        Assert.Equal("no", environment.Attribute("Permanent")!.Value);
        Assert.Equal(";", environment.Attribute("Separator")!.Value);
        // Environment has no KeyPath attribute at all (verified against the real `wix` CLI) - the
        // owning Component needs the same synthetic-marker RegistryValue trick RemoveValue/RemoveKey
        // already use.
        Assert.Null(environment.Attribute("KeyPath"));
        var component = environment.Parent!;
        Assert.Equal(Ns + "Component", component.Name);
        var marker = component.Elements(Ns + "RegistryValue").Single();
        Assert.Equal("yes", marker.Attribute("KeyPath")!.Value);
    }

    [Theory]
    [InlineData(EnvironmentVariableAction.Set, "set")]
    [InlineData(EnvironmentVariableAction.Create, "create")]
    [InlineData(EnvironmentVariableAction.Remove, "remove")]
    public void Generate_EnvironmentVariableAction_MapsToItsWixValue(EnvironmentVariableAction action, string expected)
    {
        var manifest = BaseManifest(environmentVariables: [new EnvironmentVariableEntry { Name = "ACME_HOME", Action = action }]);

        var doc = WxsGenerator.Generate(manifest, "C:/source");

        Assert.Equal(expected, doc.Descendants(Ns + "Environment").Single().Attribute("Action")!.Value);
    }

    [Theory]
    [InlineData(false, "HKCU")]
    [InlineData(true, "HKLM")]
    public void Generate_EnvironmentVariableMarker_FollowsTheEntrysOwnSystemFlag(bool system, string expectedRoot)
    {
        // Deliberately the opposite of AppInfo.InstallScope's default (PerMachine) - the marker
        // should track the entry's own System flag, not the package-wide install scope, since
        // System is already per-entry here (unlike Registry's Action, which has no per-entry scope
        // of its own to follow).
        var manifest = BaseManifest(environmentVariables: [new EnvironmentVariableEntry { Name = "ACME_HOME", System = system }]);

        var doc = WxsGenerator.Generate(manifest, "C:/source");

        var marker = doc.Descendants(Ns + "Environment").Single().Parent!.Elements(Ns + "RegistryValue").Single();
        Assert.Equal(expectedRoot, marker.Attribute("Root")!.Value);
    }

    [Fact]
    public void Generate_TwoEnvironmentVariablesWithTheSameNameButDifferentActions_GetDistinctIds()
    {
        var manifest = BaseManifest(environmentVariables:
        [
            new EnvironmentVariableEntry { Name = "ACME_HOME", Action = EnvironmentVariableAction.Set, Value = "[INSTALLFOLDER]" },
            new EnvironmentVariableEntry { Name = "ACME_HOME", Action = EnvironmentVariableAction.Remove },
        ]);

        var doc = WxsGenerator.Generate(manifest, "C:/source");

        var ids = doc.Descendants(Ns + "Environment").Select(e => e.Attribute("Id")!.Value).ToList();
        Assert.Equal(2, ids.Distinct().Count());
    }

    [Fact]
    public void Generate_ByDefault_EmitsNoArpProperties()
    {
        // BaseManifest doesn't set AppInfo - AppInfo's own default (new()) should stay entirely
        // silent rather than emitting empty ARP* properties MSI would treat as meaningfully set.
        var manifest = BaseManifest() with { AppInfo = new AppInfo { PackagedWithCredit = false } };

        var doc = WxsGenerator.Generate(manifest, "C:/source");

        Assert.DoesNotContain(doc.Descendants(Ns + "Property"), p => p.Attribute("Id")!.Value.StartsWith("ARP", StringComparison.Ordinal));
        Assert.Empty(doc.Descendants(Ns + "SummaryInformation"));
    }

    // ADR 0113: on by default - quiet metadata only, nothing on an installer screen.
    [Fact]
    public void Generate_ByDefault_CreditsWinReleaseInTheSummaryInformationAndTheArpComments()
    {
        var doc = WxsGenerator.Generate(BaseManifest(), "C:/source");

        Assert.Contains("winrelease.geappsolutions.com", doc.Descendants(Ns + "SummaryInformation").Single().Attribute("Comments")!.Value);
        Assert.Contains("geappsolutions.com", doc.Descendants(Ns + "Property").Single(p => p.Attribute("Id")!.Value == "ARPCOMMENTS").Attribute("Value")!.Value);
    }

    // Enterprise QA sheets check both: the standard sentence, and "the tooling and version used to create the package".
    [Fact]
    public void SummaryComments_KeepWixsStandardSentence_ThenNameTheToolAndItsVersion()
    {
        Assert.StartsWith("This installer database contains the logic and data required to install Acme.", WxsGenerator.SummaryComments("Acme"));
        Assert.Contains("Created with WinRelease 0.1.9, a free MSI builder", WxsGenerator.CreditText("0.1.9"));
        Assert.DoesNotContain("  ", WxsGenerator.CreditText(null));
    }

    [Fact]
    public void ToolVersion_IsOnlyTakenFromAWinReleaseProgram()
    {
        Assert.Null(ToolVersion.Resolve(typeof(WxsGeneratorTests).Assembly)); // a test run: no version rather than a wrong one
        Assert.Null(ToolVersion.Resolve(null));
    }

    // Found by the QA1 checks: a Japanese product name came out as DEL characters in the file's Subject (the Summary Information needs an ANSI page, not 65001).
    [Theory]
    [InlineData("Plain", null)]
    [InlineData("Café", null)]
    [InlineData("日本語", 932)]
    [InlineData("Приложение", 1251)]
    [InlineData("中文应用", 936)]
    public void SummaryCodepage_PicksTheFirstAnsiPageThatHoldsTheText(string text, int? expected) => Assert.Equal(expected, WxsGenerator.SummaryCodepage(text));

    [Fact]
    public void SummaryInformation_GetsAnAnsiCodepageForANonLatinName_AndAnAsciiSafeFallbackWhenNoPageFits()
    {
        var japanese = WxsGenerator.Generate(BaseManifest() with { Name = "日本語 App" }, "C:/source");
        Assert.Equal("932", japanese.Descendants(Ns + "SummaryInformation").Single().Attribute("Codepage")!.Value);

        var emoji = WxsGenerator.Generate(BaseManifest() with { Name = "😀 App" }, "C:/source");
        Assert.False(WxsGenerator.FitsAnsi("😀 App"));
        Assert.Equal("?? App", emoji.Descendants(Ns + "SummaryInformation").Single().Attribute("Description")!.Value);
    }

    [Fact]
    public void Generate_KeepsTheAuthorsOwnArpComments_ButStillCreditsTheSummaryInformation()
    {
        var doc = WxsGenerator.Generate(BaseManifest() with { AppInfo = new AppInfo { Comments = "Our tool" } }, "C:/source");

        Assert.Equal("Our tool", doc.Descendants(Ns + "Property").Single(p => p.Attribute("Id")!.Value == "ARPCOMMENTS").Attribute("Value")!.Value);
        Assert.Single(doc.Descendants(Ns + "SummaryInformation"));
    }

    [Fact]
    public void Generate_AppInfoLinksAndText_MapToTheirArpProperties()
    {
        var manifest = BaseManifest() with
        {
            AppInfo = new AppInfo
            {
                SupportUrl = "https://acme.com/support",
                UpdateUrl = "https://acme.com/updates",
                AboutUrl = "https://acme.com",
                SupportPhone = "+1-800-555-0199",
                Contact = "Support Team",
                Comments = "Desktop application package",
            },
        };

        var doc = WxsGenerator.Generate(manifest, "C:/source");

        var properties = doc.Descendants(Ns + "Property").ToDictionary(p => p.Attribute("Id")!.Value, p => p.Attribute("Value")!.Value);
        Assert.Equal("https://acme.com/support", properties["ARPHELPLINK"]);
        Assert.Equal("https://acme.com/updates", properties["ARPURLUPDATEINFO"]);
        Assert.Equal("https://acme.com", properties["ARPURLINFOABOUT"]);
        Assert.Equal("+1-800-555-0199", properties["ARPHELPTELEPHONE"]);
        Assert.Equal("Support Team", properties["ARPCONTACT"]);
        Assert.Equal("Desktop application package", properties["ARPCOMMENTS"]);
    }

    [Theory]
    [InlineData(true, false, false, false)]
    [InlineData(false, true, false, false)]
    [InlineData(false, false, true, false)]
    [InlineData(false, false, false, true)]
    public void Generate_AppInfoControlPanelFlags_EmitOnlyTheEnabledArpFlagProperty(
        bool disableModify, bool disableRepair, bool disableRemove, bool hideFromControlPanel)
    {
        var manifest = BaseManifest() with
        {
            AppInfo = new AppInfo
            {
                // Wizard off: with it on, ARPNOMODIFY comes from WixUI itself (see Generate_DisableModify_LeavesArpNoModifyToTheWizard).
                InstallWizard = false,
                DisableModify = disableModify,
                DisableRepair = disableRepair,
                DisableRemove = disableRemove,
                HideFromControlPanel = hideFromControlPanel,
            },
        };

        var doc = WxsGenerator.Generate(manifest, "C:/source");

        var arpFlagIds = doc.Descendants(Ns + "Property")
            .Where(p => p.Attribute("Id")!.Value.StartsWith("ARPNO", StringComparison.Ordinal) || p.Attribute("Id")!.Value == "ARPSYSTEMCOMPONENT")
            .Select(p => p.Attribute("Id")!.Value)
            .ToList();

        var expected = new List<string>();
        if (disableModify) expected.Add("ARPNOMODIFY");
        if (disableRepair) expected.Add("ARPNOREPAIR");
        if (disableRemove) expected.Add("ARPNOREMOVE");
        if (hideFromControlPanel) expected.Add("ARPSYSTEMCOMPONENT");

        Assert.Equal(expected, arpFlagIds);
    }

    [Fact]
    public void Generate_AppInfoIconPath_EmitsAnArpProductIconPointingAtThatFile()
    {
        var manifest = BaseManifest() with { AppInfo = new AppInfo { IconPath = "assets/app.ico" } };

        var doc = WxsGenerator.Generate(manifest, "C:/source");

        var iconProperty = doc.Descendants(Ns + "Property").Single(p => p.Attribute("Id")!.Value == "ARPPRODUCTICON");
        var icon = doc.Descendants(Ns + "Icon").Single(i => i.Attribute("Id")!.Value == iconProperty.Attribute("Value")!.Value);
        Assert.Equal(Path.Combine("C:/source", "assets/app.ico"), icon.Attribute("SourceFile")!.Value);
    }

    [Fact]
    public void Generate_AutoExtractIconWithADeclaredExe_UsesThatExeAsTheArpProductIconSource()
    {
        var manifest = BaseManifest(declared:
        [
            new DeclaredFile { Id = "ReadmeFile", SourcePath = "readme.txt", InstallPath = "readme.txt" },
            new DeclaredFile { Id = "MainExe", SourcePath = "app.exe", InstallPath = "app.exe" },
        ]) with
        { AppInfo = new AppInfo { AutoExtractIcon = true, IconPath = "ignored.ico" } };

        var doc = WxsGenerator.Generate(manifest, "C:/source");

        var iconProperty = doc.Descendants(Ns + "Property").Single(p => p.Attribute("Id")!.Value == "ARPPRODUCTICON");
        var icon = doc.Descendants(Ns + "Icon").Single(i => i.Attribute("Id")!.Value == iconProperty.Attribute("Value")!.Value);
        Assert.Equal(Path.Combine("C:/source", "app.exe"), icon.Attribute("SourceFile")!.Value);
    }

    [Fact]
    public void Generate_AutoExtractIconWithNoDeclaredExe_OmitsArpProductIcon()
    {
        var manifest = BaseManifest(declared: [new DeclaredFile { Id = "ReadmeFile", SourcePath = "readme.txt", InstallPath = "readme.txt" }])
            with
        { AppInfo = new AppInfo { AutoExtractIcon = true } };

        var doc = WxsGenerator.Generate(manifest, "C:/source");

        Assert.DoesNotContain(doc.Descendants(Ns + "Property"), p => p.Attribute("Id")!.Value == "ARPPRODUCTICON");
        Assert.Empty(doc.Descendants(Ns + "Icon"));
    }

    [Fact]
    public void Generate_AppInfoInstallScopePerUser_SetsTheCompiledPackageScopeToPerUser()
    {
        // Promoted from UI-only to functional by the "Graceful Ingestion" pass - an imported
        // per-user source's declared scope is now preserved, not silently forced per-machine.
        var manifest = BaseManifest() with { AppInfo = new AppInfo { InstallScope = InstallScope.PerUser } };

        var doc = WxsGenerator.Generate(manifest, "C:/source");

        Assert.Equal("perUser", doc.Descendants(Ns + "Package").Single().Attribute("Scope")!.Value);
    }

    [Fact]
    public void Generate_ByDefault_CompilesPerMachine()
    {
        // A brand-new manifest's AppInfo.InstallScope default (PerMachine) is unchanged.
        var doc = WxsGenerator.Generate(BaseManifest(), "C:/source");

        Assert.Equal("perMachine", doc.Descendants(Ns + "Package").Single().Attribute("Scope")!.Value);
    }

    [Fact]
    public void Generate_AlwaysEmitsAnEmbeddedMediaTemplate()
    {
        var doc = WxsGenerator.Generate(BaseManifest(declared: [new DeclaredFile { Id = "F", SourcePath = "a.txt", InstallPath = "a.txt" }]), "C:/source");

        var mediaTemplate = doc.Descendants(Ns + "MediaTemplate").Single();
        Assert.Equal("yes", mediaTemplate.Attribute("EmbedCab")!.Value);
        Assert.Equal("high", mediaTemplate.Attribute("CompressionLevel")!.Value);
    }

    [Fact]
    public void Generate_DoesNotDuplicateTheAllUsersPropertyAlreadyImpliedByScope()
    {
        // Deliberate: WiX v5 defines ALLUSERS internally from Package/@Scope="perMachine" during
        // bind - an explicit <Property Id="ALLUSERS"/> here would collide with it (confirmed
        // against the real wix build CLI: WIX0091 "Duplicate Property... found", not assumed).
        // WixCompilerIntegrationTests proves a real build still succeeds; this just guards against
        // the pre-bind XML re-introducing the duplicate.
        var doc = WxsGenerator.Generate(BaseManifest(), "C:/source");

        Assert.DoesNotContain(doc.Descendants(Ns + "Property"), p => p.Attribute("Id")!.Value == "ALLUSERS");
    }

    [Fact]
    public void Generate_MajorUpgradeMessage_UsesTheProductNamePropertyTokenNotAnInterpolatedString()
    {
        // [ProductName] is resolved by the installer itself at runtime from Package/@Name - not
        // baked in via C# string interpolation, so it can never drift out of sync.
        var doc = WxsGenerator.Generate(BaseManifest(), "C:/source");

        var majorUpgrade = doc.Descendants(Ns + "MajorUpgrade").Single();
        Assert.Equal("A newer version of [ProductName] is already installed.", majorUpgrade.Attribute("DowngradeErrorMessage")!.Value);
    }
}
