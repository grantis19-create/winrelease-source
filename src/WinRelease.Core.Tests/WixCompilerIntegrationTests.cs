using WinRelease.Core.Compilation;
using WinRelease.Core.Manifest;
using Xunit;

namespace WinRelease.Core.Tests;

/// <summary>
/// Exercises the real `wix build` CLI - requires WiX v5 on PATH (installed in
/// the project's Docker image; not assumed present on every dev machine).
/// </summary>
[Trait("Category", "Integration")]
public sealed class WixCompilerIntegrationTests : IDisposable
{
    private readonly string _sourceRoot = Directory.CreateTempSubdirectory("winrelease-source-").FullName;
    private readonly string _outputDirectory = Directory.CreateTempSubdirectory("winrelease-output-").FullName;

    [Fact]
    public void Compile_ProducesAnMsi_ForDeclaredFilesShortcutsAndRegistry()
    {
        File.WriteAllText(Path.Combine(_sourceRoot, "app.exe"), "fake exe payload");
        File.WriteAllText(Path.Combine(_sourceRoot, "readme.txt"), "fake readme payload");

        var localesDir = Path.Combine(_sourceRoot, "locales");
        Directory.CreateDirectory(localesDir);
        File.WriteAllText(Path.Combine(localesDir, "en.json"), "{}");
        File.WriteAllText(Path.Combine(localesDir, "fr.json"), "{}");

        var manifest = new WinReleaseManifest
        {
            UpgradeCode = Guid.NewGuid(),
            Name = "WinRelease Test App",
            Manufacturer = "WinRelease Tests",
            DisplayVersion = "1.0.0",
            Files = new ManifestFiles
            {
                Declared =
                [
                    new DeclaredFile { Id = "MainExe", SourcePath = "app.exe", InstallPath = "app.exe" },
                    new DeclaredFile { Id = "ReadmeFile", SourcePath = "readme.txt", InstallPath = "readme.txt" },
                ],
                Harvest = [new HarvestFolder { SourceFolder = "locales", InstallPath = "locales" }],
            },
            Shortcuts =
            [
                new Shortcut { Name = "WinRelease Test App", TargetFileId = "MainExe", Location = ShortcutLocation.ProgramMenuFolder },
                new Shortcut { Name = "WinRelease Test App", TargetFileId = "MainExe", Location = ShortcutLocation.DesktopFolder },
            ],
            Registry =
            [
                new RegistryEntry
                {
                    Root = RegistryRoot.Hklm,
                    Key = "Software\\WinRelease\\Tests",
                    Name = "InstallPath",
                    Value = "[INSTALLFOLDER]",
                    ValueType = RegistryValueType.ExpandString,
                },
            ],
        };

        var compiler = new WixCompiler(new SystemProcessRunner());
        var result = compiler.Compile(manifest, _sourceRoot, _outputDirectory);

        Assert.True(result.Succeeded, $"wix build failed.\nSTDOUT:\n{result.StandardOutput}\nSTDERR:\n{result.StandardError}");
        Assert.NotNull(result.OutputMsiPath);
        Assert.True(File.Exists(result.OutputMsiPath));
        Assert.True(new FileInfo(result.OutputMsiPath!).Length > 0);
    }

    /// <summary>The same key and value in both registry views of an x64 package (the plain key and its WOW6432Node twin) builds, as one 64-bit and one 32-bit component (ADR 0108).</summary>
    [Fact]
    public void Compile_ProducesAnMsi_ForTheSameRegistryValueInBothViews()
    {
        var manifest = new WinReleaseManifest
        {
            UpgradeCode = Guid.NewGuid(),
            Name = "Dual View Test",
            Manufacturer = "WinRelease Tests",
            DisplayVersion = "1.0.0",
            Registry =
            [
                new RegistryEntry { Root = RegistryRoot.Hklm, Key = @"SOFTWARE\GE\Dual", Name = "Same", Value = "1" },
                new RegistryEntry { Root = RegistryRoot.Hklm, Key = @"SOFTWARE\WOW6432Node\GE\Dual", Name = "Same", Value = "1" },
            ],
        };

        var result = new WixCompiler(new SystemProcessRunner()).Compile(manifest, _sourceRoot, _outputDirectory);

        Assert.True(result.Succeeded, $"wix build failed.\nSTDOUT:\n{result.StandardOutput}\nSTDERR:\n{result.StandardError}");
    }

    /// <summary>ADR 0033: proves the real `wix build` accepts the new multi-root/shortcut-property/registry-hive output, not just that the generated XML looks right on paper (see WxsGeneratorTests for that).</summary>
    [Fact]
    public void Compile_ProducesAnMsi_ForNonDefaultRootsShortcutPropertiesAndNewRegistryHives()
    {
        File.WriteAllText(Path.Combine(_sourceRoot, "app.exe"), "fake exe payload");
        File.WriteAllText(Path.Combine(_sourceRoot, "config.ini"), "fake config payload");

        var manifest = new WinReleaseManifest
        {
            UpgradeCode = Guid.NewGuid(),
            Name = "WinRelease Test App",
            Manufacturer = "WinRelease Tests",
            DisplayVersion = "1.0.0",
            Files = new ManifestFiles
            {
                Declared =
                [
                    new DeclaredFile { Id = "MainExe", SourcePath = "app.exe", InstallPath = "app.exe" },
                    new DeclaredFile { Id = "SharedConfig", SourcePath = "config.ini", InstallPath = "WinReleaseTests/config.ini", Root = InstallRoot.CommonFilesFolder },
                ],
            },
            Shortcuts =
            [
                new Shortcut
                {
                    Name = "WinRelease Test App",
                    TargetFileId = "MainExe",
                    Location = ShortcutLocation.StartupFolder,
                    WorkingDirectory = "INSTALLFOLDER",
                    Arguments = "/silent",
                    Description = "Launches WinRelease Test App",
                    IconPath = "app.exe",
                },
            ],
            Registry =
            [
                new RegistryEntry { Root = RegistryRoot.Hkcr, Key = "winreleasetest", Name = "", Value = "URL:WinRelease Test Protocol", ValueType = RegistryValueType.String },
                new RegistryEntry { Root = RegistryRoot.Hku, Key = ".DEFAULT\\Software\\WinRelease\\Tests", Name = "Seen", Value = "1", ValueType = RegistryValueType.Integer },
            ],
        };

        var compiler = new WixCompiler(new SystemProcessRunner());
        var result = compiler.Compile(manifest, _sourceRoot, _outputDirectory);

        Assert.True(result.Succeeded, $"wix build failed.\nSTDOUT:\n{result.StandardOutput}\nSTDERR:\n{result.StandardError}");
        Assert.NotNull(result.OutputMsiPath);
        Assert.True(File.Exists(result.OutputMsiPath));
    }

    /// <summary>
    /// Proves the real `wix build` accepts a Shortcut's Location pointing anywhere in the install
    /// tree via the wr:dir: sentinel - including a root (AppDataFolder) and a subfolder
    /// (INSTALLFOLDER\Logs) that no declared file or harvest folder ever places anything into. Before
    /// the "touch the directory chain" fix, this would fail wix build on a dangling Directory
    /// reference: the Shortcut's own Directory/WorkingDirectory attribute would point at a Directory
    /// Id nothing in the StandardDirectory tree ever declared.
    /// </summary>
    [Fact]
    public void Compile_ProducesAnMsi_ForShortcutLocationAndWorkingDirectoryWithNoFilesThere()
    {
        File.WriteAllText(Path.Combine(_sourceRoot, "app.exe"), "fake exe payload");

        var manifest = new WinReleaseManifest
        {
            UpgradeCode = Guid.NewGuid(),
            Name = "WinRelease Test App",
            Manufacturer = "WinRelease Tests",
            DisplayVersion = "1.0.0",
            Files = new ManifestFiles
            {
                Declared = [new DeclaredFile { Id = "MainExe", SourcePath = "app.exe", InstallPath = "app.exe" }],
            },
            Shortcuts =
            [
                // Location: a bare install root (AppDataFolder) nothing else ever touches.
                new Shortcut { Name = "Settings Folder", TargetFileId = "MainExe", Location = "wr:dir:appDataFolder:" },
                // Location + WorkingDirectory: a subfolder under INSTALLFOLDER nothing else ever touches.
                new Shortcut
                {
                    Name = "View Logs",
                    TargetFileId = "MainExe",
                    Location = "wr:dir:installFolder:Logs",
                    WorkingDirectory = "wr:dir:installFolder:Logs",
                },
            ],
        };

        var compiler = new WixCompiler(new SystemProcessRunner());
        var result = compiler.Compile(manifest, _sourceRoot, _outputDirectory);

        Assert.True(result.Succeeded, $"wix build failed.\nSTDOUT:\n{result.StandardOutput}\nSTDERR:\n{result.StandardError}");
        Assert.NotNull(result.OutputMsiPath);
        Assert.True(File.Exists(result.OutputMsiPath));
    }

    /// <summary>
    /// Proves the real `wix build` accepts a Shortcut nested into a Start Menu "program group"
    /// subfolder via the wr:dir:programMenuFolder:{path} sentinel - not just a flat preset location,
    /// and not just one level deep (the Console's own "Company\Product" nesting example).
    /// </summary>
    [Fact]
    public void Compile_ProducesAnMsi_ForShortcutInStartMenuProgramGroup()
    {
        File.WriteAllText(Path.Combine(_sourceRoot, "app.exe"), "fake exe payload");

        var manifest = new WinReleaseManifest
        {
            UpgradeCode = Guid.NewGuid(),
            Name = "WinRelease Test App",
            Manufacturer = "WinRelease Tests",
            DisplayVersion = "1.0.0",
            Files = new ManifestFiles
            {
                Declared = [new DeclaredFile { Id = "MainExe", SourcePath = "app.exe", InstallPath = "app.exe" }],
            },
            Shortcuts =
            [
                new Shortcut { Name = "WinRelease Test App", TargetFileId = "MainExe", Location = "wr:dir:programMenuFolder:WinRelease Tests/Test App" },
                new Shortcut { Name = "Uninstall WinRelease Test App", TargetPath = "[SystemFolder]msiexec.exe", Location = "wr:dir:programMenuFolder:WinRelease Tests/Test App" },
            ],
        };

        var compiler = new WixCompiler(new SystemProcessRunner());
        var result = compiler.Compile(manifest, _sourceRoot, _outputDirectory);

        Assert.True(result.Succeeded, $"wix build failed.\nSTDOUT:\n{result.StandardOutput}\nSTDERR:\n{result.StandardError}");
        Assert.NotNull(result.OutputMsiPath);
        Assert.True(File.Exists(result.OutputMsiPath));
    }

    /// <summary>Proves the real `wix build` accepts an advertised (Advertise="yes") file-targeted shortcut, with WorkingDirectory/Arguments still present - the exact combination verified by hand against the CLI before this feature was built.</summary>
    [Fact]
    public void Compile_ProducesAnMsi_ForAnAdvertisedShortcut()
    {
        File.WriteAllText(Path.Combine(_sourceRoot, "app.exe"), "fake exe payload");

        var manifest = new WinReleaseManifest
        {
            UpgradeCode = Guid.NewGuid(),
            Name = "WinRelease Test App",
            Manufacturer = "WinRelease Tests",
            DisplayVersion = "1.0.0",
            Files = new ManifestFiles { Declared = [new DeclaredFile { Id = "MainExe", SourcePath = "app.exe", InstallPath = "app.exe" }] },
            Shortcuts =
            [
                new Shortcut
                {
                    Name = "WinRelease Test App",
                    TargetFileId = "MainExe",
                    Location = ShortcutLocation.ProgramMenuFolder,
                    Arguments = "/silent",
                    Advertise = true,
                },
            ],
        };

        var compiler = new WixCompiler(new SystemProcessRunner());
        var result = compiler.Compile(manifest, _sourceRoot, _outputDirectory);

        Assert.True(result.Succeeded, $"wix build failed.\nSTDOUT:\n{result.StandardOutput}\nSTDERR:\n{result.StandardError}");
        Assert.NotNull(result.OutputMsiPath);
        Assert.True(File.Exists(result.OutputMsiPath));
    }

    /// <summary>Proves the real `wix build` accepts a RemoveValue and a RemoveKey registry entry side by side with a normal Write one - the three Registry Actions a project can now mix freely.</summary>
    [Fact]
    public void Compile_ProducesAnMsi_ForMixedRegistryActions()
    {
        File.WriteAllText(Path.Combine(_sourceRoot, "app.exe"), "fake exe payload");

        var manifest = new WinReleaseManifest
        {
            UpgradeCode = Guid.NewGuid(),
            Name = "WinRelease Test App",
            Manufacturer = "WinRelease Tests",
            DisplayVersion = "1.0.0",
            Files = new ManifestFiles { Declared = [new DeclaredFile { Id = "MainExe", SourcePath = "app.exe", InstallPath = "app.exe" }] },
            Registry =
            [
                new RegistryEntry { Root = RegistryRoot.Hklm, Key = "Software\\WinRelease Tests", Name = "InstallPath", Value = "[INSTALLFOLDER]", ValueType = RegistryValueType.ExpandString },
                new RegistryEntry { Root = RegistryRoot.Hklm, Key = "Software\\WinRelease Tests Legacy", Name = "StaleValue", ValueType = RegistryValueType.String, Action = RegistryEntryAction.RemoveValue },
                new RegistryEntry { Root = RegistryRoot.Hkcu, Key = "Software\\WinRelease Tests Legacy\\StaleKey", Name = "", ValueType = RegistryValueType.String, Action = RegistryEntryAction.RemoveKey, RemoveOnUninstall = true },
            ],
        };

        var compiler = new WixCompiler(new SystemProcessRunner());
        var result = compiler.Compile(manifest, _sourceRoot, _outputDirectory);

        Assert.True(result.Succeeded, $"wix build failed.\nSTDOUT:\n{result.StandardOutput}\nSTDERR:\n{result.StandardError}");
        Assert.NotNull(result.OutputMsiPath);
        Assert.True(File.Exists(result.OutputMsiPath));
    }

    /// <summary>Proves the real `wix build` accepts a declared file marked ReadOnly/Hidden - the WiX File attributes a real packaging tool (PACE Suite's own docs call this out) exposes that this manifest schema was missing entirely.</summary>
    [Fact]
    public void Compile_ProducesAnMsi_ForAReadOnlyHiddenFile()
    {
        File.WriteAllText(Path.Combine(_sourceRoot, "app.exe"), "fake exe payload");
        File.WriteAllText(Path.Combine(_sourceRoot, "config.ini"), "fake config payload");

        var manifest = new WinReleaseManifest
        {
            UpgradeCode = Guid.NewGuid(),
            Name = "WinRelease Test App",
            Manufacturer = "WinRelease Tests",
            DisplayVersion = "1.0.0",
            Files = new ManifestFiles
            {
                Declared =
                [
                    new DeclaredFile { Id = "MainExe", SourcePath = "app.exe", InstallPath = "app.exe" },
                    new DeclaredFile { Id = "Config", SourcePath = "config.ini", InstallPath = "config.ini", ReadOnly = true, Hidden = true },
                ],
            },
        };

        var compiler = new WixCompiler(new SystemProcessRunner());
        var result = compiler.Compile(manifest, _sourceRoot, _outputDirectory);

        Assert.True(result.Succeeded, $"wix build failed.\nSTDOUT:\n{result.StandardOutput}\nSTDERR:\n{result.StandardError}");
        Assert.NotNull(result.OutputMsiPath);
        Assert.True(File.Exists(result.OutputMsiPath));
    }

    /// <summary>Proves the real `wix build` accepts a mix of Environment Variable actions/scopes - the attribute names/legal values (Action: create/set/remove; Part: all/first/last; System/Permanent as plain yes/no) verified by hand against the CLI before this feature was built (ADR 0077).</summary>
    [Fact]
    public void Compile_ProducesAnMsi_ForMixedEnvironmentVariables()
    {
        File.WriteAllText(Path.Combine(_sourceRoot, "app.exe"), "fake exe payload");

        var manifest = new WinReleaseManifest
        {
            UpgradeCode = Guid.NewGuid(),
            Name = "WinRelease Test App",
            Manufacturer = "WinRelease Tests",
            DisplayVersion = "1.0.0",
            Files = new ManifestFiles
            {
                Declared = [new DeclaredFile { Id = "MainExe", SourcePath = "app.exe", InstallPath = "app.exe" }],
            },
            EnvironmentVariables =
            [
                new EnvironmentVariableEntry { Name = "ACME_HOME", Value = "[INSTALLFOLDER]", Action = EnvironmentVariableAction.Set, System = true },
                new EnvironmentVariableEntry { Name = "PATH", Value = "[INSTALLFOLDER]", Action = EnvironmentVariableAction.Set, Part = EnvironmentVariablePart.Last, System = true, Permanent = false },
                new EnvironmentVariableEntry { Name = "ACME_FIRST_RUN", Value = "1", Action = EnvironmentVariableAction.Create, System = false },
                new EnvironmentVariableEntry { Name = "ACME_LEGACY_HOME", Action = EnvironmentVariableAction.Remove, System = false },
            ],
        };

        var compiler = new WixCompiler(new SystemProcessRunner());
        var result = compiler.Compile(manifest, _sourceRoot, _outputDirectory);

        Assert.True(result.Succeeded, $"wix build failed.\nSTDOUT:\n{result.StandardOutput}\nSTDERR:\n{result.StandardError}");
        Assert.NotNull(result.OutputMsiPath);
        Assert.True(File.Exists(result.OutputMsiPath));
    }

    public void Dispose()
    {
        Directory.Delete(_sourceRoot, recursive: true);
        Directory.Delete(_outputDirectory, recursive: true);
    }
}
