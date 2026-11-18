using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Runtime.Versioning;
using Microsoft.Win32;

namespace WinRelease.Helper;

/// <summary>
/// The Helper's windowless presence (ADR 0102): a notification-area (tray) icon with a small menu, a single-instance guard, the
/// <c>winrelease-helper:</c> link type that lets the website start it, and a per-user "start with Windows" switch. Plain Win32 through
/// P/Invoke, not WinForms, so the project stays a portable net10.0 build that the test project can reference.
/// </summary>
[SupportedOSPlatform("windows")]
public sealed class HelperTray : IDisposable
{
    public const string LinkScheme = "winrelease-helper";
    private const string RunKeyPath = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string RunValueName = "WinReleaseHelper";

    private const uint WM_DESTROY = 0x0002;
    private const uint WM_COMMAND = 0x0111;
    private const uint WM_LBUTTONUP = 0x0202;
    private const uint WM_RBUTTONUP = 0x0205;
    private const uint WM_APP_TRAY = 0x8001;
    private const uint NIM_ADD = 0, NIM_DELETE = 2;
    private const uint NIF_MESSAGE = 1, NIF_ICON = 2, NIF_TIP = 4;
    private const int IdStatus = 1, IdOpenSite = 2, IdOpenLog = 3, IdAutoStart = 4, IdQuit = 5, IdUninstall = 6, IdNotices = 7;

    /// <summary>The licences and notices of the other people's software inside the Helper. Opened in the user's browser, like "Open WinRelease"; the Helper itself makes no request.</summary>
    internal const string NoticesUrl = "https://github.com/grantis19-create/winrelease-source/blob/main/THIRD-PARTY-NOTICES.md";

    private readonly string _siteUrl;
    private readonly string _logPath;
    private readonly string _tooltip;
    private readonly Action _quit;
    private readonly Action<string>? _log;
    private readonly Thread _thread;
    private readonly WndProc _wndProc;
    private IntPtr _hwnd;
    private IntPtr _icon;
    private uint _taskbarCreated;

    public HelperTray(string siteUrl, string logPath, string version, Action quit, Action<string>? log = null)
    {
        _log = log;
        _siteUrl = siteUrl;
        _logPath = logPath;
        _tooltip = $"WinRelease Helper v{version}";
        _quit = quit;
        _wndProc = WindowProc;
        _thread = new Thread(Run) { IsBackground = true, Name = "WinRelease tray" };
        _thread.SetApartmentState(ApartmentState.STA);
    }

    public void Start() => _thread.Start();

    public void Dispose()
    {
        if (_hwnd != IntPtr.Zero) PostMessage(_hwnd, WM_DESTROY, IntPtr.Zero, IntPtr.Zero);
    }

    /// <summary>A modal message for the few cases where a windowless program must still tell the person something (themed like the site, ADR 0115).</summary>
    public static void Notify(string message) => HelperDialog.Notify(message);

    /// <summary>A Yes/No question; true for Yes.</summary>
    public static bool Ask(string question) => HelperDialog.Ask(question);

    /// <summary>True when this process is the only Helper tray instance (holds the named mutex for its lifetime).</summary>
    public static bool TryBecomeTheOnlyInstance(out Mutex? mutex)
    {
        mutex = new Mutex(initiallyOwned: true, @"Local\WinRelease.Helper.SingleInstance", out var createdNew);
        if (!createdNew)
        {
            mutex.Dispose();
            mutex = null;
        }

        return createdNew;
    }

    /// <summary>Registers (or refreshes) <c>winrelease-helper:</c> for the current user, pointing at this exe. No administrator rights needed.</summary>
    public static void RegisterLinkScheme(string exePath)
    {
        using var scheme = Registry.CurrentUser.CreateSubKey($@"Software\Classes\{LinkScheme}");
        scheme.SetValue("", "URL:WinRelease Helper");
        scheme.SetValue("URL Protocol", "");
        using var command = scheme.CreateSubKey(@"shell\open\command");
        command.SetValue("", $"\"{exePath}\" \"%1\"");
    }

    public static bool IsAutoStartEnabled()
    {
        using var key = Registry.CurrentUser.OpenSubKey(RunKeyPath);
        return key?.GetValue(RunValueName) is string;
    }

    public static void SetAutoStart(bool enabled, string exePath)
    {
        using var key = Registry.CurrentUser.CreateSubKey(RunKeyPath);
        if (enabled) key.SetValue(RunValueName, $"\"{exePath}\"");
        else key.DeleteValue(RunValueName, throwOnMissingValue: false);
    }

    private void Run()
    {
        var exePath = Environment.ProcessPath ?? "";
        _taskbarCreated = RegisterWindowMessage("TaskbarCreated");
        _icon = ExtractIcon(IntPtr.Zero, exePath, 0);

        var windowClass = new WNDCLASSEX
        {
            cbSize = (uint)Marshal.SizeOf<WNDCLASSEX>(),
            lpfnWndProc = Marshal.GetFunctionPointerForDelegate(_wndProc),
            hInstance = GetModuleHandle(null),
            lpszClassName = "WinReleaseHelperTray",
        };
        RegisterClassEx(ref windowClass);
        _hwnd = CreateWindowEx(0, windowClass.lpszClassName, "WinRelease Helper", 0, 0, 0, 0, 0, new IntPtr(-3) /* HWND_MESSAGE */, IntPtr.Zero, windowClass.hInstance, IntPtr.Zero);

        AddIcon();

        while (GetMessage(out var message, IntPtr.Zero, 0, 0) > 0)
        {
            TranslateMessage(ref message);
            DispatchMessage(ref message);
        }

        if (_icon != IntPtr.Zero) DestroyIcon(_icon);
    }

    private void AddIcon()
    {
        var data = NewIconData();
        data.uFlags = NIF_MESSAGE | NIF_ICON | NIF_TIP;
        data.uCallbackMessage = WM_APP_TRAY;
        data.hIcon = _icon;
        data.szTip = _tooltip;
        var added = ShellNotifyIcon(NIM_ADD, ref data);
        _log?.Invoke(added ? "Tray icon added to the notification area." : "The tray icon could not be added (Windows refused Shell_NotifyIcon).");
    }

    private void RemoveIcon()
    {
        var data = NewIconData();
        ShellNotifyIcon(NIM_DELETE, ref data);
    }

    private NOTIFYICONDATA NewIconData() => new() { cbSize = (uint)Marshal.SizeOf<NOTIFYICONDATA>(), hWnd = _hwnd, uID = 1, szTip = "", szInfo = "", szInfoTitle = "" };

    private IntPtr WindowProc(IntPtr hwnd, uint message, IntPtr wParam, IntPtr lParam)
    {
        if (message == _taskbarCreated && message != 0)
        {
            AddIcon(); // Explorer restarted: the icon has to be added again.
            return IntPtr.Zero;
        }

        switch (message)
        {
            case WM_APP_TRAY:
                var mouse = (uint)lParam.ToInt64();
                if (mouse is WM_RBUTTONUP or WM_LBUTTONUP) ShowMenu();
                return IntPtr.Zero;
            case WM_COMMAND:
                OnCommand((int)(wParam.ToInt64() & 0xFFFF));
                return IntPtr.Zero;
            case WM_DESTROY:
                RemoveIcon();
                PostQuitMessage(0);
                return IntPtr.Zero;
        }

        return DefWindowProc(hwnd, message, wParam, lParam);
    }

    private void ShowMenu()
    {
        var menu = CreatePopupMenu();
        AppendMenu(menu, 0x1 /* MF_GRAYED */, IdStatus, _tooltip + " - running");
        AppendMenu(menu, 0x800 /* MF_SEPARATOR */, 0, null);
        AppendMenu(menu, 0, IdOpenSite, "Open WinRelease");
        AppendMenu(menu, 0, IdOpenLog, "Open log file");
        AppendMenu(menu, 0, IdNotices, "Third-party notices");
        AppendMenu(menu, IsAutoStartEnabled() ? 0x8u /* MF_CHECKED */ : 0u, IdAutoStart, "Start with Windows");
        AppendMenu(menu, 0x800, 0, null);
        AppendMenu(menu, 0, IdUninstall, "Uninstall...");
        AppendMenu(menu, 0, IdQuit, "Quit");

        GetCursorPos(out var point);
        SetForegroundWindow(_hwnd); // required, or the menu does not close when you click elsewhere
        // TPM_RIGHTBUTTON | TPM_BOTTOMALIGN (opens upward from the taskbar); the choice arrives as WM_COMMAND.
        TrackPopupMenu(menu, 0x2 | 0x20, point.x, point.y, 0, _hwnd, IntPtr.Zero);
        PostMessage(_hwnd, 0, IntPtr.Zero, IntPtr.Zero);
        DestroyMenu(menu);
    }

    private void OnCommand(int id)
    {
        switch (id)
        {
            case IdOpenSite:
                Open(_siteUrl);
                break;
            case IdOpenLog:
                Open(_logPath);
                break;
            case IdNotices:
                Open(NoticesUrl);
                break;
            case IdAutoStart:
                SetAutoStart(!IsAutoStartEnabled(), Environment.ProcessPath ?? "");
                break;
            case IdUninstall:
                if (HelperInstall.Uninstall(askFirst: true))
                {
                    Notify("WinRelease Helper has been removed. To use it again, download it from the website's Settings page.");
                    _quit();
                }

                break;
            case IdQuit:
                _quit();
                break;
        }
    }

    private static void Open(string target)
    {
        try
        {
            Process.Start(new ProcessStartInfo(target) { UseShellExecute = true });
        }
        catch
        {
            // Nothing sensible to do from a tray click if the shell refuses.
        }
    }

    private delegate IntPtr WndProc(IntPtr hwnd, uint message, IntPtr wParam, IntPtr lParam);

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct WNDCLASSEX
    {
        public uint cbSize;
        public uint style;
        public IntPtr lpfnWndProc;
        public int cbClsExtra;
        public int cbWndExtra;
        public IntPtr hInstance;
        public IntPtr hIcon;
        public IntPtr hCursor;
        public IntPtr hbrBackground;
        public string? lpszMenuName;
        public string lpszClassName;
        public IntPtr hIconSm;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct NOTIFYICONDATA
    {
        public uint cbSize;
        public IntPtr hWnd;
        public uint uID;
        public uint uFlags;
        public uint uCallbackMessage;
        public IntPtr hIcon;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string szTip;
        public uint dwState;
        public uint dwStateMask;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)] public string szInfo;
        public uint uTimeoutOrVersion;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 64)] public string szInfoTitle;
        public uint dwInfoFlags;
        public Guid guidItem;
        public IntPtr hBalloonIcon;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct POINT { public int x; public int y; }

    [StructLayout(LayoutKind.Sequential)]
    private struct MSG
    {
        public IntPtr hwnd;
        public uint message;
        public IntPtr wParam;
        public IntPtr lParam;
        public uint time;
        public POINT pt;
    }

    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern ushort RegisterClassEx(ref WNDCLASSEX windowClass);
    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern IntPtr CreateWindowEx(int exStyle, string className, string windowName, int style, int x, int y, int width, int height, IntPtr parent, IntPtr menu, IntPtr instance, IntPtr param);
    [DllImport("user32.dll")] private static extern IntPtr DefWindowProc(IntPtr hwnd, uint message, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")] private static extern int GetMessage(out MSG message, IntPtr hwnd, uint min, uint max);
    [DllImport("user32.dll")] private static extern bool TranslateMessage(ref MSG message);
    [DllImport("user32.dll")] private static extern IntPtr DispatchMessage(ref MSG message);
    [DllImport("user32.dll")] private static extern void PostQuitMessage(int exitCode);
    [DllImport("user32.dll")] private static extern bool PostMessage(IntPtr hwnd, uint message, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern uint RegisterWindowMessage(string name);
    [DllImport("user32.dll")] private static extern IntPtr CreatePopupMenu();
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern bool AppendMenu(IntPtr menu, uint flags, nuint id, string? text);
    [DllImport("user32.dll")] private static extern bool TrackPopupMenu(IntPtr menu, uint flags, int x, int y, int reserved, IntPtr hwnd, IntPtr rect);
    [DllImport("user32.dll")] private static extern bool DestroyMenu(IntPtr menu);
    [DllImport("user32.dll")] private static extern bool GetCursorPos(out POINT point);
    [DllImport("user32.dll")] private static extern bool SetForegroundWindow(IntPtr hwnd);
    [DllImport("user32.dll")] private static extern bool DestroyIcon(IntPtr icon);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int MessageBox(IntPtr hwnd, string text, string caption, uint type);
    [DllImport("shell32.dll", CharSet = CharSet.Unicode, EntryPoint = "Shell_NotifyIconW")] private static extern bool ShellNotifyIcon(uint message, ref NOTIFYICONDATA data);
    [DllImport("shell32.dll", CharSet = CharSet.Unicode)] private static extern IntPtr ExtractIcon(IntPtr instance, string file, int index);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] private static extern IntPtr GetModuleHandle(string? moduleName);
}
