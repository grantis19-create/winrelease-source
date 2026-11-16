import { Check, Cloud } from 'lucide-react'
import { useState } from 'react'
import { Panel } from './ui/Panel'
import { Button } from './ui/Button'
import { Field, TextInput } from './ui/Field'
import { InlineError } from './ui/InlineError'
import type { StorageConnectionRequest, StorageConnectionView, StorageProviderKind } from '../types/domain'

const PROVIDER_LABELS: Record<StorageProviderKind, string> = {
  managed: 'WinRelease-managed',
  azureBlob: 'Azure Blob (BYOS)',
  s3: 'Amazon S3 (BYOS)',
}

export function StorageSettings({
  current,
  allowInherit,
  onSave,
  saving,
  error,
  saved,
}: {
  current: StorageConnectionView | null
  /** True for a Project's storage override, where "null" means "inherit the Account's connection" (ADR 0003). */
  allowInherit: boolean
  onSave: (request: StorageConnectionRequest | null) => void
  saving: boolean
  /** A user-facing message from the last save attempt - e.g. ADR 0034's connectivity check failing. */
  error?: string | null
  /** True right after a successful save, until the next edit/save attempt. */
  saved?: boolean
}) {
  const [provider, setProvider] = useState<StorageProviderKind | 'inherit'>(current?.provider ?? (allowInherit ? 'inherit' : 'managed'))
  const [accountName, setAccountName] = useState(current?.accountName ?? '')
  const [sasToken, setSasToken] = useState('')
  const [containerName, setContainerName] = useState(current?.containerName ?? '')
  const [folder, setFolder] = useState(current?.folder ?? '')
  const [bucketName, setBucketName] = useState(current?.bucketName ?? '')
  const [region, setRegion] = useState(current?.region ?? '')
  const [accessKeyId, setAccessKeyId] = useState('')
  const [secretAccessKey, setSecretAccessKey] = useState('')

  function submit() {
    if (provider === 'inherit') {
      onSave(null)
      return
    }
    if (provider === 'managed') {
      onSave({ provider: 'managed' })
      return
    }
    if (provider === 'azureBlob') {
      onSave({ provider: 'azureBlob', azureBlob: { accountName, sasToken, containerName, folder: folder || undefined } })
      return
    }
    onSave({ provider: 's3', s3: { bucketName, region, accessKeyId, secretAccessKey } })
  }

  return (
    <Panel
      icon={Cloud}
      title="Storage"
      defaultCollapsed
      description="Where this project's build artifacts are stored - WinRelease-managed by default, or bring your own Azure Blob container or S3 bucket."
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-4">
          {allowInherit && (
            <label className="flex items-center gap-1.5 text-sm">
              <input type="radio" checked={provider === 'inherit'} onChange={() => setProvider('inherit')} />
              Inherit from Account
            </label>
          )}
          {(Object.keys(PROVIDER_LABELS) as StorageProviderKind[]).map((kind) => (
            <label key={kind} className="flex items-center gap-1.5 text-sm">
              <input type="radio" checked={provider === kind} onChange={() => setProvider(kind)} />
              {PROVIDER_LABELS[kind]}
            </label>
          ))}
        </div>

        {provider === 'azureBlob' && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Storage Account Name">
              <TextInput value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="contosostorage" />
            </Field>
            <Field label="Container Name">
              <TextInput value={containerName} onChange={(e) => setContainerName(e.target.value)} />
            </Field>
            <Field label="SAS Token">
              <TextInput
                type="password"
                value={sasToken}
                onChange={(e) => setSasToken(e.target.value)}
                placeholder="secrets are never displayed - re-enter to update"
              />
            </Field>
            <Field label="Folder (optional)">
              <TextInput value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="releases" />
            </Field>
            <p className="col-span-full text-xs text-muted">
              Generate a container-scoped SAS token in the Azure Portal (Container → Shared access tokens) with Read/Write/List
              permissions - not your storage account's access key. Scoping it to one container keeps WinRelease's access
              limited to just this container.
            </p>
          </div>
        )}

        {provider === 's3' && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Bucket Name">
              <TextInput value={bucketName} onChange={(e) => setBucketName(e.target.value)} />
            </Field>
            <Field label="Region">
              <TextInput value={region} onChange={(e) => setRegion(e.target.value)} placeholder="us-east-1" />
            </Field>
            <Field label="Access Key Id">
              <TextInput
                type="password"
                value={accessKeyId}
                onChange={(e) => setAccessKeyId(e.target.value)}
                placeholder="secrets are never displayed - re-enter to update"
              />
            </Field>
            <Field label="Secret Access Key">
              <TextInput
                type="password"
                value={secretAccessKey}
                onChange={(e) => setSecretAccessKey(e.target.value)}
                placeholder="secrets are never displayed - re-enter to update"
              />
            </Field>
          </div>
        )}

        <div className="flex items-center gap-3">
          <Button variant="primary" onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : 'Save Storage Settings'}
          </Button>
          {saved && !error && (
            <span className="flex items-center gap-1 text-xs text-ok">
              <Check size={14} /> Saved - connection verified.
            </span>
          )}
        </div>

        <InlineError message={error} />
      </div>
    </Panel>
  )
}
