import { Copy, Link2, Plus, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Panel } from '../ui/Panel'
import { Button } from '../ui/Button'
import { ContextMenu } from '../ui/ContextMenu'
import type { ContextMenuItem } from '../ui/ContextMenu'
import { workingDirectorySentinelForInstallPath } from '../../state/installTargets'
import { executableShortcutDefaults } from '../../state/fileMetadata'
import { ShortcutList } from './shortcuts/ShortcutList'
import type { ShortcutContextTarget } from './shortcuts/ShortcutList'
import { ShortcutDetailPanel } from './shortcuts/ShortcutDetailPanel'
import { SHORTCUT_LOCATIONS } from '../../types/manifest'
import type { Shortcut, WinReleaseManifest } from '../../types/manifest'

const ICON_EXTENSION = /\.(ico|exe)$/i

/** Every staged file's sourcePath whose extension WiX can actually use for a Shortcut's Icon (.ico, or an .exe to pull its embedded icon from) - the pool the "Browse…" picker offers, deduped since the same source can be declared into multiple install locations. */
function iconCandidatesFor(manifest: WinReleaseManifest): string[] {
  return [...new Set(manifest.files.declared.filter((f) => ICON_EXTENSION.test(f.sourcePath)).map((f) => f.sourcePath))]
}

/**
 * A grid of shortcuts (ShortcutList) + a properties pane for whichever one is selected
 * (ShortcutDetailPanel) - a real packaging-tool-style master-detail layout, replacing the old
 * layout of every shortcut's full field set expanded inline at once (the same transformation
 * Files & Folders and Registry already got - see ADR 0033).
 */
export function ShortcutsSection({
  manifest,
  onChange,
  primaryFileId,
  sourceFiles,
  onStageFiles,
}: {
  manifest: WinReleaseManifest
  onChange: (next: WinReleaseManifest) => void
  primaryFileId: string | null
  /** Staged file blobs (session-local, keyed by sourcePath) - lets the icon picker show a real .ico preview instead of just a filename. */
  sourceFiles: Map<string, File>
  /** Stages a freshly-uploaded icon file into the build sources (ShortcutDetailPanel's "Upload" button) - same mechanism Files & Folders' Add Files uses. */
  onStageFiles: (entries: { path: string; file: File }[]) => void
}) {
  const shortcuts = manifest.shortcuts
  const declaredIds = manifest.files.declared.map((f) => f.id)
  const iconCandidates = iconCandidatesFor(manifest)

  const [selectedIndex, setSelectedIndex] = useState<number | null>(shortcuts.length > 0 ? 0 : null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; target: ShortcutContextTarget } | null>(null)
  const prevLengthRef = useRef(shortcuts.length)

  // Keeps selection pointed at a real row: a newly-added shortcut (from here or from Files &
  // Folders' "Create Shortcut" action, which only has `manifest.shortcuts` to append to) becomes
  // the selection so its properties are immediately visible, and a removal clamps back onto the
  // last remaining row instead of pointing past the end of the array.
  useEffect(() => {
    if (shortcuts.length > prevLengthRef.current) {
      setSelectedIndex(shortcuts.length - 1)
    } else if (selectedIndex !== null && selectedIndex >= shortcuts.length) {
      setSelectedIndex(shortcuts.length > 0 ? shortcuts.length - 1 : null)
    }
    prevLengthRef.current = shortcuts.length
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shortcuts.length])

  // Files & Folders' "Referenced By" column links to `#shortcut-{index}` (manifestDraft.ts'
  // referencedByFor) - a plain anchor would scroll the row into view but leave the detail panel
  // showing whatever was selected before, so pick up the hash here and select+scroll explicitly.
  useEffect(() => {
    function selectFromHash() {
      const match = /^#shortcut-(\d+)$/.exec(window.location.hash)
      if (!match) return
      const index = Number(match[1])
      if (index >= 0 && index < shortcuts.length) {
        setSelectedIndex(index)
        document.getElementById(`shortcut-${index}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
    }
    selectFromHash()
    window.addEventListener('hashchange', selectFromHash)
    return () => window.removeEventListener('hashchange', selectFromHash)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shortcuts.length])

  function update(index: number, patch: Partial<Shortcut>) {
    onChange({ ...manifest, shortcuts: shortcuts.map((s, i) => (i === index ? { ...s, ...patch } : s)) })
  }

  function add() {
    const fileId = primaryFileId ?? declaredIds[0] ?? ''
    const file = manifest.files.declared.find((f) => f.id === fileId)
    const defaults = file ? executableShortcutDefaults(file) : {}
    onChange({
      ...manifest,
      shortcuts: [
        ...shortcuts,
        {
          name: defaults.name ?? '',
          targetFileId: fileId,
          location: SHORTCUT_LOCATIONS.programMenuFolder,
          workingDirectory: file ? workingDirectorySentinelForInstallPath(file.root, file.installPath) : undefined,
          iconPath: defaults.iconPath ?? null,
        },
      ],
    })
  }

  function duplicate(index: number) {
    const source = shortcuts[index]
    if (!source) return
    const copy: Shortcut = { ...source, name: source.name ? `${source.name} (copy)` : source.name }
    onChange({ ...manifest, shortcuts: [...shortcuts.slice(0, index + 1), copy, ...shortcuts.slice(index + 1)] })
  }

  function remove(index: number) {
    onChange({ ...manifest, shortcuts: shortcuts.filter((_, i) => i !== index) })
  }

  function contextMenuItems(target: ShortcutContextTarget): ContextMenuItem[] {
    if (target.kind === 'empty') {
      return [{ label: 'Add Shortcut', icon: Plus, onSelect: add }]
    }
    const { index } = target
    return [
      { label: 'Add Shortcut', icon: Plus, onSelect: add },
      { label: 'Duplicate', icon: Copy, separatorBefore: true, onSelect: () => duplicate(index) },
      { label: 'Remove', icon: Trash2, danger: true, onSelect: () => remove(index) },
    ]
  }

  const selected = selectedIndex !== null ? shortcuts[selectedIndex] : undefined

  return (
    <Panel
      icon={Link2}
      title="Shortcuts"
      defaultCollapsed
      actions={
        <Button onClick={add}>
          <Plus size={14} /> Add Shortcut
        </Button>
      }
    >
      <div className="flex gap-4">
        <ShortcutList manifest={manifest} selectedIndex={selectedIndex} onSelect={setSelectedIndex} onContextMenu={(x, y, target) => setContextMenu({ x, y, target })} />
        {selected && selectedIndex !== null ? (
          <ShortcutDetailPanel
            manifest={manifest}
            shortcut={selected}
            index={selectedIndex}
            onUpdate={update}
            onRemove={remove}
            iconCandidates={iconCandidates}
            sourceFiles={sourceFiles}
            onStageFiles={onStageFiles}
          />
        ) : (
          <div className="flex min-w-0 flex-1 items-center justify-center rounded-md border border-dashed border-subtle p-6 text-center text-xs text-muted">
            {shortcuts.length === 0 ? 'No shortcuts yet - add one to configure it here.' : 'Select a shortcut on the left to edit it.'}
          </div>
        )}
      </div>

      {contextMenu && <ContextMenu x={contextMenu.x} y={contextMenu.y} items={contextMenuItems(contextMenu.target)} onClose={() => setContextMenu(null)} />}
    </Panel>
  )
}
