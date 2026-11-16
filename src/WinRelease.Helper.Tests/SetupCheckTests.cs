using Xunit;

namespace WinRelease.Helper.Tests;

/// <summary>A found answer is kept; a not-found answer is looked at again after a short wait (WiX installed after the Helper started).</summary>
public sealed class SetupCheckTests
{
    private static readonly DateTimeOffset Start = new(2026, 10, 30, 13, 0, 0, TimeSpan.Zero);

    [Fact]
    public void AFoundAnswerIsComputedOnceAndKept()
    {
        var calls = 0;
        var now = Start;
        var check = new SetupCheck<bool>(() => { calls++; return true; }, found => found, TimeSpan.FromSeconds(4), () => now);

        Assert.True(check.Value);
        now = Start.AddMinutes(30);
        Assert.True(check.Value);

        Assert.Equal(1, calls);
    }

    [Fact]
    public void ANotFoundAnswerIsRecheckedOnlyAfterTheWait_AndOnceFoundIsKept()
    {
        var installed = false;
        var calls = 0;
        var now = Start;
        var check = new SetupCheck<bool>(() => { calls++; return installed; }, found => found, TimeSpan.FromSeconds(4), () => now);

        Assert.False(check.Value);
        now = Start.AddSeconds(2);
        Assert.False(check.Value);          // too soon: not looked at again
        Assert.Equal(1, calls);

        installed = true;                    // dotnet tool install --global wix finished
        now = Start.AddSeconds(5);
        Assert.True(check.Value);            // looked at again, now found
        now = Start.AddMinutes(10);
        Assert.True(check.Value);
        Assert.Equal(2, calls);              // and kept
    }

    [Fact]
    public void AMissingSdkVersionIsRecheckedToo()
    {
        string? sdk = null;
        var now = Start;
        var check = new SetupCheck<string?>(() => sdk, version => version is not null, TimeSpan.FromSeconds(4), () => now);

        Assert.Null(check.Value);
        sdk = "9.0.100";
        now = Start.AddSeconds(10);

        Assert.Equal("9.0.100", check.Value);
    }
}
