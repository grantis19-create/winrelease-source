import { AlertTriangle, Pencil, Trash2 } from 'lucide-react'
import type { MouseEvent } from 'react'
import { entriesAtTarget, wowRegistryKind } from '../../../state/registryTargets'
import { unknownPropertyReferences, unknownPropertyWarning } from '../../../state/msiFormatted'
import type { ActiveRegistryTarget } from '../../../state/registryTargets'
import type { RegistryEntryAction, WinReleaseManifest } from '../../../types/manifest'

const ACTION_LABELS: Record<RegistryEntryAction, string> = {
  write: 'Write',
  removeValue: 'Remove Value',
  removeKey: 'Remove Key',
}

export function RegistryGrid({
  manifest,
  activeTarget,
  onChange,
  onSelectTarget,
  onEdit,
  onContextMenu,
}: {
  manifest: WinReleaseManifest
  activeTarget: ActiveRegistryTarget
  onChange: (next: WinReleaseManifest) => void
  /** The hive-root view's Key cell jumps to that key in the tree - keys are edited there (Rename), never re-typed per row. */
  onSelectTarget: (target: ActiveRegistryTarget) => void
  /** Opens the Add/Edit Registry Value modal for this row - double-click, or the pencil button. */
  onEdit: (index: number) => void
  /** index is null for the empty grid area/background (not any particular row) - "Add Value" there, no row-specific actions. */
  onContextMenu: (x: number, y: number, index: number | null) => void
}) {
  const entries = entriesAtTarget(manifest, activeTarget)
  // Keys live in the tree on the left, values on the right. Only the hive-root view mixes keys, so only it shows which key each row is in -
  // as a link to that key, not an editable box (keys are renamed in the tree).
  const showKeyColumn = activeTarget.keyPrefix === ''

  function remove(index: number) {
    onChange({ ...manifest, registry: manifest.registry.filter((_, i) => i !== index) })
  }

  function rowContextMenu(index: number) {
    return (e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      onContextMenu(e.clientX, e.clientY, index)
    }
  }

  return (
    <div
      className="min-w-0 flex-1"
      onContextMenu={(e) => {
        e.preventDefault()
        onContextMenu(e.clientX, e.clientY, null)
      }}
    >
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-muted">
            {showKeyColumn && <th className="pb-2 pr-2 font-medium">Key</th>}
            <th className="pb-2 pr-2 font-medium">Action</th>
            <th className="pb-2 pr-2 font-medium">Value Name</th>
            <th className="pb-2 pr-2 font-medium">Type</th>
            <th className="pb-2 font-medium">Value</th>
            <th className="w-16" />
          </tr>
        </thead>
        <tbody className="divide-y divide-subtle">
          {entries.map(({ entry, index }) => {
            const action = entry.action ?? 'write'
            const isWrite = action === 'write'
            const isRemoveKey = action === 'removeKey'
            const unknown = unknownPropertyReferences([entry.key, entry.name, isWrite ? entry.value : ''].join('\n'), manifest)
            const wow = wowRegistryKind(entry.root, entry.key)
            const bits32 = wow === 'redirected'
            const isX86Package = manifest.architecture === 'x86'
            return (
              <tr
                key={index}
                onContextMenu={rowContextMenu(index)}
                onDoubleClick={() => onEdit(index)}
                className="cursor-pointer hover:bg-panel-alt"
              >
                {showKeyColumn && (
                  <td className="max-w-0 py-1.5 pr-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onSelectTarget({ root: entry.root, keyPrefix: entry.key })
                      }}
                      className="block max-w-full truncate text-left text-ink hover:text-brand hover:underline"
                      title={`Open ${entry.key}`}
                    >
                      {entry.key}
                    </button>
                  </td>
                )}
                <td className="py-1.5 pr-2 text-ink">{ACTION_LABELS[action]}</td>
                <td className="py-1.5 pr-2 text-ink">
                  <span className="flex items-center gap-1.5">
                    {isRemoveKey ? <span className="text-muted">—</span> : entry.name || <span className="text-muted">(default)</span>}
                    {unknown.length > 0 && (
                      <span className="text-warn" title={unknownPropertyWarning(unknown)}>
                        <AlertTriangle size={13} />
                      </span>
                    )}
                    {bits32 && (
                      <span className="rounded bg-panel-alt px-1 text-[10px] text-muted" title={
                          isX86Package
                            ? 'Under WOW6432Node: this is a 32-bit package, so the key goes to the 32-bit view of the registry (the same place as the key without WOW6432Node).'
                            : 'Under WOW6432Node: installed into the 32-bit view of the registry.'
                        }
                      >
                        32-bit
                      </span>
                    )}
                    {wow === 'literal' && (
                      <span
                        className="rounded bg-panel-alt px-1 text-[10px] text-muted"
                        title="Windows does not redirect 32-bit programs at this spot, so this key is written exactly as typed, WOW6432Node and all."
                      >
                        as typed
                      </span>
                    )}
                  </span>
                </td>
                <td className="py-1.5 pr-2 text-muted">{isWrite ? entry.valueType : '—'}</td>
                <td className="max-w-0 truncate py-1.5 pr-2 text-ink" title={isWrite ? entry.value : undefined}>
                  {isWrite ? entry.value || <span className="text-muted">(empty)</span> : '—'}
                </td>
                <td>
                  <div className="flex items-center gap-2">
                    <button onClick={() => onEdit(index)} className="text-muted hover:text-brand" title="Edit">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => remove(index)} className="text-muted hover:text-danger" title="Remove">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
          {entries.length === 0 && (
            <tr>
              <td colSpan={showKeyColumn ? 6 : 5} className="py-6 text-center text-xs text-muted">
                {showKeyColumn
                  ? 'No entries in this hive yet. Right-click a hive on the left and choose New Key to get started.'
                  : 'No entries here yet. Right-click to add one.'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
