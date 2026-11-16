using System.Runtime.InteropServices;

namespace WinRelease.Helper;

/// <summary>
/// ADR 0115: the Helper's few popups (already running, removed, port taken, a refusal) drawn in the website's dark theme with its orange accent, so
/// a person who sees one recognises it as WinRelease. Plain Win32 (no WinForms, which would add many megabytes to the single-file exe): one window,
/// painted by hand, with a message loop of its own so it works from any thread, exactly where <c>MessageBox</c> was used. If anything about it fails
/// the plain Windows message box is used instead, so a message is never lost.
/// </summary>
public static class HelperDialog
{
    // The site's tokens (web/packaging-console/src/index.css), as Windows COLORREF (0x00BBGGRR).
    private const uint Canvas = 0x000F0C0B;      // #0b0c0f
    private const uint Panel = 0x001D1716;       // #16171d
    private const uint PanelAlt = 0x00261E1C;    // #1c1e26
    private const uint Subtle = 0x00362C2A;      // #2a2c36
    private const uint Ink = 0x00EBE7E5;         // #e5e7eb
    private const uint Muted = 0x00988D8B;       // #8b8d98
    private const uint Brand = 0x001673F9;       // #f97316
    private const uint BrandHover = 0x003C92FB;  // #fb923c

    private const string Caption = "WinRelease Helper";
    private const string ClassName = "WinReleaseHelperDialog";

    /// <summary>An information message with one OK button.</summary>
    public static void Notify(string message)
    {
        try { Show(message, yesNo: false, previewPath: null); }
        catch (Exception ex) when (ex is DllNotFoundException or EntryPointNotFoundException or InvalidOperationException or ArgumentException or MarshalDirectiveException)
        {
            MessageBox(IntPtr.Zero, message, Caption, 0x40);
        }
    }

    /// <summary>A Yes/No question; true for Yes. No is the default.</summary>
    public static bool Ask(string question)
    {
        try { return Show(question, yesNo: true, previewPath: null); }
        catch (Exception ex) when (ex is DllNotFoundException or EntryPointNotFoundException or InvalidOperationException or ArgumentException or MarshalDirectiveException)
        {
            return MessageBox(IntPtr.Zero, question, Caption, 0x4 | 0x20 | 0x100) == 6;
        }
    }

    /// <summary>Draws the dialog and saves what it looks like as a .bmp, then closes it (used by tests and to check the design; shows nothing lasting).</summary>
    public static void RenderPreview(string message, bool yesNo, string bmpPath, string? iconSource = null) => Show(message, yesNo, bmpPath, iconSource);

    // One dialog at a time per thread; the window procedure runs on the thread that created the window.
    [ThreadStatic] private static State? _state;
    private static readonly WndProc WindowProcedure = WndProcImpl;
    private static bool _classRegistered;

    private sealed class State
    {
        public string Message = "";
        public string? IconSource;
        public bool YesNo;
        public double Scale = 1;
        public int ClientWidth, ClientHeight, Padding, IconSize, MessageTop, MessageHeight;
        public IntPtr TitleFont, BodyFont, ButtonFont, Icon;
        public readonly List<(string Text, bool Result, RECT Bounds)> Buttons = [];
        public int Focused;   // index into Buttons: the default, drawn in orange
        public int Hover = -1;
        public int Pressed = -1;
        public bool Result;
        public bool Done;
    }

    private static bool Show(string message, bool yesNo, string? previewPath, string? iconSource = null)
    {
        var previous = SetThreadDpiAwarenessContext(new IntPtr(-4)); // per-monitor v2: crisp text on high-DPI screens instead of a stretched bitmap
        var state = new State { Message = message, YesNo = yesNo, IconSource = iconSource };
        _state = state;
        IntPtr hwnd = IntPtr.Zero;
        try
        {
            state.Scale = Math.Max(1.0, GetDpiForSystem() / 96.0);
            RegisterClassOnce();
            Layout(state);

            var style = WS_POPUP | WS_CAPTION | WS_SYSMENU;
            var rect = new RECT { Left = 0, Top = 0, Right = state.ClientWidth, Bottom = state.ClientHeight };
            AdjustWindowRectEx(ref rect, style, false, WS_EX_TOPMOST | WS_EX_APPWINDOW);
            var width = rect.Right - rect.Left;
            var height = rect.Bottom - rect.Top;
            var left = (GetSystemMetrics(0) - width) / 2;
            var top = (GetSystemMetrics(1) - height) / 3;

            hwnd = CreateWindowEx(WS_EX_TOPMOST | WS_EX_APPWINDOW, ClassName, Caption, style, left, top, width, height, IntPtr.Zero, IntPtr.Zero, GetModuleHandle(null), IntPtr.Zero);
            if (hwnd == IntPtr.Zero) throw new InvalidOperationException("The dialog window could not be created.");

            var dark = 1;
            DwmSetWindowAttribute(hwnd, 20, ref dark, 4);            // dark title bar (Windows 10 2004 and later)
            var captionColor = (int)Canvas;
            DwmSetWindowAttribute(hwnd, 35, ref captionColor, 4);    // caption colour, Windows 11
            var captionText = (int)Ink;
            DwmSetWindowAttribute(hwnd, 36, ref captionText, 4);
            if (state.Icon != IntPtr.Zero)
            {
                SendMessage(hwnd, WM_SETICON, new IntPtr(1), state.Icon);
                SendMessage(hwnd, WM_SETICON, IntPtr.Zero, state.Icon);
            }

            ShowWindow(hwnd, 5);
            UpdateWindow(hwnd);
            SetForegroundWindow(hwnd);

            if (previewPath is not null)
            {
                PumpFor(150);
                SaveBitmap(hwnd, state.ClientWidth, state.ClientHeight, previewPath);
                return state.Result;
            }

            while (!state.Done && GetMessage(out var msg, IntPtr.Zero, 0, 0) > 0)
            {
                TranslateMessage(ref msg);
                DispatchMessage(ref msg);
            }

            return state.Result;
        }
        finally
        {
            if (hwnd != IntPtr.Zero && IsWindow(hwnd)) DestroyWindow(hwnd);
            foreach (var font in new[] { state.TitleFont, state.BodyFont, state.ButtonFont }) if (font != IntPtr.Zero) DeleteObject(font);
            if (state.Icon != IntPtr.Zero) DestroyIcon(state.Icon);
            _state = null;
            SetThreadDpiAwarenessContext(previous);
        }
    }

    private static void RegisterClassOnce()
    {
        if (_classRegistered) return;
        var wc = new WNDCLASSEX
        {
            cbSize = (uint)Marshal.SizeOf<WNDCLASSEX>(),
            lpfnWndProc = WindowProcedure,
            hInstance = GetModuleHandle(null),
            hCursor = LoadCursor(IntPtr.Zero, 32512),
            lpszClassName = ClassName,
        };
        if (RegisterClassEx(ref wc) == 0 && Marshal.GetLastWin32Error() != 1410 /* already registered */) throw new InvalidOperationException("The dialog window class could not be registered.");
        _classRegistered = true;
    }

    /// <summary>Works out the size of everything before the window exists, from the text and the screen's scale.</summary>
    private static void Layout(State s)
    {
        int Px(double v) => (int)Math.Round(v * s.Scale);
        s.Padding = Px(24);
        s.IconSize = Px(40);
        s.ClientWidth = Px(480);
        s.TitleFont = CreateFont(-Px(17), 600, "Segoe UI");
        s.BodyFont = CreateFont(-Px(14), 400, "Segoe UI");
        s.ButtonFont = CreateFont(-Px(14), 600, "Segoe UI");
        var path = s.IconSource ?? Environment.ProcessPath;
        s.Icon = path is null ? IntPtr.Zero : ExtractIcon(IntPtr.Zero, path, 0);
        if (s.Icon == IntPtr.Zero || s.Icon == new IntPtr(1)) s.Icon = IntPtr.Zero;

        var textWidth = s.ClientWidth - 2 * s.Padding;
        var hdc = GetDC(IntPtr.Zero);
        var old = SelectObject(hdc, s.BodyFont);
        var measure = new RECT { Left = 0, Top = 0, Right = textWidth, Bottom = 0 };
        DrawText(hdc, s.Message, -1, ref measure, DT_WORDBREAK | DT_NOPREFIX | DT_CALCRECT);
        SelectObject(hdc, old);
        ReleaseDC(IntPtr.Zero, hdc);

        s.MessageHeight = measure.Bottom - measure.Top;
        s.MessageTop = s.Padding + s.IconSize + Px(16);
        var buttonHeight = Px(36);
        var buttonTop = s.MessageTop + s.MessageHeight + Px(24);
        s.ClientHeight = buttonTop + buttonHeight + s.Padding;

        var labels = s.YesNo ? new[] { ("Yes", true), ("No", false) } : new[] { ("OK", true) };
        var buttonWidth = Px(96);
        var gap = Px(10);
        var x = s.ClientWidth - s.Padding - labels.Length * buttonWidth - (labels.Length - 1) * gap;
        foreach (var (text, result) in labels)
        {
            s.Buttons.Add((text, result, new RECT { Left = x, Top = buttonTop, Right = x + buttonWidth, Bottom = buttonTop + buttonHeight }));
            x += buttonWidth + gap;
        }

        s.Focused = s.YesNo ? 1 : 0; // a question defaults to No, the safe answer
    }

    private static IntPtr WndProcImpl(IntPtr hwnd, uint message, IntPtr wParam, IntPtr lParam)
    {
        var s = _state;
        if (s is null) return DefWindowProc(hwnd, message, wParam, lParam);

        switch (message)
        {
            case WM_ERASEBKGND:
                return new IntPtr(1);

            case WM_PAINT:
                Paint(hwnd, s);
                return IntPtr.Zero;

            case WM_MOUSEMOVE:
            {
                var index = HitTest(s, lParam);
                if (index != s.Hover)
                {
                    s.Hover = index;
                    InvalidateRect(hwnd, IntPtr.Zero, false);
                    var track = new TRACKMOUSEEVENT { cbSize = (uint)Marshal.SizeOf<TRACKMOUSEEVENT>(), dwFlags = 2 /* TME_LEAVE */, hwndTrack = hwnd };
                    TrackMouseEvent(ref track);
                }

                return IntPtr.Zero;
            }

            case WM_MOUSELEAVE:
                s.Hover = -1;
                InvalidateRect(hwnd, IntPtr.Zero, false);
                return IntPtr.Zero;

            case WM_LBUTTONDOWN:
                s.Pressed = HitTest(s, lParam);
                SetCapture(hwnd);
                return IntPtr.Zero;

            case WM_LBUTTONUP:
            {
                ReleaseCapture();
                var index = HitTest(s, lParam);
                var pressed = s.Pressed;
                s.Pressed = -1;
                if (index >= 0 && index == pressed) Finish(hwnd, s, s.Buttons[index].Result);
                return IntPtr.Zero;
            }

            case WM_KEYDOWN:
            {
                var key = (int)wParam;
                if (key == 0x0D || key == 0x20) Finish(hwnd, s, s.Buttons[s.Focused].Result);           // Enter, Space: the focused button
                else if (key == 0x1B) Finish(hwnd, s, !s.YesNo);                                         // Escape: No (or OK)
                else if (s.YesNo && key == 0x59) Finish(hwnd, s, true);                                  // Y
                else if (s.YesNo && key == 0x4E) Finish(hwnd, s, false);                                 // N
                else if (s.Buttons.Count > 1 && key is 0x25 or 0x27 or 0x09)                             // Left, Right, Tab
                {
                    s.Focused = (s.Focused + 1) % s.Buttons.Count;
                    InvalidateRect(hwnd, IntPtr.Zero, false);
                }

                return IntPtr.Zero;
            }

            case WM_CLOSE:
                Finish(hwnd, s, !s.YesNo);
                return IntPtr.Zero;

            case WM_DESTROY:
                s.Done = true;
                PostQuitMessage(0);
                return IntPtr.Zero;
        }

        return DefWindowProc(hwnd, message, wParam, lParam);
    }

    private static void Finish(IntPtr hwnd, State s, bool result)
    {
        s.Result = result;
        s.Done = true;
        DestroyWindow(hwnd);
    }

    private static int HitTest(State s, IntPtr lParam)
    {
        var x = (short)((long)lParam & 0xFFFF);
        var y = (short)(((long)lParam >> 16) & 0xFFFF);
        for (var i = 0; i < s.Buttons.Count; i++)
        {
            var b = s.Buttons[i].Bounds;
            if (x >= b.Left && x < b.Right && y >= b.Top && y < b.Bottom) return i;
        }

        return -1;
    }

    private static void Paint(IntPtr hwnd, State s)
    {
        var hdc = BeginPaint(hwnd, out var ps);
        var memory = CreateCompatibleDC(hdc);
        var bitmap = CreateCompatibleBitmap(hdc, s.ClientWidth, s.ClientHeight);
        var oldBitmap = SelectObject(memory, bitmap);
        SetBkMode(memory, 1 /* TRANSPARENT */);

        var all = new RECT { Left = 0, Top = 0, Right = s.ClientWidth, Bottom = s.ClientHeight };
        Fill(memory, all, Panel);

        // Header: the WinRelease icon and name, as on the site's sidebar.
        if (s.Icon != IntPtr.Zero) DrawIconEx(memory, s.Padding, s.Padding, s.Icon, s.IconSize, s.IconSize, 0, IntPtr.Zero, 3 /* DI_NORMAL */);
        var title = new RECT { Left = s.Icon != IntPtr.Zero ? s.Padding + s.IconSize + (int)(14 * s.Scale) : s.Padding, Top = s.Padding, Right = s.ClientWidth - s.Padding, Bottom = s.Padding + s.IconSize };
        SelectObject(memory, s.TitleFont);
        SetTextColor(memory, Ink);
        DrawText(memory, "WinRelease Helper", -1, ref title, DT_SINGLELINE | DT_VCENTER | DT_NOPREFIX);

        var body = new RECT { Left = s.Padding, Top = s.MessageTop, Right = s.ClientWidth - s.Padding, Bottom = s.MessageTop + s.MessageHeight };
        SelectObject(memory, s.BodyFont);
        SetTextColor(memory, Ink);
        DrawText(memory, s.Message, -1, ref body, DT_WORDBREAK | DT_NOPREFIX);

        for (var i = 0; i < s.Buttons.Count; i++)
        {
            var (text, _, bounds) = s.Buttons[i];
            var primary = i == s.Focused;
            var hovered = i == s.Hover;
            var fill = primary ? (hovered ? BrandHover : Brand) : (hovered ? Subtle : PanelAlt);
            var border = primary ? fill : Subtle;
            var pen = CreatePen(0, Math.Max(1, (int)s.Scale), border);
            var brush = CreateSolidBrush(fill);
            var oldPen = SelectObject(memory, pen);
            var oldBrush = SelectObject(memory, brush);
            var radius = (int)(10 * s.Scale);
            RoundRect(memory, bounds.Left, bounds.Top, bounds.Right, bounds.Bottom, radius, radius);
            SelectObject(memory, oldPen);
            SelectObject(memory, oldBrush);
            DeleteObject(pen);
            DeleteObject(brush);

            SelectObject(memory, s.ButtonFont);
            SetTextColor(memory, primary ? 0x00FFFFFF : Ink);
            var label = bounds;
            DrawText(memory, text, -1, ref label, DT_SINGLELINE | DT_VCENTER | 1 /* DT_CENTER */ | DT_NOPREFIX);
        }

        BitBlt(hdc, 0, 0, s.ClientWidth, s.ClientHeight, memory, 0, 0, 0x00CC0020 /* SRCCOPY */);
        SelectObject(memory, oldBitmap);
        DeleteObject(bitmap);
        DeleteDC(memory);
        EndPaint(hwnd, ref ps);
    }

    private static void Fill(IntPtr hdc, RECT rect, uint color)
    {
        var brush = CreateSolidBrush(color);
        FillRect(hdc, ref rect, brush);
        DeleteObject(brush);
    }

    private static IntPtr CreateFont(int height, int weight, string face) =>
        CreateFontW(height, 0, 0, 0, weight, 0, 0, 0, 1 /* DEFAULT_CHARSET */, 0, 0, 5 /* CLEARTYPE_QUALITY */, 0, face);

    private static void PumpFor(int milliseconds)
    {
        var until = Environment.TickCount64 + milliseconds;
        while (Environment.TickCount64 < until)
        {
            while (PeekMessage(out var msg, IntPtr.Zero, 0, 0, 1 /* PM_REMOVE */))
            {
                TranslateMessage(ref msg);
                DispatchMessage(ref msg);
            }

            Thread.Sleep(10);
        }
    }

    private static void SaveBitmap(IntPtr hwnd, int width, int height, string path)
    {
        var window = GetDC(hwnd);
        var memory = CreateCompatibleDC(window);
        var bitmap = CreateCompatibleBitmap(window, width, height);
        var old = SelectObject(memory, bitmap);
        PrintWindow(hwnd, memory, 0x3 /* PW_CLIENTONLY | PW_RENDERFULLCONTENT */);

        var info = new BITMAPINFOHEADER { biSize = (uint)Marshal.SizeOf<BITMAPINFOHEADER>(), biWidth = width, biHeight = height, biPlanes = 1, biBitCount = 32 };
        var pixels = new byte[width * height * 4];
        GetDIBits(memory, bitmap, 0, (uint)height, pixels, ref info, 0);
        SelectObject(memory, old);
        DeleteObject(bitmap);
        DeleteDC(memory);
        ReleaseDC(hwnd, window);

        using var file = File.Create(path);
        using var writer = new BinaryWriter(file);
        writer.Write((byte)'B'); writer.Write((byte)'M');
        writer.Write(54 + pixels.Length); writer.Write(0); writer.Write(54);
        writer.Write(40); writer.Write(width); writer.Write(height); writer.Write((short)1); writer.Write((short)32);
        writer.Write(0); writer.Write(pixels.Length); writer.Write(0); writer.Write(0); writer.Write(0); writer.Write(0);
        writer.Write(pixels);
    }

    // ---- Win32 ----
    private const uint WS_POPUP = 0x80000000, WS_CAPTION = 0x00C00000, WS_SYSMENU = 0x00080000, WS_EX_TOPMOST = 0x8, WS_EX_APPWINDOW = 0x40000;
    private const uint WM_DESTROY = 0x2, WM_CLOSE = 0x10, WM_ERASEBKGND = 0x14, WM_PAINT = 0xF, WM_SETICON = 0x80, WM_KEYDOWN = 0x100, WM_MOUSEMOVE = 0x200,
        WM_LBUTTONDOWN = 0x201, WM_LBUTTONUP = 0x202, WM_MOUSELEAVE = 0x2A3;
    private const uint DT_WORDBREAK = 0x10, DT_SINGLELINE = 0x20, DT_VCENTER = 0x4, DT_CALCRECT = 0x400, DT_NOPREFIX = 0x800;

    private delegate IntPtr WndProc(IntPtr hwnd, uint message, IntPtr wParam, IntPtr lParam);

    [StructLayout(LayoutKind.Sequential)] private struct RECT { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] private struct POINT { public int X, Y; }
    [StructLayout(LayoutKind.Sequential)] private struct MSG { public IntPtr hwnd; public uint message; public IntPtr wParam, lParam; public uint time; public POINT pt; }
    [StructLayout(LayoutKind.Sequential)] private struct TRACKMOUSEEVENT { public uint cbSize, dwFlags; public IntPtr hwndTrack; public uint dwHoverTime; }
    [StructLayout(LayoutKind.Sequential)]
    private struct PAINTSTRUCT
    {
        public IntPtr hdc; public int fErase; public RECT rcPaint; public int fRestore, fIncUpdate;
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 32)] public byte[] rgbReserved;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct BITMAPINFOHEADER
    {
        public uint biSize; public int biWidth, biHeight; public ushort biPlanes, biBitCount; public uint biCompression, biSizeImage;
        public int biXPelsPerMeter, biYPelsPerMeter; public uint biClrUsed, biClrImportant;
    }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct WNDCLASSEX
    {
        public uint cbSize, style; public WndProc lpfnWndProc; public int cbClsExtra, cbWndExtra; public IntPtr hInstance, hIcon, hCursor, hbrBackground;
        [MarshalAs(UnmanagedType.LPWStr)] public string? lpszMenuName; [MarshalAs(UnmanagedType.LPWStr)] public string lpszClassName; public IntPtr hIconSm;
    }

    private static IntPtr BeginPaint(IntPtr hwnd, out PAINTSTRUCT ps) { ps = new PAINTSTRUCT { rgbReserved = new byte[32] }; return BeginPaintNative(hwnd, ref ps); }

    [DllImport("user32.dll", EntryPoint = "BeginPaint")] private static extern IntPtr BeginPaintNative(IntPtr hwnd, ref PAINTSTRUCT ps);
    [DllImport("user32.dll")] private static extern bool EndPaint(IntPtr hwnd, ref PAINTSTRUCT ps);
    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern ushort RegisterClassEx(ref WNDCLASSEX wc);
    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr CreateWindowEx(uint exStyle, string className, string title, uint style, int x, int y, int width, int height, IntPtr parent, IntPtr menu, IntPtr instance, IntPtr param);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern IntPtr DefWindowProc(IntPtr hwnd, uint message, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")] private static extern bool DestroyWindow(IntPtr hwnd);
    [DllImport("user32.dll")] private static extern bool IsWindow(IntPtr hwnd);
    [DllImport("user32.dll")] private static extern bool ShowWindow(IntPtr hwnd, int command);
    [DllImport("user32.dll")] private static extern bool UpdateWindow(IntPtr hwnd);
    [DllImport("user32.dll")] private static extern bool SetForegroundWindow(IntPtr hwnd);
    [DllImport("user32.dll")] private static extern bool InvalidateRect(IntPtr hwnd, IntPtr rect, bool erase);
    [DllImport("user32.dll")] private static extern int GetMessage(out MSG msg, IntPtr hwnd, uint min, uint max);
    [DllImport("user32.dll")] private static extern bool PeekMessage(out MSG msg, IntPtr hwnd, uint min, uint max, uint remove);
    [DllImport("user32.dll")] private static extern bool TranslateMessage(ref MSG msg);
    [DllImport("user32.dll")] private static extern IntPtr DispatchMessage(ref MSG msg);
    [DllImport("user32.dll")] private static extern void PostQuitMessage(int exitCode);
    [DllImport("user32.dll")] private static extern IntPtr SendMessage(IntPtr hwnd, uint message, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")] private static extern IntPtr LoadCursor(IntPtr instance, int name);
    [DllImport("user32.dll")] private static extern IntPtr SetCapture(IntPtr hwnd);
    [DllImport("user32.dll")] private static extern bool ReleaseCapture();
    [DllImport("user32.dll")] private static extern bool TrackMouseEvent(ref TRACKMOUSEEVENT track);
    [DllImport("user32.dll")] private static extern int GetSystemMetrics(int index);
    [DllImport("user32.dll")] private static extern bool AdjustWindowRectEx(ref RECT rect, uint style, bool menu, uint exStyle);
    [DllImport("user32.dll")] private static extern IntPtr GetDC(IntPtr hwnd);
    [DllImport("user32.dll")] private static extern int ReleaseDC(IntPtr hwnd, IntPtr hdc);
    [DllImport("user32.dll")] private static extern int FillRect(IntPtr hdc, ref RECT rect, IntPtr brush);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int DrawText(IntPtr hdc, string text, int length, ref RECT rect, uint format);
    [DllImport("user32.dll")] private static extern bool DrawIconEx(IntPtr hdc, int x, int y, IntPtr icon, int width, int height, uint step, IntPtr brush, uint flags);
    [DllImport("user32.dll")] private static extern bool PrintWindow(IntPtr hwnd, IntPtr hdc, uint flags);
    [DllImport("user32.dll")] private static extern uint GetDpiForSystem();
    [DllImport("user32.dll")] private static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int MessageBox(IntPtr hwnd, string text, string caption, uint type);
    [DllImport("user32.dll")] private static extern bool DestroyIcon(IntPtr icon);
    [DllImport("shell32.dll", CharSet = CharSet.Unicode)] private static extern IntPtr ExtractIcon(IntPtr instance, string file, int index);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] private static extern IntPtr GetModuleHandle(string? name);
    [DllImport("gdi32.dll")] private static extern IntPtr CreateSolidBrush(uint color);
    [DllImport("gdi32.dll")] private static extern IntPtr CreatePen(int style, int width, uint color);
    [DllImport("gdi32.dll")] private static extern bool DeleteObject(IntPtr obj);
    [DllImport("gdi32.dll")] private static extern IntPtr SelectObject(IntPtr hdc, IntPtr obj);
    [DllImport("gdi32.dll")] private static extern IntPtr CreateCompatibleDC(IntPtr hdc);
    [DllImport("gdi32.dll")] private static extern IntPtr CreateCompatibleBitmap(IntPtr hdc, int width, int height);
    [DllImport("gdi32.dll")] private static extern bool DeleteDC(IntPtr hdc);
    [DllImport("gdi32.dll")] private static extern bool BitBlt(IntPtr hdc, int x, int y, int width, int height, IntPtr source, int sx, int sy, uint rop);
    [DllImport("gdi32.dll")] private static extern bool RoundRect(IntPtr hdc, int left, int top, int right, int bottom, int width, int height);
    [DllImport("gdi32.dll")] private static extern int SetBkMode(IntPtr hdc, int mode);
    [DllImport("gdi32.dll")] private static extern uint SetTextColor(IntPtr hdc, uint color);
    [DllImport("gdi32.dll")] private static extern int GetDIBits(IntPtr hdc, IntPtr bitmap, uint start, uint lines, byte[] bits, ref BITMAPINFOHEADER info, uint usage);
    [DllImport("gdi32.dll", CharSet = CharSet.Unicode)]
    private static extern IntPtr CreateFontW(int height, int width, int escapement, int orientation, int weight, uint italic, uint underline, uint strikeOut, uint charset, uint outPrecision, uint clipPrecision, uint quality, uint pitchAndFamily, string face);
    [DllImport("dwmapi.dll")] private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref int value, int size);
}
