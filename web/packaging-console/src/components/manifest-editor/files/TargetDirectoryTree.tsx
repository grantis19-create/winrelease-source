import { AlertTriangle, Check, ChevronDown, ChevronRight, Folder, FolderPlus, Pencil, X } from 'lucide-react'
import { createContext, useContext, useEffect, useRef, useState, type DragEvent } from 'react'
import { NO_AUTOFILL } from '../../ui/Field'
import { INSTALL_ROOTS, MOVE_ENTRY_DATA_TYPE, PER_USER_CAVEAT_ROOTS, bitnessBadge, itemCountDirectlyAt, itemCountUnderTarget, itemCountUnderTargetWithHarvest, joinInstallPath, parseTargetDirectory, subfoldersWithHarvest, visibleInstallRoots } from '../../../state/installTargets'
import type { ActiveTarget, MoveEntryPayload } from '../../../state/installTargets'
import type { InstallRoot } from '../../../types/manifest'
import type { WinReleaseManifest } from '../../../types/manifest'

/** A one-shot "Expand All"/"Collapse All" broadcast (FilesSection's toolbar/context-menu actions) - a fresh object each click (even for the same direction twice in a row) so every TreeNode's effect re-fires, including ones mounted later by an ancestor's own expansion. */
export type ExpandAllSignal = { expand: boolean; epoch: number }

/** Paths of the files staged this session, so an imported folder can be browsed like any other (ADR 0097). */
const SourcePathsContext = createContext<string[]>([])

export function TargetDirectoryTree({
  manifest,
  activeTarget,
  onSelectTarget,
  onMoveEntry,
  pendingFolders,
  onCreateFolder,
  onRenameFolder,
  onContextMenu,
  expandAllSignal,
  hideEmptyFolders,
  width,
  sourcePaths,
}: {
  manifest: WinReleaseManifest
  activeTarget: ActiveTarget
  onSelectTarget: (target: ActiveTarget) => void
  /** Drag a file/harvest-folder row from TargetFileGrid onto a node here to relocate it. */
  onMoveEntry: (payload: MoveEntryPayload, target: ActiveTarget) => void
  /** Client-only "created but still empty" folders, keyed by `${root}:${parentPrefix}` (see FilesSection) - folders aren't first-class manifest entities (derived from file paths), so a never-populated one doesn't survive a reload. */
  pendingFolders: Record<string, string[]>
  onCreateFolder: (target: ActiveTarget, name: string) => void
  onRenameFolder: (target: ActiveTarget, newName: string) => void
  onContextMenu: (x: number, y: number, target: ActiveTarget, isRoot: boolean) => void
  /** "Expand All"/"Collapse All" - see ExpandAllSignal. */
  expandAllSignal: ExpandAllSignal | null
  /** Hides anything with no files anywhere under it, roots included - matches a real MSI table browser's own "Hide Empty Folders" (every count-0 row disappears, not just subfolders). A root hides exactly like any other folder; nothing here is treated as exempt. */
  hideEmptyFolders: boolean
  /** Pixel width of the tree pane - owned by FilesSection so its drag handle can resize it. */
  width: number
  /** Staged file paths - lets imported folders show their contents as real subfolders. */
  sourcePaths: string[]
}) {
  // One tree, not two: Install Directory (INSTALLFOLDER) is physically a folder inside whichever
  // standard root General's Install Directory field resolves to, so it's rendered inside that
  // root (e.g. Program Files (64-bit) > Sample Company > Hello Installer) rather than as a
  // duplicate top-level root. A bare root with no subpath, or an unparseable value, keeps the
  // standalone Install Directory node (visibleInstallRoots already drops the redundant raw root then).
  const parsed = parseTargetDirectory(manifest.targetDirectory)
  const nestRoot = parsed && parsed.segments.length > 0 ? INSTALL_ROOTS.find((r) => r.label === `[${parsed.rootId}]`)?.root : undefined
  const visible = visibleInstallRoots(manifest)
  const nestHost = nestRoot && visible.some((r) => r.root === nestRoot) ? nestRoot : undefined
  const roots = visible
    .filter(({ root }) => !(nestHost && root === 'installFolder'))
    .filter(({ root }) => !hideEmptyFolders || root === nestHost || itemCountUnderTarget(manifest, { root, prefix: '' }) > 0)

  return (
    <SourcePathsContext.Provider value={sourcePaths}>
    <div style={{ width }} className="max-h-[65vh] shrink-0 overflow-y-auto pr-3">
      {roots.map(({ root, label, friendlyName }) => (
        <TreeNode
          key={root}
          manifest={manifest}
          target={{ root, prefix: '' }}
          name={friendlyName}
          // Target Folder's badge tracks General's live Target Directory field (ADR 0038) rather
          // than a static placeholder - every other root's WiX token is fixed. Normalized so a
          // recognized raw OS path (however it got into the manifest - a legacy .wxs import, a
          // hand-edited project file) still renders in the same bracketed style as every other
          // root's badge, not a hardcoded drive path.
          badge={label}
          // Ties this node back to General's "Install Directory" field by name, and names the real
          // WiX Directory Id (INSTALLFOLDER) this row actually is - the badge shows *where* it's
          // nested, not *what* it is, which read as ambiguous on its own.
          hint={root === 'installFolder' ? 'This is INSTALLFOLDER - set by General’s "Install Directory" field.' : undefined}
          bitness={bitnessBadge(root)}
          nestSegments={root === nestHost ? parsed?.segments : undefined}
          depth={0}
          activeTarget={activeTarget}
          onSelectTarget={onSelectTarget}
          onMoveEntry={onMoveEntry}
          pendingFolders={pendingFolders}
          onCreateFolder={onCreateFolder}
          onRenameFolder={onRenameFolder}
          onContextMenu={onContextMenu}
          perUserCaveat={PER_USER_CAVEAT_ROOTS.has(root)}
          expandAllSignal={expandAllSignal}
          hideEmptyFolders={hideEmptyFolders}
        />
      ))}
    </div>
    </SourcePathsContext.Provider>
  )
}

function TreeNode({
  manifest,
  target,
  name,
  badge,
  hint,
  bitness,
  depth,
  activeTarget,
  onSelectTarget,
  onMoveEntry,
  pendingFolders,
  onCreateFolder,
  onRenameFolder,
  onContextMenu,
  perUserCaveat,
  expandAllSignal,
  hideEmptyFolders,
  nestSegments,
  asInstallNode,
}: {
  manifest: WinReleaseManifest
  target: ActiveTarget
  /** The folder's own name - the friendly root label at depth 0, or the literal path segment otherwise (also what renaming edits). */
  name: string
  /** The WiX bracket/token form at depth 0 (e.g. "[ProgramFiles64Folder]") - shown inline as a right-aligned badge on every root row, and repeated in the tooltip alongside `hint`. */
  badge?: string
  /** Extra tooltip-only context for a root row (currently just Target Folder's real-Id/General-field tie-in) - appended after the name/badge in the title attribute. */
  hint?: string
  /** Soft blue "64-bit" / soft orange "32-bit" pill for the roots that are bitness-specific - purely informational, doesn't affect anything about how the file installs. */
  bitness?: '64-bit' | '32-bit'
  depth: number
  activeTarget: ActiveTarget
  onSelectTarget: (target: ActiveTarget) => void
  onMoveEntry: (payload: MoveEntryPayload, target: ActiveTarget) => void
  pendingFolders: Record<string, string[]>
  onCreateFolder: (target: ActiveTarget, name: string) => void
  onRenameFolder: (target: ActiveTarget, newName: string) => void
  onContextMenu: (x: number, y: number, target: ActiveTarget, isRoot: boolean) => void
  perUserCaveat?: boolean
  expandAllSignal: ExpandAllSignal | null
  hideEmptyFolders: boolean
  /** Root rows only: the Install Directory field's subpath segments, rendered as a chain under this root ending in the real Install Directory node. */
  nestSegments?: string[]
  /** The Install Directory node nested inside its host root - behaves like a root (no rename, root context menu) even though it's drawn deeper. */
  asInstallNode?: boolean
}) {
  const [expanded, setExpanded] = useState(depth === 0 || !!asInstallNode)
  const [mode, setMode] = useState<'view' | 'renaming' | 'creating'>('view')
  const [draftName, setDraftName] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Runs on mount too (not just when the epoch changes afterward) - the point of that: a node an
  // ancestor's own "Expand All" just mounted for the first time still picks up the in-flight signal
  // instead of falling back to its depth===0 default, so expansion cascades through newly-revealed
  // descendants across a couple of renders without needing to track every node's key up in FilesSection.
  useEffect(() => {
    if (expandAllSignal) setExpanded(expandAllSignal.expand)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandAllSignal?.epoch])

  const sourcePaths = useContext(SourcePathsContext)
  const derivedChildren = subfoldersWithHarvest(manifest, sourcePaths, target)
  const pendingChildren = pendingFolders[`${target.root}:${target.prefix}`] ?? []
  const allChildren = [...new Set([...derivedChildren, ...pendingChildren])].sort()
  // A "derived" folder only ever exists because it has a real file under it somewhere (folders
  // aren't first-class manifest entities - see subfoldersUnderTarget), so it's never actually empty;
  // the only folders this can ever filter out are still-empty pendingFolders ("New Folder" with
  // nothing added to it yet) - including a folder the user just created, same as a real empty MSI
  // Directory row would disappear too. Predictable given the toggle's literal label, not a special case.
  const children = hideEmptyFolders
    ? allChildren.filter((childName) => itemCountUnderTargetWithHarvest(manifest, sourcePaths, { root: target.root, prefix: joinInstallPath(target.prefix, childName) }) > 0)
    : allChildren
  const isActive = activeTarget.root === target.root && activeTarget.prefix === target.prefix
  const itemCount = itemCountDirectlyAt(manifest, sourcePaths, target)

  function startRenaming() {
    setDraftName(name)
    setMode('renaming')
    setExpanded(true)
    requestAnimationFrame(() => inputRef.current?.select())
  }

  function startCreating() {
    setDraftName('')
    setMode('creating')
    setExpanded(true)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  function commit() {
    // No local validation here - FilesSection's createFolder/renameFolderAt validate against real
    // Windows folder-name rules and surface *why* via the addWarnings banner on rejection, one
    // place for that message instead of duplicating the rule set (and a silent no-op) here too.
    if (mode === 'renaming') onRenameFolder(target, draftName)
    else if (mode === 'creating') onCreateFolder(target, draftName)
    setMode('view')
  }

  return (
    <div>
      <div
        className={`group flex w-full cursor-pointer items-center gap-1.5 rounded-md py-1.5 pr-1 text-sm transition-colors ${
          dragOver
            ? 'bg-brand/10 outline outline-2 -outline-offset-2 [outline-style:dashed] outline-brand text-brand'
            : isActive
              ? 'border-l-2 border-brand bg-brand/15 font-medium text-brand'
              : 'border-l-2 border-transparent text-muted hover:bg-panel-alt hover:text-ink'
        }`}
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
        // The whole row selects the folder (not just the name text), like a file explorer - a click on one of the row's own buttons or the rename box keeps its own meaning.
        onClick={(e) => {
          if (mode !== 'view' || (e.target as HTMLElement).closest('button, input')) return
          onSelectTarget(target)
          if (children.length > 0) setExpanded(true)
        }}
        onDragOver={(e: DragEvent<HTMLDivElement>) => {
          if (!e.dataTransfer.types.includes(MOVE_ENTRY_DATA_TYPE)) return
          e.preventDefault()
          e.stopPropagation()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e: DragEvent<HTMLDivElement>) => {
          const raw = e.dataTransfer.getData(MOVE_ENTRY_DATA_TYPE)
          if (!raw) return
          e.preventDefault()
          e.stopPropagation()
          setDragOver(false)
          onMoveEntry(JSON.parse(raw) as MoveEntryPayload, target)
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          onContextMenu(e.clientX, e.clientY, target, depth === 0 || !!asInstallNode)
        }}
      >
        {children.length > 0 ? (
          <button
            onClick={(e) => {
              e.stopPropagation()
              setExpanded((value) => !value)
            }}
            className="shrink-0"
          >
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        ) : (
          <span className="w-3 shrink-0" />
        )}
        <Folder size={13} className="shrink-0" />

        {mode === 'renaming' ? (
          <input
            ref={inputRef}
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') setMode('view')
            }}
            onBlur={() => setMode('view')}
            autoComplete={NO_AUTOFILL}
            className="min-w-0 flex-1 rounded border border-brand bg-panel px-1 py-0.5 text-sm text-ink outline-none"
          />
        ) : (
          <button
            onClick={() => {
              onSelectTarget(target)
              // Opening a folder reveals what is inside it, like any file explorer - the chevron is still there to fold it back up.
              if (children.length > 0) setExpanded(true)
            }}
            title={[badge ? `${name} — ${badge}` : name, hint].filter(Boolean).join(' — ')}
            className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
          >
            <span className="min-w-0 flex-1 truncate">{name}</span>
            {depth === 0 && bitness && (
              <span
                className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium leading-none ${
                  bitness === '64-bit' ? 'bg-blue-500/15 text-blue-400' : 'bg-orange-500/15 text-orange-400'
                }`}
              >
                {bitness}
              </span>
            )}
            {depth === 0 && badge && (
              <span className="max-w-[150px] shrink-0 truncate rounded bg-panel-alt px-1 py-0.5 font-mono text-[9px] leading-none text-muted/80 group-hover:text-muted">
                {badge}
              </span>
            )}
          </button>
        )}

        {mode === 'renaming' ? (
          <>
            <button onMouseDown={(e) => e.preventDefault()} onClick={commit} title="Save" className="shrink-0 text-brand">
              <Check size={13} />
            </button>
            <button onMouseDown={(e) => e.preventDefault()} onClick={() => setMode('view')} title="Cancel" className="shrink-0 text-muted hover:text-danger">
              <X size={13} />
            </button>
          </>
        ) : (
          <>
            {itemCount > 0 && (
              <span
                className={`ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[10px] leading-none ${
                  isActive ? 'bg-brand/20 text-brand' : 'bg-panel-alt text-muted'
                }`}
                title={`${itemCount} file(s) directly in this folder`}
              >
                {itemCount}
              </span>
            )}
            {perUserCaveat && (
              <span title="This is a per-user location under a per-machine install - it installs into the account running Setup, not every end user's own profile.">
                <AlertTriangle size={12} className={`shrink-0 text-warn ${itemCount > 0 ? '' : 'ml-auto'}`} />
              </span>
            )}
            {depth > 0 && !asInstallNode && (
              <button
                onClick={startRenaming}
                title="Rename folder"
                className={`shrink-0 opacity-0 group-hover:opacity-100 hover:text-brand ${itemCount === 0 && !perUserCaveat ? 'ml-auto' : ''}`}
              >
                <Pencil size={12} />
              </button>
            )}
            <button onClick={startCreating} title="New subfolder here" className="shrink-0 opacity-0 group-hover:opacity-100 hover:text-brand">
              <FolderPlus size={12} />
            </button>
          </>
        )}
      </div>

      {expanded && (
        <>
          {nestSegments && nestSegments.length > 0 && (
            <InstallNest
              segments={nestSegments}
              hostRoot={target.root}
              pathSoFar=""
              depth={depth + 1}
              manifest={manifest}
              activeTarget={activeTarget}
              onSelectTarget={onSelectTarget}
              onMoveEntry={onMoveEntry}
              pendingFolders={pendingFolders}
              onCreateFolder={onCreateFolder}
              onRenameFolder={onRenameFolder}
              onContextMenu={onContextMenu}
              expandAllSignal={expandAllSignal}
              hideEmptyFolders={hideEmptyFolders}
            />
          )}
          {children.map((childName) => (
            <TreeNode
              key={childName}
              manifest={manifest}
              target={{ root: target.root, prefix: joinInstallPath(target.prefix, childName) }}
              name={childName}
              depth={depth + 1}
              activeTarget={activeTarget}
              onSelectTarget={onSelectTarget}
              onMoveEntry={onMoveEntry}
              pendingFolders={pendingFolders}
              onCreateFolder={onCreateFolder}
              onRenameFolder={onRenameFolder}
              onContextMenu={onContextMenu}
              expandAllSignal={expandAllSignal}
              hideEmptyFolders={hideEmptyFolders}
            />
          ))}

          {mode === 'creating' && (
            <div className="flex items-center gap-1.5 py-1.5 pr-1 text-sm" style={{ paddingLeft: `${(depth + 1) * 14 + 8}px` }}>
              <span className="w-3 shrink-0" />
              <Folder size={13} className="shrink-0 text-muted" />
              <input
                ref={inputRef}
                value={draftName}
                placeholder="Folder name"
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commit()
                  if (e.key === 'Escape') setMode('view')
                }}
                onBlur={() => setMode('view')}
                autoComplete={NO_AUTOFILL}
                className="min-w-0 flex-1 rounded border border-brand bg-panel px-1 py-0.5 text-sm text-ink outline-none"
              />
              <button onMouseDown={(e) => e.preventDefault()} onClick={commit} title="Create" className="shrink-0 text-brand">
                <Check size={13} />
              </button>
              <button onMouseDown={(e) => e.preventDefault()} onClick={() => setMode('view')} title="Cancel" className="shrink-0 text-muted hover:text-danger">
                <X size={13} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

/** Static (non-browsable) folders between a standard root and the Install Directory, ending in the real, selectable Install Directory node. */
function InstallNest({
  segments,
  depth,
  hostRoot,
  pathSoFar,
  ...rest
}: { segments: string[]; depth: number; hostRoot: InstallRoot; pathSoFar: string } & Omit<Parameters<typeof TreeNode>[0], 'target' | 'name' | 'depth' | 'asInstallNode' | 'nestSegments'>) {
  const [first, ...tail] = segments
  if (tail.length === 0) {
    return (
      <TreeNode
        {...rest}
        target={{ root: 'installFolder', prefix: '' }}
        name={first}
        hint={'This is INSTALLFOLDER - set by General\u2019s "Install Directory" field.'}
        depth={depth}
        asInstallNode
      />
    )
  }
  const target = { root: hostRoot, prefix: joinInstallPath(pathSoFar, first) }
  const isActive = rest.activeTarget.root === target.root && rest.activeTarget.prefix === target.prefix
  return (
    <>
      <div
        className={`flex cursor-pointer items-center gap-1.5 rounded-md py-1.5 pr-1 text-sm transition-colors ${
          isActive ? 'border-l-2 border-brand bg-brand/15 font-medium text-brand' : 'border-l-2 border-transparent text-muted hover:bg-panel-alt hover:text-ink'
        }`}
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
        onClick={() => rest.onSelectTarget(target)}
      >
        <span className="w-3 shrink-0" />
        <Folder size={13} className="shrink-0" />
        <button
          onClick={() => rest.onSelectTarget(target)}
          title="Part of the Install Directory path set in General. Files go in the folder below it."
          className="min-w-0 flex-1 truncate text-left"
        >
          {first}
        </button>
      </div>
      <InstallNest segments={tail} hostRoot={hostRoot} pathSoFar={target.prefix} depth={depth + 1} {...rest} />
    </>
  )
}
