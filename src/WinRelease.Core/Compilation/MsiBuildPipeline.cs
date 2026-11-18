using WinRelease.Core.Manifest;

namespace WinRelease.Core.Compilation;

public sealed record MsiBuildOutcome(bool Succeeded, string StandardOutput, string StandardError, byte[]? MsiBytes, string? FileName, Guid? ProductCode = null);

/// <summary>
/// The shared "sources zip + manifest -> .msi bytes" step: extracts the zip into a throwaway working
/// directory, runs <see cref="WixCompiler"/>, reads the result back, and always deletes the working
/// directory. Used by both WinRelease.BuildWorker (the cloud split, ADR 0026) and WinRelease.Local
/// (the single-process MVP host) so the two can't drift apart.
/// </summary>
public static class MsiBuildPipeline
{
    public static async Task<MsiBuildOutcome> RunAsync(
        WinReleaseManifest manifest,
        Stream sourcesZip,
        IProcessRunner processRunner,
        CancellationToken cancellationToken = default,
        BuildLimits? limits = null)
    {
        limits ??= BuildLimits.Default;
        if (MinimumRequirements.HasNothingToInstall(manifest))
        {
            // ADR 0122: wix would happily build an MSI with no components; say so before any work is done.
            return new MsiBuildOutcome(false, "", MinimumRequirements.NothingToInstallMessage, null, null);
        }

        var workDir = Directory.CreateTempSubdirectory("winrelease-build-").FullName;
        var sourcesDir = Path.Combine(workDir, "sources");
        var outputDir = Path.Combine(workDir, "output");
        Directory.CreateDirectory(sourcesDir);

        try
        {
            var zipPath = Path.Combine(workDir, "sources.zip");
            await using (var zipFile = File.Create(zipPath))
            {
                await sourcesZip.CopyToAsync(zipFile, cancellationToken);
            }

            // Bounded extraction (entry count, per-file and total bytes - zip-bomb defense) that also
            // rejects entries resolving outside sourcesDir (zip-slip).
            SafeZipExtractor.Extract(zipPath, sourcesDir, limits);

            if (FindTooLongInstallPaths(manifest, sourcesDir) is { } pathProblem)
            {
                return new MsiBuildOutcome(false, "", pathProblem, null, null);
            }

            var missing = FindMissingSources(manifest, sourcesDir);
            if (missing.Count > 0)
            {
                // Caught before ever invoking wix, not after: left to WixCompiler, a missing source
                // file surfaces as a raw LGHT0103-style "cannot find file" pointing at this process's
                // own throwaway temp path - true, but useless to the person who needs to know which of
                // *their* declared files or harvest folders it was and what the manifest expected it to
                // be named. Same StandardError/StandardOutput shape a wix failure already uses (ADR
                // 0026), so the Console's existing "Transparent Error Pass-Through" display needs no
                // changes to show this.
                var message = "The following source file(s)/folder(s) referenced by this project were not found in the uploaded sources:\n"
                    + string.Join('\n', missing.Select(m => $"  - {m}"))
                    + "\nRe-add them, then try again.";
                return new MsiBuildOutcome(false, "", message, null, null);
            }

            if (FindInvalidIcons(manifest, sourcesDir) is { Count: > 0 } badIcons)
            {
                // ADR 0112: wix builds a file that is not an icon without a word, leaving an MSI with a blank icon.
                var iconMessage = "These icon files are not usable:\n" + string.Join('\n', badIcons.Select(m => $"  - {m}"))
                    + "\nChoose an .ico file, or a program (.exe/.dll) that has an icon inside, then try again.";
                return new MsiBuildOutcome(false, "", iconMessage, null, null);
            }

            var result = new WixCompiler(processRunner).Compile(manifest, sourcesDir, outputDir, limits);
            if (!result.Succeeded)
            {
                return new MsiBuildOutcome(false, result.StandardOutput, result.StandardError, null, null);
            }

            var msiBytes = await File.ReadAllBytesAsync(result.OutputMsiPath!, cancellationToken);
            // Advisory notes ride at the top of the build log: the build succeeded, the author just gets told what to double-check.
            var notes = ManifestAdvisories.For(manifest);
            var log = notes.Count == 0
                ? result.StandardOutput
                : string.Join(Environment.NewLine, notes.Select(n => "WinRelease note: " + n)) + Environment.NewLine + result.StandardOutput;
            return new MsiBuildOutcome(true, log, result.StandardError, msiBytes, Path.GetFileName(result.OutputMsiPath!), result.ProductCode);
        }
        catch (BuildInputException ex)
        {
            // A limit breach or an unusable zip is the caller's input, reported in the same
            // StandardError shape as a wix failure so the Console's existing error display shows it.
            return new MsiBuildOutcome(false, "", ex.Message, null, null);
        }
        finally
        {
            Directory.Delete(workDir, recursive: true);
        }
    }

    /// <summary>The shortcut and Add/Remove Programs icons that exist but are not icons (a missing one is reported by <see cref="FindMissingSources"/>).</summary>
    private static List<string> FindInvalidIcons(WinReleaseManifest manifest, string sourcesDir)
    {
        var problems = new List<string>();
        var icons = manifest.Shortcuts.Select(s => (Path: s.IconPath, Label: $"icon of shortcut '{s.Name}'"))
            .Append((manifest.AppInfo.AutoExtractIcon ? null : manifest.AppInfo.IconPath, "Add/Remove Programs icon"));
        foreach (var (iconPath, label) in icons)
        {
            if (!string.IsNullOrEmpty(iconPath) && SourcePathRules.ResolveContained(sourcesDir, iconPath) is { } full && File.Exists(full) && IconFiles.Problem(full) is { } problem)
            {
                problems.Add($"{iconPath} ({label}) {problem}");
            }
        }

        return problems;
    }

    /// <summary>
    /// Harvested files aren't known until the zip is extracted, so their install path length is checked here: Windows
    /// Installer cannot write a path of 260+ characters (it fails with error 1603 mid-install), whatever the OS long-path setting.
    /// </summary>
    private static string? FindTooLongInstallPaths(WinReleaseManifest manifest, string sourcesDir)
    {
        var tooLong = new List<string>();
        foreach (var harvest in manifest.Files.Harvest)
        {
            if (SourcePathRules.ResolveContained(sourcesDir, harvest.SourceFolder) is not { } harvestRoot || !Directory.Exists(harvestRoot))
            {
                continue;
            }

            foreach (var file in Directory.EnumerateFiles(harvestRoot, "*", SearchOption.AllDirectories))
            {
                var estimate = InstallPathLength.Estimate(manifest, harvest.Root, Path.Combine(harvest.InstallPath, Path.GetRelativePath(harvestRoot, file)));
                if (InstallPathLength.IsTooLong(estimate))
                {
                    tooLong.Add($"{estimate.Length} characters: {estimate}");
                }
            }
        }

        return tooLong.Count == 0
            ? null
            : $"{tooLong.Count} harvested file(s) would install to a path over {InstallPathLength.Max} characters, which Windows Installer cannot write. For example, {tooLong[0]}\nShorten the folder names, the harvest's install path, or the target directory, then try again.";
    }

    /// <summary>
    /// Every DeclaredFile.SourcePath and HarvestFolder.SourceFolder the manifest names, checked
    /// against what the sources zip actually extracted to - the same resolution WxsGenerator itself
    /// uses (Path.Combine(sourceRoot, ...)), so "found here" and "wix will look here" never disagree.
    /// Each entry names both the manifest id and the expected relative path, since either on its own
    /// can be ambiguous (a reused filename across declared files; a path alone doesn't say which
    /// declaration it belongs to).
    /// </summary>
    private static List<string> FindMissingSources(WinReleaseManifest manifest, string sourcesDir)
    {
        var missing = new List<string>();

        foreach (var file in manifest.Files.Declared)
        {
            if (SourcePathRules.ResolveContained(sourcesDir, file.SourcePath) is not { } full || !File.Exists(full))
            {
                missing.Add($"{file.SourcePath} (declared file '{file.Id}')");
            }
        }

        foreach (var harvest in manifest.Files.Harvest)
        {
            if (SourcePathRules.ResolveContained(sourcesDir, harvest.SourceFolder) is not { } full || !Directory.Exists(full))
            {
                missing.Add($"{harvest.SourceFolder} (harvest folder)");
            }
        }

        // Icons are read from the sources too (shortcut icons, the Add/Remove Programs icon); left to wix a missing one
        // surfaces as a raw WIX0103 pointing at this process's temp folder (found by UAT T5).
        var icons = manifest.Shortcuts.Select(s => (Path: s.IconPath, Label: $"icon of shortcut '{s.Name}'"))
            .Append((manifest.AppInfo.AutoExtractIcon ? null : manifest.AppInfo.IconPath, "Add/Remove Programs icon"));
        foreach (var (iconPath, label) in icons)
        {
            if (!string.IsNullOrEmpty(iconPath) && (SourcePathRules.ResolveContained(sourcesDir, iconPath) is not { } full || !File.Exists(full)))
            {
                missing.Add($"{iconPath} ({label})");
            }
        }

        return missing;
    }
}
