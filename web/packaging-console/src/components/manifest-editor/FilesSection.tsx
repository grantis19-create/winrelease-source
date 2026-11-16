import { ChevronsDown, ChevronsUp, ClipboardPaste, Copy, EyeOff, FileUp, FolderPlus, FolderTree, Link2, Lock, Pencil, Scissors, Search, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { Panel } from '../ui/Panel'
import { Button } from '../ui/Button'
import { ContextMenu } from '../ui/ContextMenu'
import type { ContextMenuItem } from '../ui/ContextMenu'
import { FileConflictModal } from '../ui/FileConflictModal'
import { TargetDirectoryTree } from './files/TargetDirectoryTree'
import type { ExpandAllSignal } from './files/TargetDirectoryTree'
import { TargetFileGrid } from './files/TargetFileGrid'
import { fromDataTransfer, fromFileList } from '../../state/directoryImport'
import type { ImportedFile } from '../../state/directoryImport'
import {
  INSTALL_ROOTS,
  declaredSelectionKey,
  deleteFolder,
  fileNameOf,
  folderNameError,
  harvestSelectionKey,
  itemCountUnderTarget,
  joinInstallPath,
  renameFolder,
  resolvedPathPreview,
  selectedTargetTokenPreview,
  subfoldersUnderTarget,
} from '../../state/installTargets'
import { installPathAncestorInfo, topLevelTarget } from '../../state/installTargets'
import type { ActiveTarget, FileContextTarget, MoveEntryEntry, MoveEntryPayload } from '../../state/installTargets'
import { sanitizeToFileId } from '../../state/fileId'
import type { InstallRoot, WinReleaseManifest } from '../../types/manifest'

/** A single Copy/Cut slot, like a real file manager - "Copy" duplicates on Paste, "Cut" moves (reuses the same logic as drag-to-move) and clears itself after one Paste. */
type ClipboardEntry = { kind: 'declared' | 'harvest'; index: number; mode: 'copy' | 'cut' }

export function FilesSection({
  manifest,
  onChange,
  primaryFileId,
  onSetPrimaryFileId,
  onCreateShortcut,
  onCreateShortcutForHarvest,
  onStageFiles,
  sourceFiles,
}: {
  manifest: WinReleaseManifest
  onChange: (next: WinReleaseManifest) => void
  primaryFileId: string | null
  onSetPrimaryFileId: (fileId: string | null) => void
  onCreateShortcut: (fileId: string) => void
  onCreateShortcutForHarvest: (root: InstallRoot, installPath: string) => void
  onStageFiles: (entries: { path: string; file: File }[]) => void
  /** Real staged File blobs, keyed by sourcePath - only populated for files added/imported this session (never persisted), used by TargetFileGrid to read Size/Version metadata directly from the binary. */
  sourceFiles: Map<string, File>
}) {
  const [activeTarget, setActiveTarget] = useState<ActiveTarget>({ root: 'installFolder', prefix: '' })
  const [dragOver, setDragOver] = useState(false)
  const [addWarnings, setAddWarnings] = useState<string[]>([])
  // Folders aren't first-class manifest entities (see installTargets.ts) - a folder with nothing
  // in it yet has no data to derive from, so "New Folder" tracks it here instead, keyed by
  // `${root}:${parentPrefix}`, purely for the tree to render and navigate into. It's genuinely
  // ephemeral: a folder that's still empty when the project is reloaded won't come back - the
  // same as a real empty WiX Directory never being emitted.
  const [pendingFolders, setPendingFolders] = useState<Record<string, string[]>>({})
  // "Expand All"/"Collapse All" (toolbar + folder context menu) - a fresh object every click so
  // TreeNode's effect always re-fires, even for the same direction twice in a row. See
  // ExpandAllSignal's own comment in TargetDirectoryTree.tsx for why this is a broadcast rather
  // than tracked per-node state up here.
  const [expandAllSignal, setExpandAllSignal] = useState<ExpandAllSignal | null>(null)
  const [hideEmptyFolders, setHideEmptyFolders] = useState(false)
  // Draggable divider between the folder tree and the file grid.
  const [treeWidth, setTreeWidth] = useState(384)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; ctx: FileContextTarget } | null>(null)
  const [clipboard, setClipboard] = useState<ClipboardEntry | null>(null)
  // Keyed by declaredSelectionKey/harvestSelectionKey (stable identity), not array index - an
  // index would go stale the moment anything elsewhere adds/removes/moves an entry while a
  // multi-select is held across renders.
  const [selected, setSelected] = useState<Set<string>>(new Set())
  // A move/drag collision (Files & Folders' File Conflict modal) - the Promise this backs is
  // resolved by the modal's Overwrite/Cancel buttons, letting moveSingleEntry `await` a real
  // in-app dialog instead of blocking synchronously on window.confirm like the codebase's other
  // "already exists, replace?" spots (Add Files/Import Directory/Paste) still do.
  const [fileConflict, setFileConflict] = useState<{ fileName: string; targetFolderLabel: string; resolve: (overwrite: boolean) => void } | null>(null)
  const filesInputRef = useRef<HTMLInputElement>(null)
  const directoryInputRef = useRef<HTMLInputElement>(null)

  function confirmOverwrite(fileName: string, targetFolderLabel: string): Promise<boolean> {
    return new Promise((resolve) => setFileConflict({ fileName, targetFolderLabel, resolve }))
  }

  function folderLabel(target: ActiveTarget): string {
    if (target.prefix.length > 0) return fileNameOf(target.prefix)
    return INSTALL_ROOTS.find((r) => r.root === target.root)?.friendlyName ?? target.root
  }

  function uniqueFileId(desired: string): string {
    const existing = new Set(manifest.files.declared.map((f) => f.id))
    if (!existing.has(desired)) return desired
    let suffix = 2
    while (existing.has(`${desired}_${suffix}`)) suffix += 1
    return `${desired}_${suffix}`
  }

  // A target (root+installPath) already declared/imported gets silently duplicated into two WiX
  // Components installing to the same path otherwise (found via a real .wxs re-import + "Add Files"
  // on the same target producing two components at build time) - confirm and replace the existing
  // entry's source instead of blindly adding a second one. Two files with the *same name* at
  // *different* targets are unaffected - this only ever compares the exact root+installPath.
  /** Adding into one of the folders that only spell out the Install Directory path would put files beside it, not in it - point at the right folder instead. */
  function refusedBecausePathOnly(): boolean {
    const ancestor = installPathAncestorInfo(manifest, activeTarget)
    if (!ancestor) return false
    setAddWarnings([`"${folderLabel(activeTarget)}" is only part of the Install Directory path. Select "${ancestor.installName}" (or a folder inside it) to add files.`])
    return true
  }

  function addFiles(files: File[]) {
    if (refusedBecausePathOnly()) return
    let declared = manifest.files.declared
    const staged: { path: string; file: File }[] = []

    for (const file of files) {
      const installPath = joinInstallPath(activeTarget.prefix, file.name)
      const existingIndex = declared.findIndex((f) => f.root === activeTarget.root && f.installPath === installPath)

      if (existingIndex !== -1) {
        if (!window.confirm(`"${file.name}" already exists at this target. Replace it with the new file?`)) continue
        declared = declared.map((f, i) => (i === existingIndex ? { ...f, sourcePath: file.name } : f))
      } else {
        declared = [...declared, { id: uniqueFileId(sanitizeToFileId(file.name)), sourcePath: file.name, installPath, root: activeTarget.root }]
      }

      staged.push({ path: file.name, file })
    }

    if (staged.length === 0) return
    onChange({ ...manifest, files: { ...manifest.files, declared } })
    onStageFiles(staged)
  }

  function importDirectory(imported: ImportedFile[]) {
    if (imported.length === 0) return
    if (refusedBecausePathOnly()) return

    let harvest = manifest.files.harvest
    const acceptedTopFolders = new Set<string>()

    for (const topFolder of new Set(imported.map((i) => i.relativePath.split('/')[0]))) {
      const installPath = joinInstallPath(activeTarget.prefix, topFolder)
      const existingIndex = harvest.findIndex((f) => f.root === activeTarget.root && f.installPath === installPath)

      if (existingIndex !== -1) {
        if (!window.confirm(`"${topFolder}" is already imported at this target. Replace it with the new folder?`)) continue
        harvest = harvest.map((f, i) => (i === existingIndex ? { ...f, sourceFolder: topFolder } : f))
      } else {
        harvest = [...harvest, { sourceFolder: topFolder, installPath, root: activeTarget.root }]
      }

      acceptedTopFolders.add(topFolder)
    }

    if (acceptedTopFolders.size === 0) return
    onChange({ ...manifest, files: { ...manifest.files, harvest } })
    onStageFiles(imported.filter((i) => acceptedTopFolders.has(i.relativePath.split('/')[0])).map(({ file, relativePath }) => ({ path: relativePath, file })))
  }

  function siblingNames(root: InstallRoot, parentPrefix: string): Set<string> {
    return new Set([...subfoldersUnderTarget(manifest, { root, prefix: parentPrefix }), ...(pendingFolders[`${root}:${parentPrefix}`] ?? [])])
  }

  function createFolder(target: ActiveTarget, rawName: string) {
    if (installPathAncestorInfo(manifest, target)) {
      setAddWarnings([`"${folderLabel(target)}" is only part of the Install Directory path - create folders inside the Install Directory instead.`])
      return
    }
    const name = rawName.trim()
    if (name.length === 0) return // blank submission (e.g. an empty inline editor committed) - treat as cancelled, not an error to explain
    const error = folderNameError(rawName)
    if (error) {
      setAddWarnings([`Can't create "${rawName}" - ${error}`])
      return
    }
    if (siblingNames(target.root, target.prefix).has(name)) {
      setAddWarnings([`A folder named "${name}" already exists there.`])
      return
    }

    const key = `${target.root}:${target.prefix}`
    setPendingFolders((prev) => ({ ...prev, [key]: [...(prev[key] ?? []), name] }))
    setActiveTarget({ root: target.root, prefix: joinInstallPath(target.prefix, name) })
  }

  function renameFolderAt(target: ActiveTarget, rawNewName: string) {
    const newName = rawNewName.trim()
    if (newName.length === 0) return // blank submission - treat as cancelled, not an error to explain
    const error = folderNameError(rawNewName)
    if (error) {
      setAddWarnings([`Can't rename to "${rawNewName}" - ${error}`])
      return
    }

    const segments = target.prefix.split('/')
    const oldName = segments[segments.length - 1]
    const parentPrefix = segments.slice(0, -1).join('/')

    if (newName !== oldName && siblingNames(target.root, parentPrefix).has(newName)) {
      setAddWarnings([`A folder named "${newName}" already exists there.`])
      return
    }

    const newPrefix = joinInstallPath(parentPrefix, newName)
    onChange(renameFolder(manifest, target.root, target.prefix, newPrefix))

    setPendingFolders((prev) => {
      const parentKey = `${target.root}:${parentPrefix}`
      const oldPrefixKey = `${target.root}:${target.prefix}`
      const next: Record<string, string[]> = {}
      for (const [key, names] of Object.entries(prev)) {
        if (key === parentKey) {
          next[key] = names.map((n) => (n === oldName ? newName : n))
        } else if (key === oldPrefixKey) {
          next[`${target.root}:${newPrefix}`] = names
        } else if (key.startsWith(`${oldPrefixKey}/`)) {
          next[`${target.root}:${newPrefix}${key.slice(oldPrefixKey.length)}`] = names
        } else {
          next[key] = names
        }
      }
      return next
    })

    if (activeTarget.root === target.root && (activeTarget.prefix === target.prefix || activeTarget.prefix.startsWith(`${target.prefix}/`))) {
      setActiveTarget({ root: target.root, prefix: newPrefix + activeTarget.prefix.slice(target.prefix.length) })
    }
  }

  // Drag-to-move (TargetFileGrid rows -> a TargetDirectoryTree node or a subfolder row): keeps the
  // file's own name, just relocates root+installPath's folder prefix. Dropping onto the folder a
  // file already lives in is a no-op; dropping onto an occupied target raises the File Conflict
  // modal below rather than silently failing or rejecting the drop.
  async function moveSingleEntry(entry: MoveEntryEntry, target: ActiveTarget) {
    if (entry.kind === 'declared') {
      const file = manifest.files.declared[entry.index]
      if (!file) return
      const name = fileNameOf(file.installPath)
      const newInstallPath = joinInstallPath(target.prefix, name)
      if (file.root === target.root && file.installPath === newInstallPath) return

      const collisionIndex = manifest.files.declared.findIndex((f, i) => i !== entry.index && f.root === target.root && f.installPath === newInstallPath)
      if (collisionIndex !== -1 && !(await confirmOverwrite(name, folderLabel(target)))) return

      const declared = manifest.files.declared
        .filter((_, i) => i !== collisionIndex)
        .map((f) => (f === file ? { ...f, root: target.root, installPath: newInstallPath } : f))
      onChange({ ...manifest, files: { ...manifest.files, declared } })
    } else {
      const folder = manifest.files.harvest[entry.index]
      if (!folder) return
      const name = fileNameOf(folder.installPath)
      const newInstallPath = joinInstallPath(target.prefix, name)
      if (folder.root === target.root && folder.installPath === newInstallPath) return

      const collisionIndex = manifest.files.harvest.findIndex((f, i) => i !== entry.index && f.root === target.root && f.installPath === newInstallPath)
      if (collisionIndex !== -1 && !(await confirmOverwrite(name, folderLabel(target)))) return

      const harvest = manifest.files.harvest
        .filter((_, i) => i !== collisionIndex)
        .map((f) => (f === folder ? { ...f, root: target.root, installPath: newInstallPath } : f))
      onChange({ ...manifest, files: { ...manifest.files, harvest } })
    }
  }

  /**
   * Multi-item drag-move: dragging one row of a multi-selection carries every selected entry
   * (`dragPayloadFor` in TargetFileGrid), not just the row the drag started on - fixes "selected two
   * files, dragged one, only one moved". A single-entry payload reuses `moveSingleEntry`'s
   * confirm-and-replace UX unchanged; a real multi-item move skips (rather than prompting once per
   * item) anything that collides with something not in the drag, then reports the skipped count once.
   */
  function moveEntry(payload: MoveEntryPayload, target: ActiveTarget) {
    if (payload.entries.length === 0) return
    if (payload.entries.length === 1) {
      moveSingleEntry(payload.entries[0], target)
      return
    }

    let declared = manifest.files.declared
    let harvest = manifest.files.harvest
    let skipped = 0

    for (const entry of payload.entries) {
      if (entry.kind === 'declared') {
        const file = declared[entry.index]
        if (!file) continue
        const newInstallPath = joinInstallPath(target.prefix, fileNameOf(file.installPath))
        if (file.root === target.root && file.installPath === newInstallPath) continue
        if (declared.some((f) => f !== file && f.root === target.root && f.installPath === newInstallPath)) {
          skipped += 1
          continue
        }
        declared = declared.map((f) => (f === file ? { ...f, root: target.root, installPath: newInstallPath } : f))
      } else {
        const folder = harvest[entry.index]
        if (!folder) continue
        const newInstallPath = joinInstallPath(target.prefix, fileNameOf(folder.installPath))
        if (folder.root === target.root && folder.installPath === newInstallPath) continue
        if (harvest.some((f) => f !== folder && f.root === target.root && f.installPath === newInstallPath)) {
          skipped += 1
          continue
        }
        harvest = harvest.map((f) => (f === folder ? { ...f, root: target.root, installPath: newInstallPath } : f))
      }
    }

    onChange({ ...manifest, files: { declared, harvest } })
    if (skipped > 0) {
      window.alert(`${skipped} of ${payload.entries.length} selected item(s) weren't moved - something else already exists at the destination with the same name.`)
    }
  }

  function deleteFolderAt(target: ActiveTarget) {
    const segments = target.prefix.split('/')
    const name = segments[segments.length - 1]
    const parentPrefix = segments.slice(0, -1).join('/')
    const itemCount = itemCountUnderTarget(manifest, target)
    const message = itemCount > 0 ? `Delete "${name}" and everything inside it (${itemCount} item(s))? This can't be undone.` : `Delete "${name}"?`
    if (!window.confirm(message)) return

    onChange(deleteFolder(manifest, target.root, target.prefix))

    setPendingFolders((prev) => {
      const prefixKey = `${target.root}:${target.prefix}`
      const parentKey = `${target.root}:${parentPrefix}`
      const next: Record<string, string[]> = {}
      for (const [key, names] of Object.entries(prev)) {
        if (key === prefixKey || key.startsWith(`${prefixKey}/`)) continue
        next[key] = key === parentKey ? names.filter((n) => n !== name) : names
      }
      return next
    })

    if (activeTarget.root === target.root && (activeTarget.prefix === target.prefix || activeTarget.prefix.startsWith(`${target.prefix}/`))) {
      setActiveTarget({ root: target.root, prefix: parentPrefix })
    }
  }

  /** Paste, for whichever clipboard mode is active. Cut reuses moveEntry outright; Copy duplicates with a fresh unique Id (declared) or just a second reference to the same sourceFolder (harvest) - same confirm-and-replace on a collision as everywhere else. */
  function pasteInto(target: ActiveTarget) {
    if (!clipboard) return

    if (clipboard.mode === 'cut') {
      moveSingleEntry({ kind: clipboard.kind, index: clipboard.index }, target)
      setClipboard(null)
      return
    }

    if (clipboard.kind === 'declared') {
      const file = manifest.files.declared[clipboard.index]
      if (!file) return
      const name = fileNameOf(file.installPath)
      const newInstallPath = joinInstallPath(target.prefix, name)
      const collisionIndex = manifest.files.declared.findIndex((f) => f.root === target.root && f.installPath === newInstallPath)
      if (collisionIndex !== -1 && !window.confirm(`"${name}" already exists there. Replace it?`)) return

      const newFile = { id: uniqueFileId(sanitizeToFileId(name)), sourcePath: file.sourcePath, installPath: newInstallPath, root: target.root }
      const declared =
        collisionIndex !== -1
          ? manifest.files.declared.map((f, i) => (i === collisionIndex ? newFile : f))
          : [...manifest.files.declared, newFile]
      onChange({ ...manifest, files: { ...manifest.files, declared } })
    } else {
      const folder = manifest.files.harvest[clipboard.index]
      if (!folder) return
      const name = fileNameOf(folder.installPath)
      const newInstallPath = joinInstallPath(target.prefix, name)
      const collisionIndex = manifest.files.harvest.findIndex((f) => f.root === target.root && f.installPath === newInstallPath)
      if (collisionIndex !== -1 && !window.confirm(`"${name}" already exists there. Replace it?`)) return

      const newFolder = { sourceFolder: folder.sourceFolder, installPath: newInstallPath, root: target.root }
      const harvest =
        collisionIndex !== -1
          ? manifest.files.harvest.map((f, i) => (i === collisionIndex ? newFolder : f))
          : [...manifest.files.harvest, newFolder]
      onChange({ ...manifest, files: { ...manifest.files, harvest } })
    }
  }

  /** Shared by TargetFileGrid's double-click inline edit and the "Rename" context-menu item - one place for the installPath rewrite either path ends up calling. */
  function renameDeclaredAt(index: number, newName: string) {
    const file = manifest.files.declared[index]
    if (!file) return
    const declared = manifest.files.declared.map((f, i) => (i === index ? { ...f, installPath: joinInstallPath(activeTarget.prefix, newName) } : f))
    onChange({ ...manifest, files: { ...manifest.files, declared } })
  }

  /** WiX File/@ReadOnly or @Hidden - flips the one flag, leaving the other untouched. */
  function toggleDeclaredAttribute(index: number, attribute: 'readOnly' | 'hidden') {
    const declared = manifest.files.declared.map((f, i) => (i === index ? { ...f, [attribute]: !f[attribute] } : f))
    onChange({ ...manifest, files: { ...manifest.files, declared } })
  }

  function renameHarvestAt(index: number, newName: string) {
    const folder = manifest.files.harvest[index]
    if (!folder) return
    const harvest = manifest.files.harvest.map((f, i) => (i === index ? { ...f, installPath: joinInstallPath(activeTarget.prefix, newName) } : f))
    onChange({ ...manifest, files: { ...manifest.files, harvest } })
  }

  function removeDeclaredConfirm(index: number) {
    const file = manifest.files.declared[index]
    if (!file) return
    if (!window.confirm(`Remove "${fileNameOf(file.installPath)}" from this project?`)) return
    if (file.id === primaryFileId) onSetPrimaryFileId(null)
    onChange({ ...manifest, files: { ...manifest.files, declared: manifest.files.declared.filter((_, i) => i !== index) } })
  }

  function removeHarvestConfirm(index: number) {
    const folder = manifest.files.harvest[index]
    if (!folder) return
    if (!window.confirm(`Remove "${fileNameOf(folder.installPath)}" from this project?`)) return
    onChange({ ...manifest, files: { ...manifest.files, harvest: manifest.files.harvest.filter((_, i) => i !== index) } })
  }

  function selectRow(key: string, additive: boolean) {
    setSelected((prev) => {
      if (!additive) return prev.size === 1 && prev.has(key) ? new Set() : new Set([key])
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function bulkDelete() {
    if (selected.size === 0) return
    if (!window.confirm(`Delete ${selected.size} selected item(s)? This can't be undone.`)) return

    const declared = manifest.files.declared.filter((f) => !selected.has(declaredSelectionKey(f.id)))
    const harvest = manifest.files.harvest.filter((f) => !selected.has(harvestSelectionKey(f.root, f.installPath)))
    onChange({ ...manifest, files: { declared, harvest } })

    if (primaryFileId && selected.has(declaredSelectionKey(primaryFileId))) onSetPrimaryFileId(null)
    setSelected(new Set())
  }

  /** Collapsing folds the tree to its top level; the folder shown on the right moves up with it so the tree and the file list never disagree. */
  function collapseAll() {
    setExpandAllSignal({ expand: false, epoch: Date.now() })
    setActiveTarget(topLevelTarget(manifest, activeTarget))
  }

  function contextMenuItems(ctx: FileContextTarget): ContextMenuItem[] {
    if (ctx.kind === 'folder') {
      const { target, isRoot } = ctx
      return [
        {
          label: 'New Folder',
          icon: FolderPlus,
          onSelect: () => {
            const name = window.prompt('New folder name:')
            if (name) createFolder(target, name)
          },
        },
        {
          label: 'Add Files',
          icon: FileUp,
          separatorBefore: true,
          onSelect: () => {
            setActiveTarget(target)
            filesInputRef.current?.click()
          },
        },
        {
          label: 'Import Directory',
          icon: FolderPlus,
          onSelect: () => {
            setActiveTarget(target)
            directoryInputRef.current?.click()
          },
        },
        { label: 'Paste', icon: ClipboardPaste, disabled: !clipboard, separatorBefore: true, onSelect: () => pasteInto(target) },
        {
          label: 'Rename',
          icon: Pencil,
          disabled: isRoot,
          separatorBefore: true,
          onSelect: () => {
            const name = window.prompt('Rename folder to:', target.prefix.split('/').pop())
            if (name) renameFolderAt(target, name)
          },
        },
        { label: 'Delete', icon: Trash2, disabled: isRoot, danger: true, onSelect: () => deleteFolderAt(target) },
        { label: 'Expand All', icon: ChevronsDown, separatorBefore: true, onSelect: () => setExpandAllSignal({ expand: true, epoch: Date.now() }) },
        { label: 'Collapse All', icon: ChevronsUp, onSelect: collapseAll },
        { label: hideEmptyFolders ? 'Show Empty Folders' : 'Hide Empty Folders', icon: EyeOff, onSelect: () => setHideEmptyFolders((value) => !value) },
      ]
    }

    if (ctx.kind === 'declared') {
      const { index } = ctx
      const file = manifest.files.declared[index]
      const isExecutable = /\.exe$/i.test(fileNameOf(file?.installPath ?? ''))
      return [
        {
          label: 'Rename',
          icon: Pencil,
          onSelect: () => {
            const name = window.prompt('Rename to:', fileNameOf(file.installPath))
            if (name) renameDeclaredAt(index, name)
          },
        },
        ...(isExecutable ? [{ label: 'Create Shortcut', icon: Link2, separatorBefore: true, onSelect: () => onCreateShortcut(file.id) }] : []),
        {
          label: file?.readOnly ? 'Unmark Read-Only' : 'Mark Read-Only',
          icon: Lock,
          separatorBefore: !isExecutable,
          onSelect: () => toggleDeclaredAttribute(index, 'readOnly'),
        },
        { label: file?.hidden ? 'Unhide' : 'Hide', icon: EyeOff, onSelect: () => toggleDeclaredAttribute(index, 'hidden') },
        { label: 'Copy', icon: Copy, separatorBefore: true, onSelect: () => setClipboard({ kind: 'declared', index, mode: 'copy' }) },
        { label: 'Cut', icon: Scissors, onSelect: () => setClipboard({ kind: 'declared', index, mode: 'cut' }) },
        { label: 'Delete', icon: Trash2, danger: true, separatorBefore: true, onSelect: () => removeDeclaredConfirm(index) },
      ]
    }

    const { index } = ctx
    const folder = manifest.files.harvest[index]
    return [
      {
        label: 'Rename',
        icon: Pencil,
        onSelect: () => {
          const name = window.prompt('Rename to:', fileNameOf(folder.installPath))
          if (name) renameHarvestAt(index, name)
        },
      },
      { label: 'Create Shortcut', icon: Link2, separatorBefore: true, onSelect: () => onCreateShortcutForHarvest(folder.root, folder.installPath) },
      { label: 'Copy', icon: Copy, separatorBefore: true, onSelect: () => setClipboard({ kind: 'harvest', index, mode: 'copy' }) },
      { label: 'Cut', icon: Scissors, onSelect: () => setClipboard({ kind: 'harvest', index, mode: 'cut' }) },
      { label: 'Delete', icon: Trash2, danger: true, separatorBefore: true, onSelect: () => removeHarvestConfirm(index) },
    ]
  }

  const nothingToExpand = manifest.files.declared.length === 0 && manifest.files.harvest.length === 0 && Object.values(pendingFolders).every((names) => names.length === 0)

  return (
    <Panel
      icon={FolderTree}
      title="Files & Folders"
      defaultCollapsed
      description="Pick a folder on the left, then add files or import a whole folder into it."
      actions={
        <div className="flex gap-2">
          <input
            ref={filesInputRef}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files) addFiles(Array.from(e.target.files))
              e.target.value = ''
            }}
          />
          <input
            ref={directoryInputRef}
            type="file"
            multiple
            hidden
            // @ts-expect-error non-standard but universally supported attribute for a directory picker
            webkitdirectory=""
            onChange={(e) => {
              if (e.target.files) importDirectory(fromFileList(e.target.files))
              e.target.value = ''
            }}
          />
          <Button onClick={() => directoryInputRef.current?.click()}>
            <FolderPlus size={14} /> Import Directory
          </Button>
          <Button onClick={() => filesInputRef.current?.click()}>
            <FileUp size={14} /> Add Files
          </Button>
          <Button
            onClick={() => {
              const name = window.prompt(`New folder name, under ${INSTALL_ROOTS.find((r) => r.root === activeTarget.root)?.friendlyName}${activeTarget.prefix ? `\\${activeTarget.prefix.replace(/\//g, '\\')}` : ''}:`)
              if (name) createFolder(activeTarget, name)
            }}
          >
            <FolderPlus size={14} /> New Folder
          </Button>
          <div className="mx-1 w-px self-stretch bg-subtle" />
          <button
            onClick={() => setExpandAllSignal({ expand: true, epoch: Date.now() })}
            disabled={nothingToExpand}
            title={nothingToExpand ? 'Expand all folders (nothing to expand until you add files or folders)' : 'Expand all folders'}
            className="rounded-md border border-subtle p-1.5 text-muted hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-subtle disabled:hover:text-muted"
          >
            <ChevronsDown size={14} />
          </button>
          <button
            onClick={collapseAll}
            disabled={nothingToExpand}
            title={nothingToExpand ? 'Collapse all folders (nothing to collapse until you add files or folders)' : 'Collapse all folders'}
            className="rounded-md border border-subtle p-1.5 text-muted hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-subtle disabled:hover:text-muted"
          >
            <ChevronsUp size={14} />
          </button>
          <button
            onClick={() => setHideEmptyFolders((value) => !value)}
            disabled={nothingToExpand}
            title={hideEmptyFolders ? 'Show empty folders again' : 'Hide folders that have no files in them'}
            aria-pressed={hideEmptyFolders}
            className={`rounded-md border p-1.5 disabled:cursor-not-allowed disabled:opacity-40 ${hideEmptyFolders ? 'border-brand bg-brand/10 text-brand' : 'border-subtle text-muted hover:border-brand hover:text-brand'}`}
          >
            <EyeOff size={14} />
          </button>
        </div>
      }
    >
      {addWarnings.length > 0 && (
        <div className="mb-3 flex flex-col gap-1 rounded-md border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-warn">
          {addWarnings.map((warning, i) => (
            <span key={i}>{warning}</span>
          ))}
        </div>
      )}

      {selected.size > 0 && (
        <div className="mb-3 flex items-center gap-3 rounded-md border border-brand/30 bg-brand/5 px-3 py-2 text-xs">
          <span className="text-ink">{selected.size} selected</span>
          <button onClick={bulkDelete} className="flex items-center gap-1 text-danger hover:underline">
            <Trash2 size={12} /> Delete Selected
          </button>
          <button onClick={() => setSelected(new Set())} className="text-muted hover:text-ink">
            Clear Selection
          </button>
        </div>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={async (e) => {
          e.preventDefault()
          setDragOver(false)
          importDirectory(await fromDataTransfer(e.dataTransfer))
        }}
        className={`flex gap-4 rounded-md border border-dashed p-3 transition-colors ${dragOver ? 'border-brand bg-brand/5' : 'border-transparent'}`}
      >
        <TargetDirectoryTree
          manifest={manifest}
          activeTarget={activeTarget}
          onSelectTarget={setActiveTarget}
          onMoveEntry={moveEntry}
          pendingFolders={pendingFolders}
          onCreateFolder={createFolder}
          onRenameFolder={renameFolderAt}
          onContextMenu={(x, y, target, isRoot) => setContextMenu({ x, y, ctx: { kind: 'folder', target, isRoot } })}
          expandAllSignal={expandAllSignal}
          hideEmptyFolders={hideEmptyFolders}
          width={treeWidth}
          sourcePaths={[...sourceFiles.keys()]}
        />
        <div
          role="separator"
          aria-orientation="vertical"
          title="Drag to resize"
          className="-mx-2 w-1.5 shrink-0 cursor-col-resize self-stretch rounded bg-subtle/60 hover:bg-brand/60"
          onPointerDown={(e) => {
            e.preventDefault()
            const startX = e.clientX
            const startWidth = treeWidth
            const move = (ev: PointerEvent) => setTreeWidth(Math.min(720, Math.max(200, startWidth + ev.clientX - startX)))
            const up = () => {
              window.removeEventListener('pointermove', move)
              window.removeEventListener('pointerup', up)
            }
            window.addEventListener('pointermove', move)
            window.addEventListener('pointerup', up)
          }}
        />
        <TargetFileGrid
          manifest={manifest}
          activeTarget={activeTarget}
          onSelectTarget={setActiveTarget}
          selected={selected}
          onSelectRow={selectRow}
          onRenameDeclared={renameDeclaredAt}
          onContextMenu={(x, y, ctx) => setContextMenu({ x, y, ctx })}
          sourceFiles={sourceFiles}
        />
      </div>

      <div className="mt-3 flex items-center gap-1.5 rounded-md border border-subtle bg-panel-alt px-3 py-2 font-mono text-xs text-muted">
        <Search size={12} className="shrink-0" />
        <span>Selected Target:</span>
        <span className="text-ink">{selectedTargetTokenPreview(manifest, activeTarget)}</span>
        <span>➜</span>
        <span className="text-ink">{resolvedPathPreview(manifest, activeTarget)}</span>
      </div>

      {contextMenu && <ContextMenu x={contextMenu.x} y={contextMenu.y} items={contextMenuItems(contextMenu.ctx)} onClose={() => setContextMenu(null)} />}

      {fileConflict && (
        <FileConflictModal
          fileName={fileConflict.fileName}
          targetFolderLabel={fileConflict.targetFolderLabel}
          onOverwrite={() => {
            fileConflict.resolve(true)
            setFileConflict(null)
          }}
          onCancel={() => {
            fileConflict.resolve(false)
            setFileConflict(null)
          }}
        />
      )}
    </Panel>
  )
}
