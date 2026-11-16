namespace WinRelease.Core.Compilation;

/// <summary>
/// Caps how many <c>wix build</c> runs execute at once on a host. A compile is CPU/disk heavy, so an
/// unbounded number of simultaneous uploads is a cheap denial-of-service; past the cap a request is
/// refused immediately (HTTP 503) instead of queueing without bound. Register as a singleton.
/// </summary>
public sealed class BuildGate(int maxConcurrentBuilds)
{
    private readonly SemaphoreSlim slots = new(Math.Max(1, maxConcurrentBuilds));

    /// <summary>A lease to dispose when the build finishes, or null when every slot is in use.</summary>
    public IDisposable? TryEnter() => slots.Wait(0) ? new Lease(slots) : null;

    private sealed class Lease(SemaphoreSlim slots) : IDisposable
    {
        private int released;

        public void Dispose()
        {
            if (Interlocked.Exchange(ref released, 1) == 0)
            {
                slots.Release();
            }
        }
    }
}
