using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Runtime.Versioning;
using Microsoft.Win32;

namespace WinRelease.Helper;

/// <summary>
/// ADR 0110: the Helper keeps one permanent home per user, <c>%LOCALAPPDATA%\Programs\WinRelease Helper\WinRelease.Helper.exe</c>, instead of
/// running from wherever the browser saved it. A downloaded copy installs itself there (no administrator rights) and starts the installed one;
/// a newer download replaces it in place. Because the path never changes, Windows keeps the tray icon's "show on taskbar" choice, and Start
/// with Windows, the website's Start button and the Apps &amp; features entry all keep pointing at the right file across updates.
/// </summary>
[SupportedOSPlatform("windows")]
public static class HelperInstall
{
    public const string ExeName = "WinRelease.Helper.exe";
    private const string UninstallKeyPath = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\WinReleaseHelper";

    public static string InstallFolder { get; } =
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "WinRelease Helper");

    public static string InstalledExePath { get; } = Path.Combine(InstallFolder, ExeName);

    /// <summary>The folder the log lives in. Uninstall removes the log; the folder itself only when nothing else is in it.</summary>
    public static string DataFolder { get; } = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "WinRelease");

    public static bool IsInstalledCopy(string? exePath) =>
        exePath is not null && string.Equals(Path.GetFullPath(exePath), Path.GetFullPath(InstalledExePath), StringComparison.OrdinalIgnoreCase);

    /// <summary>
    /// What a copy running from outside the install folder does: replace the installed copy when that is missing or older, otherwise leave it
    /// alone (never downgrade) and just start it.
    /// </summary>
    public static bool ShouldReplaceInstalled(string? installedVersion, string myVersion) =>
        installedVersion is null || HelperStartup.ShouldYieldTo(installedVersion, myVersion);

    /// <summary>
    /// Run from outside the install folder: install (or update) the permanent copy and start it. True when the installed copy was started and
    /// this process should exit; false when installing failed (a locked file, a disk or policy problem) and this copy should simply run as it is.
    /// </summary>
    public static async Task<bool> InstallAndStartAsync(string[] args, string myVersion, bool launchedFromLink)
    {
        try
        {
            var self = Environment.ProcessPath;
            if (self is null || !self.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)) return false;

            var installedVersion = File.Exists(InstalledExePath) ? FileVersionInfo.GetVersionInfo(InstalledExePath).FileVersion : null;
            var replaced = false;
            if (ShouldReplaceInstalled(installedVersion, myVersion))
            {
                // An older Helper may be running (the installed copy, or one from Downloads): it agrees to quit only for a newer version.
                using (var client = new HttpClient { Timeout = TimeSpan.FromSeconds(2) })
                {
                    await HelperStartup.AskOlderHelperToQuitAsync(client, "http://127.0.0.1:5601", "X-WinRelease-Helper", myVersion);
                }

                if (!await CopyIntoPlaceAsync(self)) return false;
                replaced = true;
            }

            var startArgs = args.ToList();
            // Only a person who double-clicked a download is told where it went; the website's Start button stays silent.
            if (replaced && !launchedFromLink) startArgs.Add(HelperStartup.InstalledFromArgument + self);
            var start = new ProcessStartInfo(InstalledExePath) { UseShellExecute = false, WorkingDirectory = InstallFolder };
            foreach (var arg in startArgs) start.ArgumentList.Add(arg);
            Process.Start(start);
            return true;
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or System.ComponentModel.Win32Exception)
        {
            return false;
        }
    }

    private static async Task<bool> CopyIntoPlaceAsync(string self)
    {
        Directory.CreateDirectory(InstallFolder);
        var staged = InstalledExePath + ".new";
        File.Copy(self, staged, overwrite: true);
        // The copy is this same, already-run program; like any installed program it does not carry the browser's "downloaded" mark, which would
        // otherwise make Windows ask again on every start.
        DeleteFile(staged + ":Zone.Identifier");

        // The old installed copy may still be shutting down; its file is locked until it has.
        for (var attempt = 0; attempt < 40; attempt++)
        {
            try
            {
                File.Move(staged, InstalledExePath, overwrite: true);
                return true;
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                await Task.Delay(250);
            }
        }

        File.Delete(staged);
        return false;
    }

    /// <summary>
    /// Every start: point the website's Start button and (when it is on) Start with Windows at this exe, and keep the Apps &amp; features entry
    /// current when this is the installed copy. Before this, Start with Windows kept pointing at whichever file had turned it on.
    /// </summary>
    public static void RefreshRegistration(string exePath, string version)
    {
        HelperTray.RegisterLinkScheme(exePath);
        if (HelperTray.IsAutoStartEnabled()) HelperTray.SetAutoStart(true, exePath);
        if (!IsInstalledCopy(exePath)) return;

        using var key = Registry.CurrentUser.CreateSubKey(UninstallKeyPath);
        key.SetValue("DisplayName", "WinRelease Helper");
        key.SetValue("DisplayVersion", version);
        key.SetValue("Publisher", "GE App Solutions");
        key.SetValue("DisplayIcon", exePath);
        key.SetValue("InstallLocation", InstallFolder);
        key.SetValue("UninstallString", $"\"{exePath}\" --uninstall");
        key.SetValue("QuietUninstallString", $"\"{exePath}\" --uninstall --quiet");
        key.SetValue("URLInfoAbout", "https://winrelease.geappsolutions.com");
        key.SetValue("NoModify", 1, RegistryValueKind.DWord);
        key.SetValue("NoRepair", 1, RegistryValueKind.DWord);
        key.SetValue("EstimatedSize", (int)(new FileInfo(exePath).Length / 1024), RegistryValueKind.DWord);
    }

    /// <summary>
    /// Removes the Helper for this user: stops any other running copy, removes Start with Windows, the website's Start-button link and the
    /// Apps &amp; features entry, then deletes the install folder and the log once this process has exited. Projects are not touched (they live
    /// in the browser). False when the person said No.
    /// </summary>
    public static bool Uninstall(bool askFirst)
    {
        if (askFirst && HelperTray.Ask(
                "Remove WinRelease Helper from this PC?\n\nThis stops it and removes the program, its Start with Windows setting and its log. " +
                "Your projects are kept: they are saved in your browser.") is false)
        {
            return false;
        }

        foreach (var process in Process.GetProcesses().Where(p => p.ProcessName.StartsWith("WinRelease.Helper", StringComparison.OrdinalIgnoreCase)))
        {
            using (process)
            {
                if (process.Id == Environment.ProcessId) continue;
                try
                {
                    process.Kill();
                    process.WaitForExit(5000);
                }
                catch (Exception ex) when (ex is InvalidOperationException or System.ComponentModel.Win32Exception)
                {
                    // Already gone, or not ours to stop.
                }
            }
        }

        HelperTray.SetAutoStart(false, "");
        Registry.CurrentUser.DeleteSubKeyTree($@"Software\Classes\{HelperTray.LinkScheme}", throwOnMissingSubKey: false);
        Registry.CurrentUser.DeleteSubKeyTree(UninstallKeyPath, throwOnMissingSubKey: false);

        // This exe may be the installed one, which cannot delete itself while it runs: a hidden cmd waits a moment, then removes the folder.
        // "rd" without /s leaves the data folder alone if anything other than the log is in it.
        var log = Path.Combine(DataFolder, "helper.log");
        var cleanup = new ProcessStartInfo("cmd.exe")
        {
            Arguments = $"/d /c ping 127.0.0.1 -n 3 >nul & rd /s /q \"{InstallFolder}\" & del /q \"{log}\" & rd \"{DataFolder}\"",
            CreateNoWindow = true,
            UseShellExecute = false,
            WorkingDirectory = Path.GetTempPath(),
        };
        Process.Start(cleanup)?.Dispose();
        return true;
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, EntryPoint = "DeleteFileW")]
    private static extern bool DeleteFile(string path);
}
