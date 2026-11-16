import { Copy, Database, FileCode, FolderPlus, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { Panel } from '../ui/Panel'
import { Button } from '../ui/Button'
import { ContextMenu } from '../ui/ContextMenu'
import type { ContextMenuItem } from '../ui/ContextMenu'
import { HiveTree } from './registry/HiveTree'
import { RegistryGrid } from './registry/RegistryGrid'
import { RegistryValueModal } from './registry/RegistryValueModal'
import { parseRegFile } from '../../state/regFileParser'
import { unknownPropertyReferences, unknownPropertyWarning } from '../../state/msiFormatted'
import {
  deleteRegistryKey,
  entryCountUnderTarget,
  fullRegistryKeyPath,
  joinRegistryKey,
  keyNameError,
  renameRegistryKey,
  subkeysUnderTarget,
} from '../../state/registryTargets'
import type { ActiveRegistryTarget } from '../../state/registryTargets'
import type { RegistryEntry, WinReleaseManifest } from '../../types/manifest'

export function RegistrySection({
  manifest,
  onChange,
  primaryFileId,
}: {
  manifest: WinReleaseManifest
  onChange: (next: WinReleaseManifest) => void
  primaryFileId: string | null
}) {
  // Opens on the first key that holds values, so the right-hand side shows values rather than a hive-wide list.
  const [activeTarget, setActiveTarget] = useState<ActiveRegistryTarget>(() =>
    manifest.registry[0] ? { root: manifest.registry[0].root, keyPrefix: manifest.registry[0].key } : { root: 'hklm', keyPrefix: '' },
  )
  const [importWarnings, setImportWarnings] = useState<string[]>([])
  const [keyWarnings, setKeyWarnings] = useState<string[]>([])
  // New Key has nothing to add to manifest.registry yet (an empty key is meaningless to WiX/MSI
  // until it holds at least one value) - tracked here the same way FilesSection's pendingFolders
  // covers an empty folder, purely so the tree can render and navigate into it. Genuinely
  // ephemeral: a key still empty when the project reloads won't come back, same as an empty folder.
  const [pendingKeys, setPendingKeys] = useState<Record<string, string[]>>({})
  const [contextMenu, setContextMenu] = useState<
    | { x: number; y: number; kind: 'key'; target: ActiveRegistryTarget; isRoot: boolean }
    | { x: number; y: number; kind: 'value'; index: number | null }
    | null
  >(null)
  // Add Registry Value / Edit Registry Value modal (ADR 0081) - index null = Add (opens blank under
  // `target`), index set = Edit (opens pre-filled with manifest.registry[index], `target` is that
  // entry's own root/key purely for the modal's "Under: ..." header).
  const [valueModal, setValueModal] = useState<{ target: ActiveRegistryTarget; index: number | null } | null>(null)
  const regInputRef = useRef<HTMLInputElement>(null)

  function siblingKeyNames(root: ActiveRegistryTarget['root'], parentPrefix: string): Set<string> {
    return new Set([...subkeysUnderTarget(manifest, { root, keyPrefix: parentPrefix }), ...(pendingKeys[`${root}:${parentPrefix}`] ?? [])])
  }

  function openAddValueModal(target: ActiveRegistryTarget) {
    // No guessed key, not even "Software" - verified against the real `wix` CLI, Key="" and an
    // omitted Key are both hard build errors (WIX0006/WIX0010), so a bare hive root genuinely isn't
    // a writable location at all, not just an unopinionated one. Every call site below disables
    // itself for the hive-root case instead - this guard is just the defensive backstop.
    if (target.keyPrefix === '') return
    setActiveTarget(target)
    setValueModal({ target, index: null })
  }

  function openEditValueModal(index: number) {
    const existing = manifest.registry[index]
    if (!existing) return
    setValueModal({ target: { root: existing.root, keyPrefix: existing.key }, index })
  }

  /** The modal's own OK button - appends (Add) or replaces by index (Edit). Root/Key are never touched here: Add seeds them from `target` once (RegistryValueModal's blankEntry), Edit leaves the existing entry's own root/key exactly as they were, since nothing in the dialog edits "which key" - that's the grid's own inline Key column (hive-root view only). */
  function saveValueModal(entry: RegistryEntry) {
    if (!valueModal) return
    onChange({
      ...manifest,
      registry: valueModal.index === null
        ? [...manifest.registry, entry]
        : manifest.registry.map((e, i) => (i === valueModal.index ? entry : e)),
    })
  }

  function duplicateEntry(index: number) {
    const source = manifest.registry[index]
    if (!source) return
    onChange({ ...manifest, registry: [...manifest.registry.slice(0, index + 1), { ...source }, ...manifest.registry.slice(index + 1)] })
  }

  function removeEntry(index: number) {
    onChange({ ...manifest, registry: manifest.registry.filter((_, i) => i !== index) })
  }

  function createKey(target: ActiveRegistryTarget, rawName: string) {
    const name = rawName.trim()
    if (name.length === 0) return // blank submission - treat as cancelled, not an error to explain
    const error = keyNameError(rawName)
    if (error) {
      setKeyWarnings([`Can't create "${rawName}" - ${error}`])
      return
    }
    if (siblingKeyNames(target.root, target.keyPrefix).has(name)) {
      setKeyWarnings([`A key named "${name}" already exists there.`])
      return
    }

    const key = `${target.root}:${target.keyPrefix}`
    setPendingKeys((prev) => ({ ...prev, [key]: [...(prev[key] ?? []), name] }))
    setActiveTarget({ root: target.root, keyPrefix: joinRegistryKey(target.keyPrefix, name) })
  }

  function renameKeyAt(target: ActiveRegistryTarget, rawNewName: string) {
    const newName = rawNewName.trim()
    if (newName.length === 0) return
    const error = keyNameError(rawNewName)
    if (error) {
      setKeyWarnings([`Can't rename to "${rawNewName}" - ${error}`])
      return
    }

    const segments = target.keyPrefix.split('\\')
    const oldName = segments[segments.length - 1]
    const parentPrefix = segments.slice(0, -1).join('\\')

    if (newName !== oldName && siblingKeyNames(target.root, parentPrefix).has(newName)) {
      setKeyWarnings([`A key named "${newName}" already exists there.`])
      return
    }

    const newPrefix = joinRegistryKey(parentPrefix, newName)
    onChange(renameRegistryKey(manifest, target.root, target.keyPrefix, newPrefix))

    setPendingKeys((prev) => {
      const parentKey = `${target.root}:${parentPrefix}`
      const oldPrefixKey = `${target.root}:${target.keyPrefix}`
      const next: Record<string, string[]> = {}
      for (const [key, names] of Object.entries(prev)) {
        if (key === parentKey) {
          next[key] = names.map((n) => (n === oldName ? newName : n))
        } else if (key === oldPrefixKey) {
          next[`${target.root}:${newPrefix}`] = names
        } else if (key.startsWith(`${oldPrefixKey}\\`)) {
          next[`${target.root}:${newPrefix}${key.slice(oldPrefixKey.length)}`] = names
        } else {
          next[key] = names
        }
      }
      return next
    })

    if (activeTarget.root === target.root && (activeTarget.keyPrefix === target.keyPrefix || activeTarget.keyPrefix.startsWith(`${target.keyPrefix}\\`))) {
      setActiveTarget({ root: target.root, keyPrefix: newPrefix + activeTarget.keyPrefix.slice(target.keyPrefix.length) })
    }
  }

  function deleteKeyAt(target: ActiveRegistryTarget) {
    const segments = target.keyPrefix.split('\\')
    const name = segments[segments.length - 1]
    const parentPrefix = segments.slice(0, -1).join('\\')
    const entryCount = entryCountUnderTarget(manifest, target)
    const message = entryCount > 0 ? `Delete "${name}" and ${entryCount} value(s) inside it? This can't be undone.` : `Delete "${name}"?`
    if (!window.confirm(message)) return

    onChange(deleteRegistryKey(manifest, target.root, target.keyPrefix))

    setPendingKeys((prev) => {
      const prefixKey = `${target.root}:${target.keyPrefix}`
      const parentKey = `${target.root}:${parentPrefix}`
      const next: Record<string, string[]> = {}
      for (const [key, names] of Object.entries(prev)) {
        if (key === prefixKey || key.startsWith(`${prefixKey}\\`)) continue
        next[key] = key === parentKey ? names.filter((n) => n !== name) : names
      }
      return next
    })

    if (activeTarget.root === target.root && (activeTarget.keyPrefix === target.keyPrefix || activeTarget.keyPrefix.startsWith(`${target.keyPrefix}\\`))) {
      setActiveTarget({ root: target.root, keyPrefix: parentPrefix })
    }
  }

  async function copyKeyName(target: ActiveRegistryTarget) {
    try {
      await navigator.clipboard.writeText(fullRegistryKeyPath(target))
    } catch {
      // Best-effort only - a blocked/private-mode clipboard just means the click quietly does nothing.
    }
  }

  function addRunOnStartupPreset() {
    const primaryFile = manifest.files.declared.find((f) => f.id === primaryFileId)
    const command = primaryFile ? `[INSTALLFOLDER]${primaryFile.installPath.split('/').pop()}` : '[INSTALLFOLDER]App.exe'
    const key = 'Software\\Microsoft\\Windows\\CurrentVersion\\Run'

    onChange({
      ...manifest,
      registry: [
        ...manifest.registry,
        { root: 'hkcu', key, name: manifest.name || 'App', value: command, valueType: 'string' },
      ],
    })
    // Otherwise the grid keeps showing whatever key was selected before - the new entry landed
    // in the manifest but nothing on screen would suggest the click actually did anything.
    setActiveTarget({ root: 'hkcu', keyPrefix: key })
  }

  function addCustomUrlSchemePreset() {
    const scheme = window.prompt('URL scheme (e.g. "myapp" for myapp://...)')
    if (!scheme) return

    const primaryFile = manifest.files.declared.find((f) => f.id === primaryFileId)
    const command = primaryFile ? `"[INSTALLFOLDER]${primaryFile.installPath.split('/').pop()}" "%1"` : '"[INSTALLFOLDER]App.exe" "%1"'

    onChange({
      ...manifest,
      registry: [
        ...manifest.registry,
        { root: 'hkcr', key: scheme, name: '', value: `URL:${manifest.name || scheme} Protocol`, valueType: 'string' },
        { root: 'hkcr', key: scheme, name: 'URL Protocol', value: '', valueType: 'string' },
        { root: 'hkcr', key: `${scheme}\\shell\\open\\command`, name: '', value: command, valueType: 'string' },
      ],
    })
    // Lands on the scheme's own key (2 of the 3 new entries) rather than the nested
    // \shell\open\command one - the more useful first stop, one click away from the other.
    setActiveTarget({ root: 'hkcr', keyPrefix: scheme })
  }

  async function importRegFile(file: File) {
    const content = await file.text()
    const { entries, warnings } = parseRegFile(content)
    onChange({ ...manifest, registry: [...manifest.registry, ...entries] })
    const unknown = [...new Set(entries.flatMap((e) => unknownPropertyReferences([e.key, e.name, e.value].join('\n'), manifest)))]
    setImportWarnings([
      ...(entries.length === 0 ? ['Nothing in that file could be imported.'] : []),
      ...warnings,
      ...(unknown.length > 0 ? [unknownPropertyWarning(unknown)] : []),
    ])
    // Show what just arrived rather than whatever key was selected before.
    if (entries[0]) setActiveTarget({ root: entries[0].root, keyPrefix: entries[0].key })
  }

  function contextMenuItems(target: ActiveRegistryTarget, isRoot: boolean): ContextMenuItem[] {
    return [
      {
        label: 'New Key',
        icon: FolderPlus,
        onSelect: () => {
          const name = window.prompt('New key name:')
          if (name) createKey(target, name)
        },
      },
      {
        label: 'Add Entry Here',
        icon: Plus,
        disabled: isRoot,
        onSelect: () => openAddValueModal(target),
      },
      {
        label: 'Rename',
        icon: Pencil,
        disabled: isRoot,
        separatorBefore: true,
        onSelect: () => {
          const name = window.prompt('Rename key to:', target.keyPrefix.split('\\').pop())
          if (name) renameKeyAt(target, name)
        },
      },
      { label: 'Copy Key Name', icon: Copy, onSelect: () => copyKeyName(target) },
      { label: 'Delete', icon: Trash2, disabled: isRoot, danger: true, separatorBefore: true, onSelect: () => deleteKeyAt(target) },
    ]
  }

  function valueContextMenuItems(index: number | null): ContextMenuItem[] {
    const items: ContextMenuItem[] = [
      { label: 'Add Value', icon: Plus, disabled: activeTarget.keyPrefix === '', onSelect: () => openAddValueModal(activeTarget) },
    ]
    if (index !== null) {
      items.push(
        { label: 'Edit', icon: Pencil, separatorBefore: true, onSelect: () => openEditValueModal(index) },
        { label: 'Duplicate', icon: Copy, onSelect: () => duplicateEntry(index) },
        { label: 'Remove', icon: Trash2, danger: true, onSelect: () => removeEntry(index) },
      )
    }
    return items
  }

  return (
    <Panel
      icon={Database}
      title="Registry"
      defaultCollapsed
      description="Keys on the left (right-click for New Key), their values on the right. Import a .reg file as it is: WOW6432Node keys become 32-bit entries by themselves."
      actions={
        <div className="flex flex-wrap gap-2">
          <input
            ref={regInputRef}
            type="file"
            accept=".reg"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void importRegFile(file)
              e.target.value = ''
            }}
          />
          <Button onClick={() => regInputRef.current?.click()}>
            <FileCode size={14} /> Import .reg File
          </Button>
          <Button onClick={addRunOnStartupPreset} title="Start your app automatically when someone signs in to Windows (adds an entry under the Run key).">Run on Startup</Button>
          <Button onClick={addCustomUrlSchemePreset} title="Register your own link type, like myapp://open, so clicking such a link in a browser or email opens your app. Adds the needed keys under HKEY_CLASSES_ROOT.">Custom URL Scheme</Button>
          <Button
            variant="primary"
            onClick={() => openAddValueModal(activeTarget)}
            disabled={activeTarget.keyPrefix === ''}
            title={activeTarget.keyPrefix === '' ? "Select or create a key on the left first - a hive root isn't a writable location on its own." : undefined}
          >
            <Plus size={14} /> Add Entry
          </Button>
        </div>
      }
    >
      {importWarnings.length > 0 && (
        <div className="mb-3 flex items-start gap-3 rounded-md border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-warn">
          <ul className="flex min-w-0 flex-1 flex-col gap-1">
            {importWarnings.slice(0, 8).map((warning, i) => (
              <li key={i} className="break-words">{warning}</li>
            ))}
            {importWarnings.length > 8 && <li>…and {importWarnings.length - 8} more.</li>}
          </ul>
          <button onClick={() => setImportWarnings([])} className="shrink-0 text-warn/80 hover:text-warn" title="Dismiss">
            <X size={14} />
          </button>
        </div>
      )}

      {keyWarnings.length > 0 && (
        <div className="mb-3 flex flex-col gap-1 rounded-md border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-warn">
          {keyWarnings.map((warning, i) => (
            <span key={i}>{warning}</span>
          ))}
        </div>
      )}

      <div className="flex gap-4">
        <HiveTree
          manifest={manifest}
          activeTarget={activeTarget}
          onSelectTarget={setActiveTarget}
          pendingKeys={pendingKeys}
          onContextMenu={(x, y, target, isRoot) => setContextMenu({ x, y, kind: 'key', target, isRoot })}
        />
        <RegistryGrid
          manifest={manifest}
          activeTarget={activeTarget}
          onChange={onChange}
          onSelectTarget={setActiveTarget}
          onEdit={openEditValueModal}
          onContextMenu={(x, y, index) => setContextMenu({ x, y, kind: 'value', index })}
        />
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.kind === 'key' ? contextMenuItems(contextMenu.target, contextMenu.isRoot) : valueContextMenuItems(contextMenu.index)}
          onClose={() => setContextMenu(null)}
        />
      )}

      {valueModal && (
        <RegistryValueModal
          target={valueModal.target}
          initialEntry={valueModal.index === null ? undefined : manifest.registry[valueModal.index]}
          onClose={() => setValueModal(null)}
          onSave={saveValueModal}
        />
      )}
    </Panel>
  )
}
