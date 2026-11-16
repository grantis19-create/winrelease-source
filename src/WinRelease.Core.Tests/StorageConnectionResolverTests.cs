using WinRelease.Core.Domain;
using WinRelease.Core.Manifest;
using Xunit;

namespace WinRelease.Core.Tests;

public class StorageConnectionResolverTests
{
    private static readonly Account Account = new()
    {
        Id = Guid.NewGuid(),
        Name = "Contoso",
        Storage = new StorageConnection
        {
            Provider = StorageProviderKind.AzureBlob,
            AzureBlob = new AzureBlobStorageSettings { AccountName = "contosostorage", SasToken = "conn", ContainerName = "artifacts" },
        },
    };

    [Fact]
    public void Resolve_NoProjectOverride_ReturnsAccountStorage()
    {
        var project = NewProject(storageOverride: null);

        var resolved = StorageConnectionResolver.Resolve(Account, project);

        Assert.Equal(StorageProviderKind.AzureBlob, resolved.Provider);
    }

    [Fact]
    public void Resolve_WithProjectOverride_ReturnsOverride()
    {
        var project = NewProject(storageOverride: StorageConnection.Managed);

        var resolved = StorageConnectionResolver.Resolve(Account, project);

        Assert.Equal(StorageProviderKind.Managed, resolved.Provider);
    }

    private static Project NewProject(StorageConnection? storageOverride) => new()
    {
        Id = Guid.NewGuid(),
        AccountId = Account.Id,
        Manifest = new WinReleaseManifest
        {
            UpgradeCode = Guid.NewGuid(),
            Name = "WidgetApp",
            Manufacturer = "Acme",
            DisplayVersion = "1.0.0",
        },
        StorageOverride = storageOverride,
    };
}
