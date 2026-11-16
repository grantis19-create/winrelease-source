import { useEffect, useRef, type ComponentType } from 'react'

export interface ContextMenuItem {
  label: string
  icon?: ComponentType<{ size?: number }>
  onSelect: () => void
  disabled?: boolean
  danger?: boolean
  /** Draws a divider above this item - groups related actions (e.g. Delete set apart from Rename/Paste). */
  separatorBefore?: boolean
}

/**
 * A right-click menu positioned at a fixed viewport point, closing on an outside click, Escape,
 * or after any item is chosen. Deliberately not a native browser context menu - `onContextMenu`
 * handlers upstream call `preventDefault()` and open this instead, the same pattern VS Code Web
 * and Google Drive use.
 */
export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: ContextMenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  // Keep the menu on-screen near the right/bottom viewport edges rather than clipping off it.
  const maxX = typeof window !== 'undefined' ? window.innerWidth - 200 : x
  const maxY = typeof window !== 'undefined' ? window.innerHeight - items.length * 30 - 16 : y

  return (
    <div
      ref={ref}
      style={{ position: 'fixed', top: Math.max(8, Math.min(y, maxY)), left: Math.max(8, Math.min(x, maxX)) }}
      className="z-50 min-w-48 overflow-hidden rounded-md border border-subtle bg-panel py-1 text-sm shadow-xl"
      role="menu"
    >
      {items.map((item, i) => (
        <div key={i}>
          {item.separatorBefore && <div className="my-1 border-t border-subtle" />}
          <button
            role="menuitem"
            onClick={() => {
              item.onSelect()
              onClose()
            }}
            disabled={item.disabled}
            className={`flex w-full items-center gap-2 px-3 py-1.5 text-left disabled:cursor-not-allowed disabled:opacity-40 ${
              item.danger ? 'text-danger hover:bg-danger/10' : 'text-ink hover:bg-panel-alt'
            }`}
          >
            {item.icon && <item.icon size={13} />}
            {item.label}
          </button>
        </div>
      ))}
    </div>
  )
}
