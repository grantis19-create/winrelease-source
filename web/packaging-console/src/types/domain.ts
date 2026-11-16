// Mirrors WinRelease.API's Account/Project view + request DTOs
// (src/WinRelease.API/Accounts/AccountDtos.cs, Projects/ProjectDtos.cs) and
// the underlying WinRelease.Core.Domain.StorageConnection (ADR 0031/0034) /
// WebhookConfig (ADR 0078).

import type { WinReleaseManifest } from './manifest'

export type StorageProviderKind = 'managed' | 'azureBlob' | 's3'

/** What the API echoes back - secrets (SAS tokens, access keys) are redacted server-side, never sent over the wire. */
export interface StorageConnectionView {
  provider: StorageProviderKind
  accountName?: string | null
  containerName?: string | null
  folder?: string | null
  bucketName?: string | null
  region?: string | null
}

/** A container-scoped SAS token, not a full account connection string (ADR 0034). */
export interface AzureBlobStorageSettings {
  accountName: string
  sasToken: string
  containerName: string
  folder?: string
}

export interface S3StorageSettings {
  bucketName: string
  region: string
  accessKeyId: string
  secretAccessKey: string
}

/** What PUT .../storage accepts - the shape WinRelease.Core.Domain.StorageConnection validates. */
export interface StorageConnectionRequest {
  provider: StorageProviderKind
  azureBlob?: AzureBlobStorageSettings
  s3?: S3StorageSettings
}

/** What PUT .../webhook accepts and the API echoes back - just a URL (ADR 0078). */
export interface WebhookConfigView {
  url: string
}

export interface AccountView {
  id: string
  name: string
  storage: StorageConnectionView
  webhook?: WebhookConfigView | null
}

export interface ProjectView {
  id: string
  accountId: string
  manifest: WinReleaseManifest
  storageOverride?: StorageConnectionView | null
  webhookOverride?: WebhookConfigView | null
}
