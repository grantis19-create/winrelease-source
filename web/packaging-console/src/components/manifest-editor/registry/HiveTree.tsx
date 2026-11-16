import { AlertTriangle, ChevronDown, ChevronRight, KeySquare, Monitor } from 'lucide-react'
import { useEffect, useState, type MouseEvent } from 'react'
import {
  REGISTRY_ROOTS,
  entryCountUnderTarget,
  isAtOrUnderRegistryKey,
  isInThirtyTwoBitView,
  joinRegistryKey,
  sameRegistryKey,
  stagedSubkeys,
  subkeysUnderTarget,
  wowNodeCount,
} from '../../../state/registryTargets'
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
    <div className="w-72 shrink-0 border-r border-subtle pr-3">
      {/* regedit's own layout: Computer at the top, the hives under it in regedit's order. */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 text-sm text-ink" title="Computer: the registry of the PC the package is installed on">
        <span className="w-3" />
        <Monitor size={13} className="shrink-0" />
        Computer
      </div>
      <div className="pl-3">
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
      <div
        className="flex w-full cursor-not-allowed items-center gap-1.5 rounded-md px-2 py-1.5 pl-5 text-sm text-muted/50"
        title="HKEY_CURRENT_CONFIG is shown as regedit shows it, but Windows Installer cannot write to it, so it cannot be used in a package."
      >
        <span className="w-3" />
        <KeySquare size={13} className="shrink-0" />
        <span className="truncate">HKEY_CURRENT_CONFIG</span>
      </div>
      </div>
    </div>
  )
}

function TreeNode({
  manifest,
  target,
  label,
  depth,
  placeholder = false,
  activeTarget,
  onSelectTarget,
  pendingKeys,
  onContextMenu,
}: {
  manifest: WinReleaseManifest
  target: ActiveRegistryTarget
  label: string
  depth: number
  /** A staged name (stagedSubkeys) with nothing in it yet: shown greyed. */
  placeholder?: boolean
  activeTarget: ActiveRegistryTarget
  onSelectTarget: (target: ActiveRegistryTarget) => void
  pendingKeys: Record<string, string[]>
  onContextMenu: (x: number, y: number, target: ActiveRegistryTarget, isRoot: boolean) => void
}) {
  const [expanded, setExpanded] = useState(depth === 0)
  const pending = pendingKeys[`${target.root}:${target.keyPrefix}`] ?? []
  const declared = subkeysUnderTarget(manifest, target)
  const real = [...declared, ...pending.filter((p) => !declared.some((n) => sameRegistryKey(n, p)))]
  const staged = stagedSubkeys(target.root, target.keyPrefix, manifest.architecture).filter((name) => !real.some((n) => sameRegistryKey(n, name)))
  const children = [...real, ...staged].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  const isActive = activeTarget.root === target.root && sameRegistryKey(activeTarget.keyPrefix, target.keyPrefix)
  const holdsActive = activeTarget.root === target.root && (target.keyPrefix === '' || (!isActive && isAtOrUnderRegistryKey(activeTarget.keyPrefix, target.keyPrefix)))
  // A key picked from elsewhere (the hive view's key links, an import, a preset) opens the branches above it, so it is visible on the left.
  useEffect(() => {
    if (holdsActive) setExpanded(true)
  }, [holdsActive])
  // Total values at-or-under this key, recursive - lets you tell at a glance whether a key (or
  // anything nested under it) has anything in it at all, without expanding/clicking into it first.
  const count = entryCountUnderTarget(manifest, target)
  const greyed = placeholder && count === 0
  const thirtyTwoBit = isInThirtyTwoBitView(target.root, target.keyPrefix, manifest.architecture)
  const nested = wowNodeCount(target.keyPrefix) > 1 && label.toLowerCase() === 'wow6432node'

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
        } ${greyed && !isActive ? 'opacity-60' : ''}`}
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
        {thirtyTwoBit && label.toLowerCase() === 'wow6432node' && wowNodeCount(target.keyPrefix) === 1 && (
          <span className="shrink-0 rounded bg-orange-500/15 px-1 text-[10px] text-orange-400" title="The 32-bit part of the registry. Keys here are installed as 32-bit entries; WinRelease drops this one WOW6432Node name when it builds and marks them 32-bit, so Windows puts them in the same place.">
            32-bit
          </span>
        )}
        {nested && (
          <span className="shrink-0 text-warn" title="A WOW6432Node inside a WOW6432Node. Windows adds one more when it redirects, so this ends up as WOW6432Node\WOW6432Node in the registry. That is almost always a mistake; it is kept as you made it.">
            <AlertTriangle size={12} />
          </span>
        )}
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
            placeholder={staged.some((n) => sameRegistryKey(n, name))}
            activeTarget={activeTarget}
            onSelectTarget={onSelectTarget}
            pendingKeys={pendingKeys}
            onContextMenu={onContextMenu}
          />
        ))}
    </div>
  )
}
