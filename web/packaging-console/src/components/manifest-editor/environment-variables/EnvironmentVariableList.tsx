import { KeyRound, ListTree, MoreVertical } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { MouseEvent } from 'react'
import type { EnvironmentVariableEntry, WinReleaseManifest } from '../../../types/manifest'

export type EnvironmentVariableContextTarget = { kind: 'row'; index: number } | { kind: 'empty' }

function scopeLabel(entry: EnvironmentVariableEntry): string {
  return entry.system ? 'System' : 'User'
}

/**
 * The grid half of Environment Variables' master-detail layout (EnvironmentVariableDetailPanel is
 * the other half) - mirrors ShortcutList/ShortcutDetailPanel's split exactly, the established
 * pattern for a manifest list whose entries carry more fields than a flat inline-editable table
 * (RegistryGrid/PropertiesSection's custom table) comfortably shows at once.
 */
export function EnvironmentVariableList({
  manifest,
  selectedIndex,
  onSelect,
  onContextMenu,
  renamingIndex,
  onStartRename,
  onRename,
  onStopRename,
}: {
  manifest: WinReleaseManifest
  selectedIndex: number | null
  onSelect: (index: number) => void
  onContextMenu: (x: number, y: number, target: EnvironmentVariableContextTarget) => void
  /** The row whose name is being edited in place (right-click > Rename, or F2). */
  renamingIndex: number | null
  onStartRename: (index: number) => void
  onRename: (index: number, name: string) => void
  onStopRename: () => void
}) {
  const variables = manifest.environmentVariables ?? []

  function rowContextMenu(index: number) {
    return (e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      onSelect(index)
      onContextMenu(e.clientX, e.clientY, { kind: 'row', index })
    }
  }

  return (
    <div
      className="flex w-72 shrink-0 flex-col rounded-md border border-subtle"
      onContextMenu={(e) => {
        e.preventDefault()
        onContextMenu(e.clientX, e.clientY, { kind: 'empty' })
      }}
    >
      <div className="flex items-center gap-2 border-b border-subtle bg-panel-alt px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
        <span className="flex-1">Name</span>
        <span className="w-14 shrink-0 text-right">Scope</span>
      </div>
      <div className="max-h-[60vh] overflow-auto">
        {variables.map((entry, index) => {
          const isSelected = index === selectedIndex
          return (
            <div
              key={index}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(index)}
              onKeyDown={(e) => {
                if (e.target !== e.currentTarget) return
                if (e.key === 'Enter') onSelect(index)
                if (e.key === 'F2') onStartRename(index)
              }}
              onContextMenu={rowContextMenu(index)}
              className={`flex cursor-pointer items-center gap-2 border-b border-subtle px-3 py-2 text-sm transition-colors ${
                isSelected ? 'bg-brand/10 text-ink' : 'text-ink hover:bg-panel-alt'
              }`}
            >
              <KeyRound size={13} className={`shrink-0 ${isSelected ? 'text-brand' : 'text-muted'}`} />
              {renamingIndex === index ? (
                <RenameInput value={entry.name} onCommit={(name) => onRename(index, name)} onDone={onStopRename} />
              ) : (
                <span className="min-w-0 flex-1 truncate" title={entry.name || '(unnamed)'} onDoubleClick={() => onStartRename(index)}>
                  {entry.name || '(unnamed)'}
                </span>
              )}
              <span className="w-14 shrink-0 truncate text-right text-[11px] text-muted">{scopeLabel(entry)}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  const rect = e.currentTarget.getBoundingClientRect()
                  onSelect(index)
                  onContextMenu(rect.right, rect.bottom, { kind: 'row', index })
                }}
                title="Actions"
                className="shrink-0 text-muted hover:text-ink"
              >
                <MoreVertical size={13} />
              </button>
            </div>
          )
        })}
        {variables.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-3 py-8 text-center text-xs text-muted">
            <ListTree size={18} className="text-muted/50" />
            <span>No environment variables yet. Right-click to add one.</span>
          </div>
        )}
      </div>
    </div>
  )
}

/** Edits a name in place: Enter or clicking away keeps it, Escape leaves it as it was. */
function RenameInput({ value, onCommit, onDone }: { value: string; onCommit: (name: string) => void; onDone: () => void }) {
  const ref = useRef<HTMLInputElement>(null)
  const cancelled = useRef(false)

  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])

  return (
    <input
      ref={ref}
      defaultValue={value}
      aria-label="Variable name"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          cancelled.current = true
          e.currentTarget.blur()
        }
      }}
      onBlur={(e) => {
        if (!cancelled.current && e.currentTarget.value !== value) onCommit(e.currentTarget.value)
        onDone()
      }}
      className="min-w-0 flex-1 rounded border border-brand bg-panel-alt px-1 py-0 text-sm text-ink outline-none"
    />
  )
}
