import { ChevronRight, File, FileCode, FileText, Lock, MoreVertical, UploadCloud } from 'lucide-react'
import { useEffect, useState, type ComponentType, type DragEvent, type KeyboardEvent, type MouseEvent } from 'react'
import { NO_AUTOFILL } from '../../ui/Field'
import {
  INSTALL_ROOTS,
  MOVE_ENTRY_DATA_TYPE,
  declaredFilesAtTarget,
  declaredSelectionKey,
  fileNameOf,
  harvestSelectionKey,
  harvestViewAt,
  installPathAncestorInfo,
  targetDirectoryNestingLabels,
} from '../../../state/installTargets'
import type { ActiveTarget, FileContextTarget, MoveEntryPayload } from '../../../state/installTargets'
import { formatFileSize, readBinaryFileVersion, typeLabelForFileName } from '../../../state/fileMetadata'
import { referencedByFor } from '../../../state/manifestDraft'
import type { WinReleaseManifest } from '../../../types/manifest'

/**
 * Shared column templates for the file/harvest-folder grids - a single source of truth for both
 * the header row and every data row, so they can never drift out of sync the way independently-
 * sized `<th>`/`<td>` pairs could. CSS Grid's `minmax()` gives each flexible column a real,
 * natively-enforced minimum (unlike a `<col>`'s min-width under `table-layout: fixed`, which
 * browsers don't reliably honor) - when the sum of minimums exceeds the container, the grid
 * simply overflows it (letting the wrapping `overflow-auto` scroll horizontally) instead of
 * silently squeezing a column to zero or rescaling every column unpredictably.
 */

/**
 * The file grid's resizable columns (the Actions column stays fixed, not resizable) - a
 * user-adjustable counterpart to `HARVEST_GRID_COLUMNS`'s static template. Since the widths
 * change at runtime via drag, they're applied through inline `style.gridTemplateColumns` rather
 * than a Tailwind arbitrary-value class - Tailwind's JIT scanner only picks up class strings that
 * appear literally in source, not ones interpolated at runtime.
 */
type ResizableFileColumn = 'name' | 'version' | 'type' | 'size' | 'sourcePath' | 'referencedBy'
const RESIZABLE_FILE_COLUMNS: ResizableFileColumn[] = ['name', 'version', 'type', 'size', 'sourcePath', 'referencedBy']
// Defaults add up to about 700px so the grid fits beside the folder tree on a 1366px-wide laptop without a horizontal scrollbar.
const DEFAULT_FILE_COLUMN_WIDTHS: Record<ResizableFileColumn, number> = {
  name: 190,
  version: 70,
  type: 120,
  size: 70,
  sourcePath: 140,
  referencedBy: 90,
}
const MIN_FILE_COLUMN_WIDTHS: Record<ResizableFileColumn, number> = {
  name: 140,
  version: 60,
  type: 80,
  size: 60,
  sourcePath: 100,
  referencedBy: 70,
}

/** Drag-to-resize for the file grid's header - one column-width state drives both the header row and every data row's `style.gridTemplateColumns`, so they can never drift apart the way independently-styled `<th>`/`<td>` pairs could (see the header-overlap fix this replaced). */
const COLUMN_WIDTHS_STORAGE_KEY = 'winrelease:file-column-widths'

/** The widths the user last dragged to, kept per browser (a display preference, not project data). Anything missing or unusable falls back to the default. */
function readStoredColumnWidths(): Record<ResizableFileColumn, number> {
  try {
    const stored = JSON.parse(localStorage.getItem(COLUMN_WIDTHS_STORAGE_KEY) ?? '{}') as Partial<Record<ResizableFileColumn, unknown>>
    const widths = { ...DEFAULT_FILE_COLUMN_WIDTHS }
    for (const column of RESIZABLE_FILE_COLUMNS) {
      const value = stored[column]
      if (typeof value === 'number' && Number.isFinite(value)) widths[column] = Math.min(800, Math.max(MIN_FILE_COLUMN_WIDTHS[column], value))
    }
    return widths
  } catch {
    return { ...DEFAULT_FILE_COLUMN_WIDTHS }
  }
}

function useResizableFileColumns() {
  const [widths, setWidthsState] = useState<Record<ResizableFileColumn, number>>(readStoredColumnWidths)

  function setWidths(update: (previous: Record<ResizableFileColumn, number>) => Record<ResizableFileColumn, number>) {
    setWidthsState((previous) => {
      const next = update(previous)
      try {
        localStorage.setItem(COLUMN_WIDTHS_STORAGE_KEY, JSON.stringify(next))
      } catch {
        // Best-effort only - a blocked localStorage just means the widths do not survive a reload.
      }
      return next
    })
  }

  function resetColumn(column: ResizableFileColumn) {
    setWidths((previous) => ({ ...previous, [column]: DEFAULT_FILE_COLUMN_WIDTHS[column] }))
  }

  function startResize(column: ResizableFileColumn) {
    return (e: MouseEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      const startX = e.clientX
      const startWidth = widths[column]

      function onMove(moveEvent: globalThis.MouseEvent) {
        const next = Math.max(MIN_FILE_COLUMN_WIDTHS[column], startWidth + (moveEvent.clientX - startX))
        setWidths((prev) => (prev[column] === next ? prev : { ...prev, [column]: next }))
      }
      function onUp() {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    }
  }

  // A column still at its default width may shrink toward its minimum, so the list fits a laptop-width editor without scrolling sideways;
  // one the user dragged keeps exactly that width. The last column (Used by) takes any spare width, so a wide window has no dead gap.
  const gridTemplateColumns = `${RESIZABLE_FILE_COLUMNS.map((c) => {
    const least = widths[c] === DEFAULT_FILE_COLUMN_WIDTHS[c] ? MIN_FILE_COLUMN_WIDTHS[c] : widths[c]
    return c === 'referencedBy' ? `minmax(${least}px, 1fr)` : `minmax(${least}px, ${widths[c]}px)`
  }).join(' ')} 32px`

  return { gridTemplateColumns, startResize, resetColumn }
}

const CODE_EXTENSIONS = new Set(['exe', 'dll', 'msi', 'ps1', 'bat', 'cmd', 'js', 'json', 'xml'])
const TEXT_EXTENSIONS = new Set(['txt', 'md', 'ini', 'cfg', 'conf', 'log', 'reg'])

/** A generic per-extension icon (like Explorer/Advanced Installer) - purely visual, doesn't affect anything about how the file installs. */
function iconForFileName(name: string): ComponentType<{ size?: number; className?: string }> {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (CODE_EXTENSIONS.has(ext)) return FileCode;
  if (TEXT_EXTENSIONS.has(ext)) return FileText;
  return File;
}

/**
 * Reads binary file versions for the currently-visible declared files whose real blob is staged
 * (`sourceFiles`, session-local only - never persisted). Keyed by file Id so a version already read
 * isn't re-read every render; a file whose blob isn't staged (page reload, non-binary) never gets an
 * entry and the grid shows "—" for it.
 */
function useFileVersions(fileIds: string[], sourcePaths: string[], sourceFiles: Map<string, File>): Record<string, string | null> {
  const [versions, setVersions] = useState<Record<string, string | null>>({})

  useEffect(() => {
    let cancelled = false
    fileIds.forEach((id, i) => {
      if (id in versions) return
      const blob = sourceFiles.get(sourcePaths[i])
      if (!blob) return
      readBinaryFileVersion(blob).then((version) => {
        if (!cancelled) setVersions((prev) => (id in prev ? prev : { ...prev, [id]: version }))
      })
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileIds.join('|'), sourceFiles])

  return versions
}

function Breadcrumb({ manifest, activeTarget, onSelectTarget }: { manifest: WinReleaseManifest; activeTarget: ActiveTarget; onSelectTarget: (target: ActiveTarget) => void }) {
  const rootLabel = INSTALL_ROOTS.find((r) => r.root === activeTarget.root)?.friendlyName ?? activeTarget.root;
  const segments = activeTarget.prefix.length > 0 ? activeTarget.prefix.split('/') : [];
  // Install Directory (installFolder) always renders as one flat root node no matter how deep
  // General's Install Directory field actually nests it - shown here as non-interactive context
  // ahead of the real breadcrumb, so "where did my Acme\App subpath go" has a visible answer instead
  // of just the tree badge/tooltip. These labels aren't separately browsable targets, hence no onClick.
  const nestingLabels = activeTarget.root === 'installFolder' ? targetDirectoryNestingLabels(manifest) : [];

  return (
    <div className="mb-2 flex flex-wrap items-center gap-1 text-xs">
      {nestingLabels.map((label, i) => (
        <span key={`nesting-${i}`} className="flex items-center gap-1 text-muted/70" title="Set by General's Install Directory field - not a separately browsable folder">
          {label}
          <ChevronRight size={11} />
        </span>
      ))}
      <button
        onClick={() => onSelectTarget({ root: activeTarget.root, prefix: '' })}
        className={segments.length === 0 ? 'font-medium text-ink' : 'text-muted hover:text-brand'}
      >
        {rootLabel}
      </button>
      {segments.map((segment, i) => {
        const prefix = segments.slice(0, i + 1).join('/');
        const isLast = i === segments.length - 1;
        return (
          <span key={prefix} className="flex items-center gap-1">
            <ChevronRight size={11} className="text-muted" />
            <button onClick={() => onSelectTarget({ root: activeTarget.root, prefix })} className={isLast ? 'font-medium text-ink' : 'text-muted hover:text-brand'}>
              {segment}
            </button>
          </span>
        );
      })}
    </div>
  );
}

/** A row's Name cell - plain text by default (no input-box bloat), double-click to edit inline. Right-click → Rename does the same rename through a window.prompt instead (FilesSection owns both paths). */
function EditableName({
  name,
  editing,
  onStartEditing,
  onCommit,
  onCancel,
}: {
  name: string
  editing: boolean
  onStartEditing: () => void
  onCommit: (newName: string) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState(name)

  if (!editing) {
    return (
      <span onDoubleClick={onStartEditing} title={name} className="min-w-0 max-w-[380px] flex-1 truncate">
        {name}
      </span>
    )
  }

  function commit() {
    const trimmed = draft.trim()
    if (trimmed.length > 0 && trimmed !== name) onCommit(trimmed)
    else onCancel()
  }

  return (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => e.target.select()}
      onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') commit()
        if (e.key === 'Escape') onCancel()
      }}
      onBlur={commit}
      autoComplete={NO_AUTOFILL}
      className="min-w-0 flex-1 rounded border border-brand bg-panel px-1 py-0.5 text-sm text-ink outline-none"
    />
  )
}

/** A header cell with a draggable resize handle on its right edge - `onResizeStart` is one of `useResizableFileColumns`'s `startResize(column)` closures. */
function ResizableHeaderCell({
  label,
  align,
  onResizeStart,
  onReset,
  title,
}: {
  label: string
  align: 'left' | 'right'
  onResizeStart: (e: MouseEvent<HTMLDivElement>) => void
  /** Double-click on the handle puts the column back to its default width. */
  onReset: () => void
  title?: string
}) {
  return (
    <div role="columnheader" title={title} className={`relative ${align === 'right' ? 'text-right' : 'text-left'}`}>
      {/* The label truncates, not the cell: a clipping cell would cut off the part of the drag handle that sits in the gap between columns. */}
      <span className="block truncate">{label}</span>
      {/* A visible divider (not just a hover target) so it is clear the column can be dragged wider or narrower. */}
      <div
        onMouseDown={onResizeStart}
        onDoubleClick={onReset}
        title="Drag to resize, double-click to reset"
        className="group absolute -right-2 top-1/2 z-10 flex h-5 w-3 -translate-y-1/2 cursor-col-resize select-none justify-center"
      >
        <span className="h-full w-px bg-subtle group-hover:w-0.5 group-hover:bg-brand" />
      </div>
    </div>
  )
}

export function TargetFileGrid({
  manifest,
  activeTarget,
  onSelectTarget,
  selected,
  onSelectRow,
  onRenameDeclared,
  onContextMenu,
  sourceFiles,
}: {
  manifest: WinReleaseManifest
  activeTarget: ActiveTarget
  onSelectTarget: (target: ActiveTarget) => void
  /** Multi-select for bulk actions (FilesSection's bulk-delete bar) - keyed by declaredSelectionKey/harvestSelectionKey, not row index. */
  selected: Set<string>
  /** Plain click selects just this row; Ctrl/Cmd-click toggles it within the selection. */
  onSelectRow: (key: string, additive: boolean) => void
  onRenameDeclared: (index: number, newName: string) => void
  onContextMenu: (x: number, y: number, ctx: FileContextTarget) => void
  /** Real staged File blobs, keyed by sourcePath - session-local only, used to read Size/Version metadata directly from the binary. */
  sourceFiles: Map<string, File>
}) {
  const [editing, setEditing] = useState<{ kind: 'declared' | 'harvest'; index: number } | null>(null)
  const { gridTemplateColumns, startResize, resetColumn } = useResizableFileColumns()
  const declaredHere = declaredFilesAtTarget(manifest, activeTarget)
  const ancestor = installPathAncestorInfo(manifest, activeTarget)
  const importedView = harvestViewAt(manifest, [...sourceFiles.keys()], activeTarget)
  const versions = useFileVersions(
    declaredHere.map(({ file }) => file.id),
    declaredHere.map(({ file }) => file.sourcePath),
    sourceFiles,
  )

  /**
   * Dragging a row that's part of the current multi-selection carries every selected entry (across
   * the whole manifest, same global-selection semantics as the bulk-delete bar - not just what's
   * visible in this folder), not only the row the drag started on - Explorer-style "drag one of
   * several selected items moves the whole selection." Dragging an unselected row (or a lone
   * selection) still moves just that one item.
   */
  function dragPayloadFor(kind: 'declared' | 'harvest', index: number, key: string): MoveEntryPayload {
    if (!selected.has(key) || selected.size <= 1) return { entries: [{ kind, index }] }

    const entries: MoveEntryPayload['entries'] = []
    manifest.files.declared.forEach((file, i) => {
      if (selected.has(declaredSelectionKey(file.id))) entries.push({ kind: 'declared', index: i })
    })
    manifest.files.harvest.forEach((folder, i) => {
      if (selected.has(harvestSelectionKey(folder.root, folder.installPath))) entries.push({ kind: 'harvest', index: i })
    })
    return { entries }
  }

  function startDrag(payload: MoveEntryPayload) {
    return (e: DragEvent<HTMLTableRowElement>) => {
      e.dataTransfer.setData(MOVE_ENTRY_DATA_TYPE, JSON.stringify(payload))
      e.dataTransfer.effectAllowed = 'move'
    }
  }

  function rowContextMenu(ctx: FileContextTarget) {
    return (e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      onContextMenu(e.clientX, e.clientY, ctx)
    }
  }

  /** The Actions column's kebab button - same context menu as right-click, opened from the button's own position for anyone who'd rather click than right-click. */
  function openRowMenu(ctx: FileContextTarget) {
    return (e: MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation()
      const rect = e.currentTarget.getBoundingClientRect()
      onContextMenu(rect.right, rect.bottom, ctx)
    }
  }

  return (
    <div
      className="flex max-h-[65vh] min-w-0 flex-1 flex-col"
      onContextMenu={rowContextMenu({ kind: 'folder', target: activeTarget, isRoot: activeTarget.prefix === '' })}
    >
      <Breadcrumb manifest={manifest} activeTarget={activeTarget} onSelectTarget={onSelectTarget} />

      {importedView && (
        <p className="mb-2 text-xs text-muted">
          Imported folder <span className="font-mono text-ink">{importedView.folder.sourceFolder}</span>: everything in it is added as it is when you build. To
          change what is included, change the folder and import it again.
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-auto">
      <div role="table" className="w-full text-left text-sm">
        <div
          role="row"
          style={{ gridTemplateColumns }}
          className="sticky top-0 z-10 grid items-center gap-2 border-b border-subtle bg-panel px-1 py-2 text-xs font-semibold uppercase tracking-wide text-muted"
        >
          <ResizableHeaderCell label="Name" align="left" onResizeStart={startResize('name')} onReset={() => resetColumn('name')} />
          <ResizableHeaderCell label="Version" align="left" onResizeStart={startResize('version')} onReset={() => resetColumn('version')} />
          <ResizableHeaderCell label="Type" align="left" onResizeStart={startResize('type')} onReset={() => resetColumn('type')} />
          <ResizableHeaderCell label="Size" align="left" onResizeStart={startResize('size')} onReset={() => resetColumn('size')} />
          <ResizableHeaderCell label="Source Path" align="left" onResizeStart={startResize('sourcePath')} onReset={() => resetColumn('sourcePath')} />
          <ResizableHeaderCell label="Used by" align="left" onResizeStart={startResize('referencedBy')} onReset={() => resetColumn('referencedBy')} title="The shortcuts that point at this file (click a name to jump to it). Empty means no shortcut uses it. Right-click an .exe and choose Create Shortcut to add one." />
          <div role="columnheader" />
        </div>
        <div role="rowgroup" className="divide-y divide-subtle">
          {declaredHere.map(({ file, index }) => {
            const referencedBy = referencedByFor(manifest, file.id)
            const name = fileNameOf(file.installPath)
            const NameIcon = iconForFileName(name)
            const key = declaredSelectionKey(file.id)
            const blob = sourceFiles.get(file.sourcePath)
            const version = versions[file.id]
            const isEditing = editing?.kind === 'declared' && editing.index === index
            return (
              <div
                role="row"
                key={index}
                draggable={!isEditing}
                onDragStart={startDrag(dragPayloadFor('declared', index, key))}
                onContextMenu={rowContextMenu({ kind: 'declared', index })}
                style={{ gridTemplateColumns }}
                onClick={(e) => {
                  // Click selects the row, Ctrl/Cmd-click adds or removes it - no tick boxes. A click on a button, link or the rename box keeps its own meaning.
                  if ((e.target as HTMLElement).closest('button, a, input')) return
                  onSelectRow(key, e.ctrlKey || e.metaKey)
                }}
                aria-selected={selected.has(key)}
                className={`grid cursor-default items-center gap-2 px-1 py-1.5 ${selected.has(key) ? 'bg-brand/10' : 'hover:bg-panel-alt'}`}
              >
                <div role="cell" className="min-w-0">
                  <div className="flex min-w-0 cursor-grab items-center gap-1.5 active:cursor-grabbing">
                    <NameIcon size={14} className="shrink-0 text-muted" />
                    <EditableName
                      name={name}
                      editing={isEditing}
                      onStartEditing={() => setEditing({ kind: 'declared', index })}
                      onCommit={(newName) => {
                        onRenameDeclared(index, newName)
                        setEditing(null)
                      }}
                      onCancel={() => setEditing(null)}
                    />
                    {file.readOnly && (
                      <span title="Read-Only (right-click to change)">
                        <Lock size={11} className="shrink-0 text-muted" />
                      </span>
                    )}
                  </div>
                </div>
                <div
                  role="cell"
                  className="truncate font-mono text-sm text-muted"
                  title={blob ? undefined : 'Only known for a file staged this session (Add Files/Import Directory) - not persisted, and not re-read after a reload.'}
                >
                  {version ?? '—'}
                </div>
                <div role="cell" className="truncate text-sm text-muted" title={typeLabelForFileName(name)}>
                  {typeLabelForFileName(name)}
                </div>
                <div role="cell" className="truncate text-sm text-muted">{blob ? formatFileSize(blob.size) : '—'}</div>
                <div role="cell" className="truncate text-sm text-muted" title={file.sourcePath}>
                  {file.sourcePath}
                </div>
                <div role="cell" className="truncate text-sm text-muted">
                  {referencedBy.length > 0
                    ? referencedBy.map((ref, i) => (
                        <span key={ref.index}>
                          {i > 0 && ', '}
                          <a href={`#shortcut-${ref.index}`} className="text-brand hover:underline">
                            {ref.name || '(untitled)'}
                          </a>
                        </span>
                      ))
                    : '—'}
                </div>
                <div role="cell" className="flex justify-end">
                  <button onClick={openRowMenu({ kind: 'declared', index })} title="Actions" className="text-muted hover:text-ink">
                    <MoreVertical size={14} />
                  </button>
                </div>
              </div>
            )
          })}
          {importedView?.files.map(({ name, sourcePath }) => {
            const FileIcon = iconForFileName(name)
            const blob = sourceFiles.get(sourcePath)
            return (
              <div key={`f:${sourcePath}`} role="row" style={{ gridTemplateColumns }} className="grid items-center gap-2 px-1 py-1.5 hover:bg-panel-alt">
                <div role="cell" className="flex min-w-0 items-center gap-1.5">
                  <FileIcon size={14} className="shrink-0 text-muted" />
                  <span className="truncate">{name}</span>
                </div>
                <div role="cell" className="truncate font-mono text-sm text-muted">—</div>
                <div role="cell" className="truncate text-sm text-muted" title={typeLabelForFileName(name)}>
                  {typeLabelForFileName(name)}
                </div>
                <div role="cell" className="truncate text-sm text-muted">{blob ? formatFileSize(blob.size) : '—'}</div>
                <div role="cell" className="truncate text-sm text-muted" title={sourcePath}>
                  {sourcePath}
                </div>
                <div role="cell" className="truncate text-sm text-muted">—</div>
                <div role="cell" />
              </div>
            )
          })}
          {importedView && importedView.files.length === 0 && (
            <div role="row" className="px-3 py-6 text-center text-xs text-muted">
              {sourceFiles.size === 0
                ? 'The files of this folder are not loaded in this browser session - re-import the folder to see them here.'
                : 'No files directly in this folder.'}
            </div>
          )}
          {declaredHere.length === 0 && !importedView && (
            <div role="row" className="px-3 py-10">
              <div role="cell" className="flex flex-col items-center gap-2 rounded-md border border-dashed border-subtle py-6 text-center text-xs text-muted">
                <UploadCloud size={20} className="text-muted/70" />
                {ancestor ? (
                  <span>
                    This folder is part of the Install Directory path set in General, so it holds only <strong>{ancestor.childName}</strong>. Select{' '}
                    <strong>{ancestor.installName}</strong> on the left to add your files.
                  </span>
                ) : (
                  <span>
                    Drag &amp; drop files or folders here, or use "Import Directory" / "Add Files" above.
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      </div>
    </div>
  )
}
