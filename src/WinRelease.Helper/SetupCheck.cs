namespace WinRelease.Helper;

/// <summary>
/// A setup check (is the WiX tool installed, which .NET SDK is there) that is remembered once it succeeds but looked at again, at most every
/// <paramref name="retryAfter"/>, while the answer is "not found". The Helper is long-running and the usual first-run order is the Helper first,
/// then <c>dotnet tool install --global wix</c>: a "not found" answer cached for the Helper's whole life made the site say "WiX compiler not found"
/// even after WiX was installed, until the person quit and restarted the Helper.
/// </summary>
public sealed class SetupCheck<T>(Func<T> compute, Func<T, bool> isFound, TimeSpan retryAfter, Func<DateTimeOffset>? clock = null)
{
    private readonly object _gate = new();
    private readonly Func<DateTimeOffset> _now = clock ?? (() => DateTimeOffset.UtcNow);
    private T? _value;
    private DateTimeOffset _computedAt;
    private bool _hasValue;

    public T Value
    {
        get
        {
            lock (_gate)
            {
                var now = _now();
                if (!_hasValue || (!isFound(_value!) && now - _computedAt >= retryAfter))
                {
                    _value = compute();
                    _computedAt = now;
                    _hasValue = true;
                }

                return _value!;
            }
        }
    }
}
