import { Copy, KeyRound, Pencil, Plus, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Panel } from '../ui/Panel'
import { Button } from '../ui/Button'
import { ContextMenu } from '../ui/ContextMenu'
import type { ContextMenuItem } from '../ui/ContextMenu'
import { EnvironmentVariableList } from './environment-variables/EnvironmentVariableList'
import type { EnvironmentVariableContextTarget } from './environment-variables/EnvironmentVariableList'
import { EnvironmentVariableDetailPanel } from './environment-variables/EnvironmentVariableDetailPanel'
import type { EnvironmentVariableEntry, WinReleaseManifest } from '../../types/manifest'

function newVariable(): EnvironmentVariableEntry {
  // System (HKLM) by default, not User (HKCU) - matches this product's own per-machine-only install
  // scope default (ADR 0005) and what other packaging tools default a fresh environment variable to.
  return { name: '', value: '', action: 'set', part: 'all', system: true, permanent: false, separator: ';' }
}

/**
 * System/user environment variables (ADR 0077) - same master-detail shape as Shortcuts
 * (EnvironmentVariableList + EnvironmentVariableDetailPanel), its own section on the page the same
 * way Shortcuts/Registry/Properties each are. Mirrors Advanced Installer's own "System Changes >
 * Environment" page, with its Component column dropped entirely - this product has no per-entry
 * Component concept for an environment variable to attach to (same reasoning WxsGenerator's
 * synthetic-marker Component already applies to Registry's RemoveValue/RemoveKey).
 */
export function EnvironmentVariablesSection({ manifest, onChange }: { manifest: WinReleaseManifest; onChange: (next: WinReleaseManifest) => void }) {
  const variables = manifest.environmentVariables ?? []
  const [selectedIndex, setSelectedIndex] = useState<number | null>(variables.length > 0 ? 0 : null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; target: EnvironmentVariableContextTarget } | null>(null)
  const [renamingIndex, setRenamingIndex] = useState<number | null>(null)
  const prevLengthRef = useRef(variables.length)

  useEffect(() => {
    if (variables.length > prevLengthRef.current) {
      setSelectedIndex(variables.length - 1)
    } else if (selectedIndex !== null && selectedIndex >= variables.length) {
      setSelectedIndex(variables.length > 0 ? variables.length - 1 : null)
    }
    prevLengthRef.current = variables.length
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variables.length])

  function update(index: number, patch: Partial<EnvironmentVariableEntry>) {
    onChange({ ...manifest, environmentVariables: variables.map((v, i) => (i === index ? { ...v, ...patch } : v)) })
  }

  function add() {
    onChange({ ...manifest, environmentVariables: [...variables, newVariable()] })
  }

  function duplicate(index: number) {
    const source = variables[index]
    if (!source) return
    onChange({ ...manifest, environmentVariables: [...variables.slice(0, index + 1), { ...source }, ...variables.slice(index + 1)] })
  }

  function remove(index: number) {
    onChange({ ...manifest, environmentVariables: variables.filter((_, i) => i !== index) })
  }

  function contextMenuItems(target: EnvironmentVariableContextTarget): ContextMenuItem[] {
    if (target.kind === 'empty') {
      return [{ label: 'New Variable', icon: Plus, onSelect: add }]
    }
    const { index } = target
    return [
      { label: 'New Variable', icon: Plus, onSelect: add },
      { label: 'Rename', icon: Pencil, separatorBefore: true, onSelect: () => setRenamingIndex(index) },
      { label: 'Duplicate', icon: Copy, onSelect: () => duplicate(index) },
      { label: 'Delete', icon: Trash2, danger: true, onSelect: () => remove(index) },
    ]
  }

  const selected = selectedIndex !== null ? variables[selectedIndex] : undefined

  return (
    <Panel
      icon={KeyRound}
      title="Environment Variables"
      defaultCollapsed
      description="System or per-user environment variables to set, create-if-missing, or remove - including PATH-style append/prepend."
      actions={
        <Button onClick={add}>
          <Plus size={14} /> New Variable
        </Button>
      }
    >
      <div className="flex gap-4">
        <EnvironmentVariableList
          manifest={manifest}
          selectedIndex={selectedIndex}
          onSelect={setSelectedIndex}
          onContextMenu={(x, y, target) => setContextMenu({ x, y, target })}
          renamingIndex={renamingIndex}
          onStartRename={setRenamingIndex}
          onRename={(index, name) => update(index, { name })}
          onStopRename={() => setRenamingIndex(null)}
        />
        {selected && selectedIndex !== null ? (
          <EnvironmentVariableDetailPanel entry={selected} index={selectedIndex} onUpdate={update} onRemove={remove} />
        ) : (
          <div className="flex min-w-0 flex-1 items-center justify-center rounded-md border border-dashed border-subtle p-6 text-center text-xs text-muted">
            {variables.length === 0 ? 'No environment variables yet - add one to configure it here.' : 'Select a variable on the left to edit it.'}
          </div>
        )}
      </div>

      {contextMenu && <ContextMenu x={contextMenu.x} y={contextMenu.y} items={contextMenuItems(contextMenu.target)} onClose={() => setContextMenu(null)} />}
    </Panel>
  )
}
