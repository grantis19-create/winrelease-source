using System.ComponentModel.DataAnnotations;
using WinRelease.Core.Domain;
using Xunit;

namespace WinRelease.Core.Tests;

public class StorageConnectionValidationTests
{
    [Fact]
    public void Managed_NoSettings_IsValid() =>
        Assert.Empty(Validate(StorageConnection.Managed));

    [Fact]
    public void Managed_WithAzureBlobSettings_IsInvalid()
    {
        var connection = new StorageConnection
        {
            Provider = StorageProviderKind.Managed,
            AzureBlob = new AzureBlobStorageSettings { AccountName = "acct", SasToken = "x", ContainerName = "y" },
        };

        Assert.NotEmpty(Validate(connection));
    }

    [Fact]
    public void AzureBlob_MissingSettings_IsInvalid()
    {
        var connection = new StorageConnection { Provider = StorageProviderKind.AzureBlob };

        Assert.NotEmpty(Validate(connection));
    }

    [Fact]
    public void AzureBlob_WithSettings_IsValid()
    {
        var connection = new StorageConnection
        {
            Provider = StorageProviderKind.AzureBlob,
            AzureBlob = new AzureBlobStorageSettings { AccountName = "acct", SasToken = "x", ContainerName = "y" },
        };

        Assert.Empty(Validate(connection));
    }

    [Fact]
    public void S3_MissingSettings_IsInvalid()
    {
        var connection = new StorageConnection { Provider = StorageProviderKind.S3 };

        Assert.NotEmpty(Validate(connection));
    }

    [Fact]
    public void S3_WithSettings_IsValid()
    {
        var connection = new StorageConnection
        {
            Provider = StorageProviderKind.S3,
            S3 = new S3StorageSettings { BucketName = "b", Region = "us-east-1", AccessKeyId = "k", SecretAccessKey = "s" },
        };

        Assert.Empty(Validate(connection));
    }

    [Fact]
    public void S3_WithAzureBlobSettingsAlsoPresent_IsInvalid()
    {
        var connection = new StorageConnection
        {
            Provider = StorageProviderKind.S3,
            S3 = new S3StorageSettings { BucketName = "b", Region = "us-east-1", AccessKeyId = "k", SecretAccessKey = "s" },
            AzureBlob = new AzureBlobStorageSettings { AccountName = "acct", SasToken = "x", ContainerName = "y" },
        };

        Assert.NotEmpty(Validate(connection));
    }

    private static List<ValidationResult> Validate(StorageConnection connection)
    {
        var results = new List<ValidationResult>();
        Validator.TryValidateObject(connection, new ValidationContext(connection), results, validateAllProperties: true);
        return results;
    }
}
