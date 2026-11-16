using System.Diagnostics;
using System.Text;

namespace WinRelease.Core.Compilation;

/// <summary>
/// Arguments is a list, one element per argument - never a pre-joined
/// string. ProcessStartInfo.ArgumentList keeps each element intact
/// regardless of its content (e.g. a temp path with a space in it), unlike
/// naive string-splitting. <paramref name="Timeout"/> null means no limit
/// (unit-test fakes); real builds always pass one (<see cref="BuildLimits.WixTimeout"/>).
/// </summary>
public sealed record ProcessStartRequest(string FileName, IReadOnlyList<string> Arguments, string WorkingDirectory, TimeSpan? Timeout = null);

public sealed record ProcessResult(int ExitCode, string StandardOutput, string StandardError);

/// <summary>
/// Injectable seam over external process execution, so WixCompiler's unit
/// tests stay fast and don't depend on the wix CLI being resolvable in every
/// test environment. A separate, explicitly marked integration test exercises
/// the real implementation.
/// </summary>
public interface IProcessRunner
{
    ProcessResult Run(ProcessStartRequest request);
}

/// <summary>
/// Real IProcessRunner. Exercised by an explicitly marked integration test, not the unit suite.
/// Enforces the request's timeout by killing the whole process tree, and caps captured output so a
/// runaway child can't exhaust memory - both matter once the host is reachable by untrusted callers.
/// </summary>
public sealed class SystemProcessRunner : IProcessRunner
{
    /// <summary>Per-stream capture cap; anything past it is dropped (and noted) while the pipe keeps draining so the child never blocks on a full buffer.</summary>
    public const int MaxCapturedCharacters = 1_000_000;

    /// <summary>
    /// A bare tool name ("wix", "dotnet") is resolved against PATH only. Left to Windows, CreateProcess looks in the running program's own
    /// folder (and the working directory) first, so a planted <c>wix.exe</c> next to the Helper - in Downloads, say - would be run instead
    /// of the real one (ADR 0105). Not found stays the same "file not found" failure a missing tool always was.
    /// </summary>
    public static string ResolveExecutable(string fileName) =>
        ResolveExecutable(fileName, Environment.GetEnvironmentVariable("PATH"), Environment.GetEnvironmentVariable("DOTNET_CLI_HOME"),
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles));

    /// <summary>
    /// PATH first. A long-running Helper only has the PATH it was started with, so a tool installed afterwards (the usual order on a fresh PC: the
    /// Helper, then <c>dotnet tool install --global wix</c>) would never be found. The folders .NET itself puts those tools in are therefore tried
    /// next: the per-user global tools folder and Program Files\dotnet. They are fixed, well-known places, not the working directory or the
    /// program's own folder, so the planted-file protection above still holds.
    /// </summary>
    public static string ResolveExecutable(string fileName, string? searchPath, string? dotnetCliHome, string? userProfile, string? programFiles)
    {
        if (!OperatingSystem.IsWindows() || Path.IsPathRooted(fileName) || fileName.IndexOfAny(['/', '\\']) >= 0)
        {
            return fileName;
        }

        var name = Path.HasExtension(fileName) ? fileName : fileName + ".exe";
        var directories = (searchPath ?? "").Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(entry => entry.Trim('"'))
            .Where(Path.IsPathRooted) // a relative PATH entry means "wherever we happen to be running" - the thing this exists to avoid
            .Concat(DotnetToolDirectories(dotnetCliHome, userProfile, programFiles));

        foreach (var directory in directories)
        {
            var candidate = Path.Combine(directory, name);
            if (File.Exists(candidate))
            {
                return candidate;
            }
        }

        throw new System.ComponentModel.Win32Exception(2, $"'{fileName}' was not found on PATH.");
    }

    private static IEnumerable<string> DotnetToolDirectories(string? dotnetCliHome, string? userProfile, string? programFiles)
    {
        if (!string.IsNullOrEmpty(dotnetCliHome)) yield return Path.Combine(dotnetCliHome, ".dotnet", "tools");
        if (!string.IsNullOrEmpty(userProfile)) yield return Path.Combine(userProfile, ".dotnet", "tools");
        if (!string.IsNullOrEmpty(programFiles)) yield return Path.Combine(programFiles, "dotnet");
    }

    public ProcessResult Run(ProcessStartRequest request)
    {
        var startInfo = new ProcessStartInfo(ResolveExecutable(request.FileName))
        {
            WorkingDirectory = request.WorkingDirectory,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            // Without this, a console tool (wix, dotnet) started by a windowless host such as the tray Helper gets a brand new console window,
            // which flashes on screen for every build and setup check (ADR 0103). The output is captured anyway.
            CreateNoWindow = true,
        };

        foreach (var argument in request.Arguments)
        {
            startInfo.ArgumentList.Add(argument);
        }

        using var process = Process.Start(startInfo)
            ?? throw new InvalidOperationException($"Failed to start process '{request.FileName}'.");

        var standardOutput = DrainAsync(process.StandardOutput);
        var standardError = DrainAsync(process.StandardError);

        if (request.Timeout is { } timeout && !process.WaitForExit(timeout))
        {
            try
            {
                process.Kill(entireProcessTree: true);
            }
            catch (InvalidOperationException)
            {
                // Exited between the timeout and the kill - nothing left to stop.
            }

            process.WaitForExit();
            return new ProcessResult(
                -1,
                standardOutput.Result,
                standardError.Result + $"\nThe build was stopped after exceeding the {timeout.TotalSeconds:N0}-second time limit.");
        }

        process.WaitForExit();
        return new ProcessResult(process.ExitCode, standardOutput.Result, standardError.Result);
    }

    private static Task<string> DrainAsync(StreamReader reader) => Task.Run(() =>
    {
        var captured = new StringBuilder();
        var truncated = false;
        var buffer = new char[4096];
        int read;
        while ((read = reader.Read(buffer, 0, buffer.Length)) > 0)
        {
            var room = MaxCapturedCharacters - captured.Length;
            if (room > 0)
            {
                captured.Append(buffer, 0, Math.Min(read, room));
            }

            truncated |= read > room;
        }

        if (truncated)
        {
            captured.Append("\n[output truncated]");
        }

        return captured.ToString();
    });
}
