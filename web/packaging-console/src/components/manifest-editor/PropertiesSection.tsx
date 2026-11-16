import { Info, Lock, Plus, SlidersHorizontal, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Panel } from '../ui/Panel'
import { Button } from '../ui/Button'
import { TextInput } from '../ui/Field'
import { Toggle } from '../ui/Toggle'
import { ContextMenu } from '../ui/ContextMenu'
import type { ContextMenuItem } from '../ui/ContextMenu'
import {
  CATALOG_GROUPS,
  PROPERTY_CATALOG,
  addCustomProperty,
  customPropertyIdError,
  customPropertiesWithIndex,
  isEntryOn,
  removePropertyAt,
  setEntry,
  updatePropertyAt,
} from '../../state/propertyCatalog'
import type { PropertyEntry } from '../../state/propertyCatalog'
import { builtInProperties } from '../../state/builtInProperties'
import type { WinReleaseManifest } from '../../types/manifest'

export function PropertiesSection({
  manifest,
  onChange,
  resolved,
}: {
  manifest: WinReleaseManifest
  onChange: (next: WinReleaseManifest) => void
  /** Values only the Helper's check works out (the automatic Product Code and version), once it has run. */
  resolved?: { productCode?: string; productVersion?: string }
}) {
  const custom = customPropertiesWithIndex(manifest)
  const builtIn = builtInProperties(manifest, resolved)
  const rmDisabled = isEntryOn(manifest, PROPERTY_CATALOG.find((e) => e.key === 'restart-manager')!)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; fullIndex: number | null } | null>(null)

  function addProperty() {
    onChange(addCustomProperty(manifest))
  }

  function removeProperty(fullIndex: number) {
    onChange(removePropertyAt(manifest, fullIndex))
  }

  function contextMenuItems(fullIndex: number | null): ContextMenuItem[] {
    const items: ContextMenuItem[] = [{ label: 'Add Property', icon: Plus, onSelect: addProperty }]
    if (fullIndex !== null) {
      items.push({ label: 'Remove', icon: Trash2, danger: true, separatorBefore: true, onSelect: () => removeProperty(fullIndex) })
    }
    return items
  }

  return (
    <Panel
      icon={SlidersHorizontal}
      title="Properties"
      defaultCollapsed
      description="Install behaviour for IT and managed deployments - flip the switches you need. No MSI knowledge needed."
      actions={
        <Button onClick={addProperty}>
          <Plus size={14} /> New Property
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted">Set by WinRelease</h3>
          <p className="mb-1.5 text-[11px] text-muted">
            Already in every MSI from your other settings, so you will see them in tools like Orca. Change them where it says, not here.
          </p>
          <table className="w-full table-fixed text-left text-xs">
            <tbody className="divide-y divide-subtle">
              {builtIn.map((p) => (
                <tr key={p.id} title={`Set by ${p.setBy}`}>
                  <td className="w-44 py-1 pr-2 font-mono text-ink">
                    <span className="flex items-center gap-1.5">
                      <Lock size={11} className="shrink-0 text-muted" aria-label="Read-only" />
                      {p.id}
                    </span>
                  </td>
                  <td className="truncate py-1 pr-2 font-mono" title={p.value ?? p.absentNote}>
                    {p.value !== null ? <span className="text-ink">{p.value || '(empty)'}</span> : <span className="font-sans italic text-muted">{p.absentNote}</span>}
                  </td>
                  <td className="hidden truncate py-1 text-muted sm:table-cell">{p.setBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {CATALOG_GROUPS.map((group) => {
          const entries = PROPERTY_CATALOG.filter((e): e is PropertyEntry => e.group === group && e.kind === 'property')
          if (entries.length === 0) return null
          return (
            <div key={group}>
              <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{group}</h3>
              <ul className="grid grid-cols-1 gap-x-4 lg:grid-cols-2">
                {entries.map((entry) => {
                  const on = isEntryOn(manifest, entry)
                  return (
                    <li key={entry.key} className="flex h-8 items-center gap-2" title={entry.description}>
                      <Toggle checked={on} label={entry.title} onChange={(checked) => onChange(setEntry(manifest, entry, checked))} />
                      <span className="truncate text-sm text-ink">{entry.title}</span>
                      <span className="shrink-0 rounded bg-panel-alt px-1.5 py-0.5 font-mono text-[10px] text-muted">
                        {entry.property}={entry.value}
                      </span>
                      <Info size={12} className="shrink-0 text-muted" aria-label={entry.description} />
                      {entry.key === 'rm-restart' && on && rmDisabled && (
                        <span className="shrink-0 text-[11px] text-warn" title="Has no effect while “Don’t use Restart Manager” is on.">
                          no effect
                        </span>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}

        <div className="border-t border-subtle pt-3" onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, fullIndex: null }) }}>
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted">Custom properties</h3>
              <p className="text-[11px] text-muted">Any other MSI public property - authored straight into the Property table. Use New Property above, or right-click to add one.</p>
            </div>
          </div>

          {custom.length === 0 ? (
            <p className="py-3 text-center text-xs text-muted">No custom properties yet. Use "New Property" above, or right-click here.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-muted">
                  <th className="pb-1 pr-2 font-medium">Property</th>
                  <th className="pb-1 font-medium">Value</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-subtle">
                {custom.map(({ property, index }) => {
                  const idError = customPropertyIdError(manifest, property.id, index)
                  return (
                    <tr key={index} onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, fullIndex: index }) }}>
                      <td className="py-1 pr-2">
                        <TextInput
                          value={property.id}
                          onChange={(e) => onChange(updatePropertyAt(manifest, index, { id: e.target.value.toUpperCase() }))}
                          placeholder="MYCUSTOMPROPERTY"
                          title={idError ?? undefined}
                        />
                        {idError && <p className="mt-0.5 text-[11px] text-danger">{idError}</p>}
                      </td>
                      <td className="py-1 pr-2">
                        <TextInput value={property.value} onChange={(e) => onChange(updatePropertyAt(manifest, index, { value: e.target.value }))} />
                      </td>
                      <td>
                        <button onClick={() => removeProperty(index)} className="text-muted hover:text-danger">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {contextMenu && <ContextMenu x={contextMenu.x} y={contextMenu.y} items={contextMenuItems(contextMenu.fullIndex)} onClose={() => setContextMenu(null)} />}
    </Panel>
  )
}
