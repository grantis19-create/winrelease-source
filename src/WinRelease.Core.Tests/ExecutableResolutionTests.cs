using WinRelease.Core.Compilation;
using Xunit;

namespace WinRelease.Core.Tests;

/// <summary>ADR 0105: a bare tool name is looked up on PATH only, never in the program's own folder or the working directory.</summary>
public sealed class ExecutableResolutionTests
{
    [Fact]
    public void AToolOnPath_IsResolvedToItsFullPath()
    {
        if (!OperatingSystem.IsWindows()) return;

        var resolved = SystemProcessRunner.ResolveExecutable("cmd");

        Assert.True(Path.IsPathRooted(resolved));
        Assert.EndsWith("cmd.exe", resolved, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void AToolThatIsOnlyInTheWorkingDirectory_IsNotFound()
    {
        if (!OperatingSystem.IsWindows()) return;

        var planted = Path.Combine(Environment.CurrentDirectory, "winrelease-planted-tool.exe");
        File.WriteAllText(planted, "not a real program");
        try
        {
            Assert.Throws<System.ComponentModel.Win32Exception>(() => SystemProcessRunner.ResolveExecutable("winrelease-planted-tool"));
        }
        finally
        {
            File.Delete(planted);
        }
    }

    [Theory]
    [InlineData(@"C:\Tools\wix.exe")]
    [InlineData(@"tools\wix.exe")]
    [InlineData("./wix")]
    public void APathIsLeftAlone(string path) => Assert.Equal(path, SystemProcessRunner.ResolveExecutable(path));

    // A tool installed after the Helper started (dotnet tool install --global wix) is not on the Helper's PATH snapshot, but .NET puts it in a fixed folder.
    [Fact]
    public void AToolInTheDotnetGlobalToolsFolder_IsFoundEvenWhenPathDoesNotListIt()
    {
        if (!OperatingSystem.IsWindows()) return;
        var home = Directory.CreateTempSubdirectory("winrelease-home-").FullName;
        try
        {
            var tools = Directory.CreateDirectory(Path.Combine(home, ".dotnet", "tools")).FullName;
            File.WriteAllText(Path.Combine(tools, "faketool.exe"), "x");

            var resolved = SystemProcessRunner.ResolveExecutable("faketool", searchPath: @"C:\Windows", dotnetCliHome: null, userProfile: home, programFiles: null);

            Assert.Equal(Path.Combine(tools, "faketool.exe"), resolved);
        }
        finally
        {
            Directory.Delete(home, recursive: true);
        }
    }

    [Fact]
    public void PathWinsOverTheDotnetFolders_AndTheDotnetInstallFolderIsTriedToo()
    {
        if (!OperatingSystem.IsWindows()) return;
        var root = Directory.CreateTempSubdirectory("winrelease-resolve-").FullName;
        try
        {
            var onPath = Directory.CreateDirectory(Path.Combine(root, "path")).FullName;
            var home = Directory.CreateDirectory(Path.Combine(root, "home", ".dotnet", "tools")).FullName;
            var programFilesDotnet = Directory.CreateDirectory(Path.Combine(root, "pf", "dotnet")).FullName;
            File.WriteAllText(Path.Combine(onPath, "t.exe"), "x");
            File.WriteAllText(Path.Combine(home, "t.exe"), "x");
            File.WriteAllText(Path.Combine(programFilesDotnet, "only-here.exe"), "x");

            Assert.Equal(Path.Combine(onPath, "t.exe"), SystemProcessRunner.ResolveExecutable("t", onPath, null, Path.Combine(root, "home"), Path.Combine(root, "pf")));
            Assert.Equal(Path.Combine(programFilesDotnet, "only-here.exe"), SystemProcessRunner.ResolveExecutable("only-here", onPath, null, Path.Combine(root, "home"), Path.Combine(root, "pf")));
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public void ARelativePathEntryOrAPlantedFileNextToTheHelperIsStillNotUsed()
    {
        if (!OperatingSystem.IsWindows()) return;

        Assert.Throws<System.ComponentModel.Win32Exception>(() =>
            SystemProcessRunner.ResolveExecutable("winrelease-definitely-missing", searchPath: @"tools;.", dotnetCliHome: null, userProfile: Path.GetTempPath(), programFiles: null));
    }
}
