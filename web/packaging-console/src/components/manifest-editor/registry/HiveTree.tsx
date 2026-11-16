import { ChevronDown, ChevronRight, KeySquare } from 'lucide-react'
import { useEffect, useState, type MouseEvent } from 'react'
import { REGISTRY_ROOTS, entryCountUnderTarget, isAtOrUnderRegistryKey, joinRegistryKey, sameRegistryKey, subkeysUnderTarget } from '../../../state/registryTargets'
import type { ActiveRegistryTarget } from '../../../state/registryTargets'
import type { WinReleaseManifest } from '../../../types/manifest'

export function HiveTree({
  manifest,
  activeTarget,
  onSelectTarget,
  pendingKeys,
  onContextMenu,
}: {
  manifest: WinReleaseManifest
  activeTarget: ActiveRegistryTarget
  onSelectTarget: (target: ActiveRegistryTarget) => void
  /** Keys created via "New Key" with nothing under them yet (root:prefix -> child names) - subkeysUnderTarget only derives from real RegistryEntry rows, so an empty key needs this the same way Files & Folders' pendingFolders covers an empty folder. */
  pendingKeys: Record<string, string[]>
  onContextMenu: (x: number, y: number, target: ActiveRegistryTarget, isRoot: boolean) => void
}) {
  return (
    <div className="w-64 shrink-0 border-r border-subtle pr-3">
      {REGISTRY_ROOTS.map(({ root, label }) => (
        <TreeNode
          key={root}
          manifest={manifest}
          target={{ root, keyPrefix: '' }}
          label={label}
          depth={0}
          activeTarget={activeTarget}
          onSelectTarget={onSelectTarget}
          pendingKeys={pendingKeys}
          onContextMenu={onContextMenu}
        />
      ))}
    </div>
  )
}

function TreeNode({
  manifest,
  target,
  label,
  depth,
  activeTarget,
  onSelectTarget,
  pendingKeys,
  onContextMenu,
}: {
  manifest: WinReleaseManifest
  target: ActiveRegistryTarget
  label: string
  depth: number
  activeTarget: ActiveRegistryTarget
  onSelectTarget: (target: ActiveRegistryTarget) => void
  pendingKeys: Record<string, string[]>
  onContextMenu: (x: number, y: number, target: ActiveRegistryTarget, isRoot: boolean) => void
}) {
  const [expanded, setExpanded] = useState(depth === 0)
  const pending = pendingKeys[`${target.root}:${target.keyPrefix}`] ?? []
  const declared = subkeysUnderTarget(manifest, target)
  const children = [...declared, ...pending.filter((p) => !declared.some((n) => sameRegistryKey(n, p)))].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' }),
  )
  const isActive = activeTarget.root === target.root && sameRegistryKey(activeTarget.keyPrefix, target.keyPrefix)
  const holdsActive = activeTarget.root === target.root && (target.keyPrefix === '' || (!isActive && isAtOrUnderRegistryKey(activeTarget.keyPrefix, target.keyPrefix)))
  // A key picked from elsewhere (the hive view's key links, an import, a preset) opens the branches above it, so it is visible on the left.
  useEffect(() => {
    if (holdsActive) setExpanded(true)
  }, [holdsActive])
  // Total values at-or-under this key, recursive - lets you tell at a glance whether a key (or
  // anything nested under it) has anything in it at all, without expanding/clicking into it first.
  const count = entryCountUnderTarget(manifest, target)

  function handleContextMenu(e: MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    onSelectTarget(target)
    onContextMenu(e.clientX, e.clientY, target, depth === 0)
  }

  return (
    <div>
      <button
        onClick={() => {
          setExpanded(true)
          onSelectTarget(target)
        }}
        onContextMenu={handleContextMenu}
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
        className={`flex w-full items-center gap-1.5 rounded-md py-1.5 pr-2 text-left text-sm transition-colors ${
          isActive ? 'bg-brand/10 text-brand' : 'text-muted hover:bg-panel-alt hover:text-ink'
        }`}
      >
        {children.length > 0 ? (
          <span
            onClick={(e) => {
              e.stopPropagation()
              setExpanded((value) => !value)
            }}
          >
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </span>
        ) : (
          <span className="w-3" />
        )}
        <KeySquare size={13} className="shrink-0" />
        <span className="truncate" title={label}>{label}</span>
        <span className="ml-auto shrink-0 pl-1 text-[11px] text-muted/70">[{count}]</span>
      </button>

      {expanded &&
        children.map((name) => (
          <TreeNode
            key={name}
            manifest={manifest}
            target={{ root: target.root, keyPrefix: joinRegistryKey(target.keyPrefix, name) }}
            label={name}
            depth={depth + 1}
            activeTarget={activeTarget}
            onSelectTarget={onSelectTarget}
            pendingKeys={pendingKeys}
            onContextMenu={onContextMenu}
          />
        ))}
    </div>
  )
}
