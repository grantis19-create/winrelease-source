import { AlertTriangle, AppWindow, Link2, MoreVertical } from 'lucide-react'
import type { MouseEvent } from 'react'
import { describeShortcutLocation } from '../../../state/installTargets'
import type { Shortcut, WinReleaseManifest } from '../../../types/manifest'

export type ShortcutContextTarget = { kind: 'row'; index: number } | { kind: 'empty' }

/** True when the row's target (declared-file reference or custom path) is missing/dangling - mirrors ShortcutDetailPanel's own field-level warnings, surfaced here too so a problem is visible without having to select the row first. */
function hasTargetWarning(shortcut: Shortcut, declaredIds: string[]): boolean {
  if (shortcut.targetFileId) return shortcut.targetFileId !== '' && !declaredIds.includes(shortcut.targetFileId)
  return !shortcut.targetPath
}

/**
 * The grid half of Shortcuts' master-detail layout (ShortcutDetailPanel is the other half) - a
 * compact, click-to-select list with a right-click Add/Remove/Duplicate menu (ShortcutsSection owns
 * the actual ContextMenu), replacing the old one-big-form-per-shortcut layout with something closer
 * to a real packaging tool's Shortcuts table.
 */
export function ShortcutList({
  manifest,
  selectedIndex,
  onSelect,
  onContextMenu,
}: {
  manifest: WinReleaseManifest
  selectedIndex: number | null
  onSelect: (index: number) => void
  onContextMenu: (x: number, y: number, target: ShortcutContextTarget) => void
}) {
  const shortcuts = manifest.shortcuts
  const declaredIds = manifest.files.declared.map((f) => f.id)

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
        <span className="w-20 shrink-0 text-right">Location</span>
      </div>
      <div className="max-h-[60vh] overflow-auto">
        {shortcuts.map((shortcut, index) => {
          const isSelected = index === selectedIndex
          const warning = hasTargetWarning(shortcut, declaredIds)
          return (
            <div
              key={index}
              id={`shortcut-${index}`}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(index)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSelect(index)
              }}
              onContextMenu={rowContextMenu(index)}
              className={`scroll-mt-28 flex cursor-pointer items-center gap-2 border-b border-subtle px-3 py-2 text-sm transition-colors ${
                isSelected ? 'bg-brand/10 text-ink' : 'text-ink hover:bg-panel-alt'
              }`}
            >
              <Link2 size={13} className={`shrink-0 ${isSelected ? 'text-brand' : 'text-muted'}`} />
              <span className="min-w-0 flex-1 truncate" title={shortcut.name || '(untitled)'}>
                {shortcut.name || '(untitled)'}
              </span>
              {warning && (
                <span title="Target needs attention">
                  <AlertTriangle size={12} className="shrink-0 text-danger" />
                </span>
              )}
              <span className="w-20 shrink-0 truncate text-right text-[11px] text-muted" title={describeShortcutLocation(manifest, shortcut.location)}>
                {describeShortcutLocation(manifest, shortcut.location)}
              </span>
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
        {shortcuts.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-3 py-8 text-center text-xs text-muted">
            <AppWindow size={18} className="text-muted/50" />
            <span>No shortcuts yet. Right-click to add one.</span>
          </div>
        )}
      </div>
    </div>
  )
}
