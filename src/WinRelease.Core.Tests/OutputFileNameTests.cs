using WinRelease.Core.Compilation;
using Xunit;

namespace WinRelease.Core.Tests;

public sealed class OutputFileNameTests
{
    [Fact]
    public void KeepsSpacesUnlikeWixIdSanitize()
    {
        Assert.Equal("Hide Empty Roots Test", OutputFileName.Sanitize("Hide Empty Roots Test"));
    }

    [Fact]
    public void ReplacesWindowsFileNameIllegalCharactersWithUnderscore()
    {
        Assert.Equal("App_ Beta_2024", OutputFileName.Sanitize("App: Beta/2024"));
    }

    [Fact]
    public void TrimsATrailingSpaceOrPeriod()
    {
        Assert.Equal("App", OutputFileName.Sanitize("App. "));
    }

    [Fact]
    public void FallsBackToAPlaceholderWhenNothingIsLeftAfterTrimming()
    {
        Assert.Equal("WinRelease", OutputFileName.Sanitize(""));
        Assert.Equal("WinRelease", OutputFileName.Sanitize("   "));
    }
}
