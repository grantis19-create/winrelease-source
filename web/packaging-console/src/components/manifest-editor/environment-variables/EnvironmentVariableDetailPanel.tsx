import { KeyRound, Trash2 } from 'lucide-react'
import { Field, TextInput } from '../../ui/Field'
import { Toggle } from '../../ui/Toggle'
import type { EnvironmentVariableAction, EnvironmentVariableEntry, EnvironmentVariablePart } from '../../../types/manifest'

const ON_INSTALL_OPTIONS: { value: EnvironmentVariableAction; label: string; hint: string }[] = [
  { value: 'set', label: 'Create or update', hint: 'Always writes the value, overwriting anything already there.' },
  { value: 'create', label: 'Create only', hint: "Writes the value only if the variable doesn't already exist - leaves an existing one alone." },
  { value: 'remove', label: 'Remove', hint: 'Deletes the variable at install time.' },
]

const BEHAVIOR_OPTIONS: { value: EnvironmentVariablePart; label: string }[] = [
  { value: 'all', label: 'Replace' },
  { value: 'first', label: 'Prepend' },
  { value: 'last', label: 'Append' },
]

/**
 * The properties half of Environment Variables' master-detail layout (EnvironmentVariableList is
 * the other half) - mirrors ShortcutDetailPanel's shape. Behavior/Separator are disabled for
 * "Create only" because WiX's own Environment/@Part can't be specified alongside Action="create" at
 * all (verified against the real `wix` CLI - WIX0035), not an arbitrary UI restriction.
 */
export function EnvironmentVariableDetailPanel({
  entry,
  index,
  onUpdate,
  onRemove,
}: {
  entry: EnvironmentVariableEntry
  index: number
  onUpdate: (index: number, patch: Partial<EnvironmentVariableEntry>) => void
  onRemove: (index: number) => void
}) {
  function update(patch: Partial<EnvironmentVariableEntry>) {
    onUpdate(index, patch)
  }

  const canChooseBehavior = entry.action !== 'create'
  const canEditSeparator = canChooseBehavior && entry.part !== 'all'

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4 rounded-md border border-subtle bg-panel-alt p-4">
      <div className="flex items-start gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-subtle bg-panel">
          <KeyRound size={26} className="text-muted/50" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <Field label="Name">
            <TextInput value={entry.name} onChange={(e) => update({ name: e.target.value })} placeholder="ACME_HOME" />
          </Field>
          <Field label="Value" hint={entry.action === 'remove' ? 'Ignored for Remove - nothing is written, the variable is just deleted.' : undefined}>
            <TextInput value={entry.value} onChange={(e) => update({ value: e.target.value })} disabled={entry.action === 'remove'} placeholder="[INSTALLFOLDER]" />
          </Field>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="On Install" hint={ON_INSTALL_OPTIONS.find((o) => o.value === entry.action)?.hint}>
          <select
            value={entry.action}
            onChange={(e) => {
              const action = e.target.value as EnvironmentVariableAction
              // WiX rejects Part alongside Action="create" outright - reset Behavior back to the
              // default rather than leaving a stale Prepend/Append silently dropped at build time.
              update(action === 'create' ? { action, part: 'all' } : { action })
            }}
            className="rounded-md border border-subtle bg-panel px-2.5 py-1.5 text-sm text-ink outline-none focus:border-brand"
          >
            {ON_INSTALL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Scope">
          <div className="flex rounded-md border border-subtle text-xs">
            <button
              type="button"
              onClick={() => update({ system: false })}
              className={`flex-1 rounded-l-md px-3 py-1.5 ${!entry.system ? 'bg-brand/10 text-brand' : 'text-muted hover:text-ink'}`}
            >
              User
            </button>
            <button
              type="button"
              onClick={() => update({ system: true })}
              className={`flex-1 rounded-r-md px-3 py-1.5 ${entry.system ? 'bg-brand/10 text-brand' : 'text-muted hover:text-ink'}`}
            >
              System
            </button>
          </div>
        </Field>

        <Field
          label="When Existing"
          hint={entry.action === 'create' ? "Not available for \"Create only\" - WiX's own Environment element forbids combining the two." : 'Replace overwrites the variable outright; Prepend/Append add Value using Separator - the PATH-style "add my folder" case.'}
        >
          <select
            value={entry.part}
            onChange={(e) => update({ part: e.target.value as EnvironmentVariablePart })}
            disabled={!canChooseBehavior}
            className="rounded-md border border-subtle bg-panel px-2.5 py-1.5 text-sm text-ink outline-none focus:border-brand disabled:opacity-60"
          >
            {BEHAVIOR_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Separator">
          <TextInput value={entry.separator} onChange={(e) => update({ separator: e.target.value })} disabled={!canEditSeparator} placeholder=";" />
        </Field>
      </div>

      <Field label="Remove on Uninstall">
        <Toggle
          checked={!entry.permanent}
          label={entry.permanent ? 'Kept after uninstall' : 'Removed on uninstall'}
          onChange={(checked) => update({ permanent: !checked })}
          disabled={entry.action === 'remove'}
        />
      </Field>
      <p className="-mt-2 text-[11px] text-muted">
        {entry.action === 'remove'
          ? "Doesn't apply to Remove - there's nothing left behind to clean up."
          : "On: Windows Installer deletes this variable (or undoes the append) when the product is uninstalled. Off: it's left behind permanently."}
      </p>

      <button onClick={() => onRemove(index)} className="mt-auto flex w-fit items-center gap-1.5 text-xs text-danger hover:underline">
        <Trash2 size={13} /> Remove variable
      </button>
    </div>
  )
}
