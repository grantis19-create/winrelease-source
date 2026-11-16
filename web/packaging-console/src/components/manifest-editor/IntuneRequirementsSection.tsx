import { CloudCog } from 'lucide-react'
import { Panel } from '../ui/Panel'
import { Field, TextInput } from '../ui/Field'
import type { IntuneArchitecture, WinReleaseManifest } from '../../types/manifest'

const ARCHITECTURES: IntuneArchitecture[] = ['x86', 'x64', 'arm64']

export function IntuneRequirementsSection({
  manifest,
  onChange,
}: {
  manifest: WinReleaseManifest
  onChange: (next: WinReleaseManifest) => void
}) {
  const enabled = manifest.intune?.requirements != null
  const requirements = manifest.intune?.requirements ?? {}

  function setRequirements(patch: Partial<typeof requirements>) {
    onChange({ ...manifest, intune: { requirements: { ...requirements, ...patch } } })
  }

  return (
    <Panel
      icon={CloudCog}
      title="Intune Requirements"
      defaultCollapsed
      description="Optional minimum OS version and architecture for the Intune Win32 app package. Detection is always based on the MSI itself, so no separate detection rule is needed here."
      actions={
        <label className="flex items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onChange({ ...manifest, intune: e.target.checked ? { requirements: {} } : undefined })}
          />
          Set requirements
        </label>
      }
    >
      {enabled && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Minimum OS Version">
            <TextInput
              value={requirements.minimumOSVersion ?? ''}
              onChange={(e) => setRequirements({ minimumOSVersion: e.target.value })}
              placeholder="10.0.19041"
            />
          </Field>
          <Field label="Architecture">
            <select
              value={requirements.architecture ?? ''}
              onChange={(e) => setRequirements({ architecture: (e.target.value || undefined) as IntuneArchitecture })}
              className="rounded-md border border-subtle bg-panel-alt px-2.5 py-1.5 text-sm text-ink outline-none focus:border-brand"
            >
              <option value="">— any —</option>
              {ARCHITECTURES.map((arch) => (
                <option key={arch} value={arch}>
                  {arch}
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}
    </Panel>
  )
}
