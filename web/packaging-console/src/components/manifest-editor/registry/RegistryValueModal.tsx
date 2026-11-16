import { useState } from 'react'
import { Modal } from '../../ui/Modal'
import { Button } from '../../ui/Button'
import { Field, TextInput } from '../../ui/Field'
import { fullRegistryKeyPath } from '../../../state/registryTargets'
import type { ActiveRegistryTarget } from '../../../state/registryTargets'
import type { RegistryEntry, RegistryEntryAction, RegistryValueType } from '../../../types/manifest'

const ACTIONS: { value: RegistryEntryAction; label: string }[] = [
  { value: 'write', label: 'Write a value' },
  { value: 'removeValue', label: 'Remove a value' },
  { value: 'removeKey', label: 'Remove this key' },
]

const VALUE_TYPES: { value: RegistryValueType; label: string }[] = [
  { value: 'string', label: 'String (REG_SZ)' },
  { value: 'expandString', label: 'Expandable String (REG_EXPAND_SZ)' },
  { value: 'integer', label: 'DWORD (REG_DWORD)' },
  { value: 'multiString', label: 'Multi-String (REG_MULTI_SZ)' },
  { value: 'binary', label: 'Binary (REG_BINARY)' },
]

const SELECT_CLASS = 'rounded-md border border-subtle bg-panel-alt px-2.5 py-1.5 text-sm text-ink outline-none focus:border-brand'

/** The one blank entry Add opens with - mirrors RegistrySection's own prior default (string, empty name/value). */
function blankEntry(target: ActiveRegistryTarget): RegistryEntry {
  return { root: target.root, key: target.keyPrefix, name: '', value: '', valueType: 'string', action: 'write' }
}

/**
 * A guided Add/Edit dialog for one registry entry - Name/Type/Value/removal-timing in clearly
 * labelled fields with OK/Cancel, replacing the grid's old in-place cell editing (a half-filled raw
 * table row read as "a box to manually manicure," not guided). Matches how real regedit-style tools
 * (Advanced Installer's own "Add Registry Row" dialog, and regedit.exe itself - double-click a value
 * to edit it in a popup, never inline) actually do this. The Key itself isn't a field here: Add only
 * ever opens with a specific key already selected in the tree (RegistrySection disables Add
 * otherwise), and editing an existing entry's Key, when the hive-root view's own Key column needs to
 * change it, stays inline there - a "which key" navigation concern, not a value's own Name/Type/Value.
 */
export function RegistryValueModal({
  target,
  initialEntry,
  onClose,
  onSave,
}: {
  target: ActiveRegistryTarget
  /** Undefined = Add (starts blank); set = Edit (starts pre-filled with this entry's own values). */
  initialEntry?: RegistryEntry
  onClose: () => void
  onSave: (entry: RegistryEntry) => void
}) {
  const [entry, setEntry] = useState<RegistryEntry>(initialEntry ?? blankEntry(target))
  const action = entry.action ?? 'write'

  function update(patch: Partial<RegistryEntry>) {
    setEntry((prev) => ({ ...prev, ...patch }))
  }

  return (
    <Modal title={initialEntry ? 'Edit Registry Value' : 'Add Registry Value'} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div className="truncate rounded-md border border-subtle bg-panel-alt px-3 py-2 text-xs text-muted">
          Under: <span className="text-ink">{fullRegistryKeyPath(target)}</span>
        </div>

        <Field label="Action">
          <select value={action} onChange={(e) => update({ action: e.target.value as RegistryEntryAction })} className={SELECT_CLASS}>
            {ACTIONS.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </Field>

        {action !== 'removeKey' && (
          <Field label="Value Name" hint="Leave blank for the key's default (unnamed) value.">
            <TextInput value={entry.name} onChange={(e) => update({ name: e.target.value })} placeholder="(default)" />
          </Field>
        )}

        {action === 'write' && (
          <>
            <Field label="Type">
              <select value={entry.valueType} onChange={(e) => update({ valueType: e.target.value as RegistryValueType })} className={SELECT_CLASS}>
                {VALUE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Value">
              <TextInput value={entry.value} onChange={(e) => update({ value: e.target.value })} />
            </Field>
          </>
        )}

        {action === 'removeKey' && (
          <Field
            label="When"
            hint="Removing a single value always happens at install time (verified against the real WiX CLI, which has no uninstall-timing option for that case) - only a whole-key removal can target either moment."
          >
            <select
              value={entry.removeOnUninstall ? 'uninstall' : 'install'}
              onChange={(e) => update({ removeOnUninstall: e.target.value === 'uninstall' })}
              className={SELECT_CLASS}
            >
              <option value="install">On install</option>
              <option value="uninstall">On uninstall</option>
            </select>
          </Field>
        )}

        <div className="mt-1 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              onSave(entry)
              onClose()
            }}
          >
            OK
          </Button>
        </div>
      </div>
    </Modal>
  )
}
