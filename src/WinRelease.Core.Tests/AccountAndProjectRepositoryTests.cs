using WinRelease.Core.Domain;
using WinRelease.Core.Manifest;
using WinRelease.Core.Persistence;
using Xunit;

namespace WinRelease.Core.Tests;

public class AccountAndProjectRepositoryTests : IDisposable
{
    private readonly string _dataDirectory = Path.Combine(Path.GetTempPath(), "winrelease-repo-tests-" + Guid.NewGuid());

    [Fact]
    public async Task AccountRepository_SaveThenGet_RoundTripsStorageConnection()
    {
        var repository = new JsonFileAccountRepository(_dataDirectory);
        var account = new Account
        {
            Id = Guid.NewGuid(),
            Name = "Contoso",
            Storage = new StorageConnection
            {
                Provider = StorageProviderKind.AzureBlob,
                AzureBlob = new AzureBlobStorageSettings { AccountName = "contosostorage", SasToken = "conn", ContainerName = "artifacts" },
            },
        };

        await repository.SaveAsync(account);
        var loaded = await repository.GetAsync(account.Id);

        Assert.NotNull(loaded);
        Assert.Equal(account.Name, loaded!.Name);
        Assert.Equal(StorageProviderKind.AzureBlob, loaded.Storage.Provider);
        Assert.Equal("artifacts", loaded.Storage.AzureBlob!.ContainerName);
    }

    [Fact]
    public async Task AccountRepository_GetAsync_UnknownId_ReturnsNull()
    {
        var repository = new JsonFileAccountRepository(_dataDirectory);

        Assert.Null(await repository.GetAsync(Guid.NewGuid()));
    }

    [Fact]
    public async Task ProjectRepository_ListByAccountAsync_OnlyReturnsMatchingAccount()
    {
        var repository = new JsonFileProjectRepository(_dataDirectory);
        var accountId = Guid.NewGuid();
        var otherAccountId = Guid.NewGuid();

        var ownProject = NewProject(accountId, "OwnApp");
        var otherProject = NewProject(otherAccountId, "OtherApp");

        await repository.SaveAsync(ownProject);
        await repository.SaveAsync(otherProject);

        var results = await repository.ListByAccountAsync(accountId);

        var project = Assert.Single(results);
        Assert.Equal(ownProject.Id, project.Id);
    }

    [Fact]
    public async Task ProjectRepository_SaveThenGet_RoundTripsManifestAndOverride()
    {
        var repository = new JsonFileProjectRepository(_dataDirectory);
        var project = NewProject(Guid.NewGuid(), "WidgetApp") with
        {
            StorageOverride = new StorageConnection
            {
                Provider = StorageProviderKind.S3,
                S3 = new S3StorageSettings { BucketName = "b", Region = "us-east-1", AccessKeyId = "k", SecretAccessKey = "s" },
            },
        };

        await repository.SaveAsync(project);
        var loaded = await repository.GetAsync(project.Id);

        Assert.NotNull(loaded);
        Assert.Equal("WidgetApp", loaded!.Manifest.Name);
        Assert.Equal(StorageProviderKind.S3, loaded.StorageOverride!.Provider);
    }

    [Fact]
    public async Task ProjectRepository_DeleteAsync_RemovesTheProjectAndReturnsTrue()
    {
        var repository = new JsonFileProjectRepository(_dataDirectory);
        var project = NewProject(Guid.NewGuid(), "DeleteMe");
        await repository.SaveAsync(project);

        var deleted = await repository.DeleteAsync(project.Id);

        Assert.True(deleted);
        Assert.Null(await repository.GetAsync(project.Id));
    }

    [Fact]
    public async Task ProjectRepository_DeleteAsync_UnknownId_ReturnsFalse()
    {
        var repository = new JsonFileProjectRepository(_dataDirectory);

        Assert.False(await repository.DeleteAsync(Guid.NewGuid()));
    }

    private static Project NewProject(Guid accountId, string name) => new()
    {
        Id = Guid.NewGuid(),
        AccountId = accountId,
        Manifest = new WinReleaseManifest
        {
            UpgradeCode = Guid.NewGuid(),
            Name = name,
            Manufacturer = "Acme",
            DisplayVersion = "1.0.0",
        },
    };

    public void Dispose()
    {
        if (Directory.Exists(_dataDirectory))
        {
            Directory.Delete(_dataDirectory, recursive: true);
        }
    }
}
