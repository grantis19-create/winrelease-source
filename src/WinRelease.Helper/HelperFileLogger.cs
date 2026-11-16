using Microsoft.Extensions.Logging;

namespace WinRelease.Helper;

/// <summary>
/// A windowless Helper has no console to read, so its log goes to a plain text file (ADR 0102). Tiny on purpose: one append-only
/// file, truncated at startup once it passes a size cap, no rolling or formatting options.
/// </summary>
public sealed class HelperFileLoggerProvider : ILoggerProvider
{
    private const long MaxBytesAtStartup = 2 * 1024 * 1024;
    private readonly object _gate = new();
    private readonly string _path;

    public HelperFileLoggerProvider(string path)
    {
        _path = path;
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        if (File.Exists(path) && new FileInfo(path).Length > MaxBytesAtStartup)
        {
            File.Delete(path);
        }
    }

    public ILogger CreateLogger(string categoryName) => new FileLogger(this, categoryName);

    public void Dispose()
    {
    }

    private void Write(string line)
    {
        lock (_gate)
        {
            try
            {
                File.AppendAllText(_path, line + Environment.NewLine);
            }
            catch (IOException)
            {
                // A locked or full log file must never take the Helper down.
            }
        }
    }

    private sealed class FileLogger(HelperFileLoggerProvider owner, string category) : ILogger
    {
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => logLevel >= LogLevel.Information;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        {
            if (!IsEnabled(logLevel)) return;
            var text = $"{DateTime.Now:yyyy-MM-dd HH:mm:ss} {logLevel,-11} {category}: {formatter(state, exception)}";
            if (exception is not null) text += Environment.NewLine + exception;
            owner.Write(text);
        }
    }
}
