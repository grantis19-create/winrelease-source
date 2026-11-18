using WinRelease.Core.Compilation;
using WinRelease.Core.Manifest;
using Xunit;

namespace WinRelease.Core.Tests;

public sealed class ProductCodeTests
{
    private static WinReleaseManifest Manifest(Guid? pinned = null) => new()
    {
        UpgradeCode = new Guid("11111111-1111-1111-1111-111111111111"),
        Name = "Product code test",
        Manufacturer = "Tests",
        DisplayVersion = "1.0.0",
        ProductCode = pinned,
    };

    [Fact]
    public void ForNewBuild_IsADifferentRandomGuid_EachTime_WhenNothingIsPinned()
    {
        var manifest = Manifest();

        var first = ProductCode.ForNewBuild(manifest);
        var second = ProductCode.ForNewBuild(manifest);

        Assert.NotEqual(first, second);
        Assert.NotEqual(Guid.Empty, first);
        // A random (version 4) GUID, not one derived from the Upgrade Code.
        Assert.Equal('4', first.ToString("D")[14]);
    }

    [Fact]
    public void ForNewBuild_ReturnsThePinnedCode_EveryTime()
    {
        var pinned = Guid.NewGuid();
        var manifest = Manifest(pinned);

        Assert.Equal(pinned, ProductCode.ForNewBuild(manifest));
        Assert.Equal(pinned, ProductCode.ForNewBuild(manifest));
    }

    [Fact]
    public void ForNewBuild_DoesNotDependOnTheUpgradeCodeOrTheVersion()
    {
        var a = Manifest();
        var b = a with { DisplayVersion = "2.0.0", UpgradeCode = Guid.NewGuid() };

        // Nothing links the code to those fields, so two builds of any manifest never collide by construction.
        Assert.NotEqual(ProductCode.ForNewBuild(a), ProductCode.ForNewBuild(b));
    }
}
