using System.ComponentModel.DataAnnotations;

namespace WinRelease.Core.Domain;

/// <summary>
/// Where a Project's build artifacts live: WinRelease's own managed storage,
/// or a BYOS connection into the customer's own Azure Blob container or S3
/// bucket. See ADR 0003 (Account-level BYOS) and ADR 0031 (pluggable BYOS
/// backends).
/// </summary>
public sealed record StorageConnection : IValidatableObject
{
    public required StorageProviderKind Provider { get; init; }

    public AzureBlobStorageSettings? AzureBlob { get; init; }

    public S3StorageSettings? S3 { get; init; }

    public static StorageConnection Managed { get; } = new() { Provider = StorageProviderKind.Managed };

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        switch (Provider)
        {
            case StorageProviderKind.Managed when AzureBlob is not null || S3 is not null:
                yield return new ValidationResult(
                    "provider 'managed' must not include azureBlob or s3 settings.",
                    [nameof(Provider)]);
                break;

            case StorageProviderKind.AzureBlob when AzureBlob is null:
                yield return new ValidationResult(
                    "azureBlob settings are required when provider is 'azureBlob'.",
                    [nameof(AzureBlob)]);
                break;
            case StorageProviderKind.AzureBlob when S3 is not null:
                yield return new ValidationResult(
                    "provider 'azureBlob' must not include s3 settings.",
                    [nameof(S3)]);
                break;

            case StorageProviderKind.S3 when S3 is null:
                yield return new ValidationResult(
                    "s3 settings are required when provider is 's3'.",
                    [nameof(S3)]);
                break;
            case StorageProviderKind.S3 when AzureBlob is not null:
                yield return new ValidationResult(
                    "provider 's3' must not include azureBlob settings.",
                    [nameof(AzureBlob)]);
                break;
        }
    }
}

public enum StorageProviderKind
{
    Managed,
    AzureBlob,
    S3,
}

/// <summary>
/// A container-scoped SAS token, not a full account connection string (ADR
/// 0034) - lets a BYOS customer hand WinRelease access scoped to one
/// container/prefix instead of their storage account's master key.
/// </summary>
public sealed record AzureBlobStorageSettings
{
    public required string AccountName { get; init; }
    public required string SasToken { get; init; }
    public required string ContainerName { get; init; }

    /// <summary>Optional prefix within the container every key is stored under.</summary>
    public string? Folder { get; init; }
}

public sealed record S3StorageSettings
{
    public required string BucketName { get; init; }
    public required string Region { get; init; }
    public required string AccessKeyId { get; init; }
    public required string SecretAccessKey { get; init; }
}
