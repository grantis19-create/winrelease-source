import type { AppInfo, MsiProperty, WinReleaseManifest } from '../types/manifest'

/**
 * The curated set of install-behavior switches the Properties section offers (ADR 0053) - the ones
 * enterprise deployments actually reach for, each with a plain-language explanation so nobody has to
 * learn the MSI property reference. Two kinds: real MSI properties authored into the Property table
 * (`kind: 'property'`, rendered as its own switch here), and the Add/Remove Programs switches that
 * already live in App Info (`kind: 'arp'`) - these are no longer rendered as switches in this
 * section too (ADR 0061 removed that duplication; App Info is their one home now), but stay in this
 * catalog so a template (below) can still set them atomically alongside real properties.
 *
 * `verified` records how each claim was checked: 'tested' = confirmed with a real build and install
 * on Windows (see ADR 0053), 'documented' = taken from Microsoft's documentation, not exercised here.
 */
export type CatalogGroup = 'Reboots & restarts' | 'Deployment' | 'Add/Remove Programs'

interface BaseEntry {
  key: string
  group: CatalogGroup
  title: string
  /** One or two plain sentences: what it does and why you'd want it. */
  description: string
  verified: 'tested' | 'documented'
}

export interface PropertyEntry extends BaseEntry {
  kind: 'property'
  /** The MSI property authored when the switch is on. */
  property: string
  value: string
}

export interface ArpEntry extends BaseEntry {
  kind: 'arp'
  /** The App Info field the switch drives. */
  field: keyof Pick<AppInfo, 'disableModify' | 'disableRepair' | 'disableRemove'>
  /** The MSI property that field becomes (shown as the chip). */
  property: string
}

export type CatalogEntry = PropertyEntry | ArpEntry

export const PROPERTY_CATALOG: CatalogEntry[] = [
  {
    kind: 'property',
    key: 'reboot',
    group: 'Reboots & restarts',
    title: 'Never restart the PC',
    description: 'Stops the installer from rebooting the machine, even if a file was in use. A locked file is replaced at the next restart instead. Essential for silent Intune/SCCM deployments.',
    property: 'REBOOT',
    value: 'ReallySuppress',
    verified: 'tested',
  },
  {
    kind: 'property',
    key: 'restart-manager',
    group: 'Reboots & restarts',
    title: "Don't use Restart Manager",
    description: "Turns off Windows' Restart Manager, which otherwise tries to close and relaunch running apps that hold files being updated. The installer falls back to its simpler built-in files-in-use handling.",
    property: 'MSIRESTARTMANAGERCONTROL',
    value: 'Disable',
    verified: 'tested',
  },
  {
    kind: 'property',
    key: 'rm-restart',
    group: 'Reboots & restarts',
    title: "Don't relaunch closed apps",
    description: "Keep Restart Manager on, but don't automatically reopen apps it had to close. Has no effect while ‘Don't use Restart Manager’ is on.",
    property: 'MSIDISABLERMRESTART',
    value: '1',
    verified: 'documented',
  },
  {
    kind: 'property',
    key: 'fast-install',
    group: 'Deployment',
    title: 'Faster large installs',
    description: 'For large packages: no system restore point, only the essential file-space check, and fewer progress updates. Saves time on big installs; makes no difference to a small one.',
    property: 'MSIFASTINSTALL',
    value: '7',
    verified: 'documented',
  },
  {
    kind: 'property',
    key: 'limit-ui',
    group: 'Deployment',
    title: 'Basic installer screens only',
    description: 'Limits the installer to the basic UI level (progress bar and error boxes) even when an install wizard is included. Documented by Microsoft; not yet install-tested here.',
    property: 'LIMITUI',
    value: '1',
    verified: 'documented',
  },
  {
    kind: 'arp',
    key: 'no-modify',
    group: 'Add/Remove Programs',
    title: 'Hide the Modify button',
    description: 'Removes "Change/Modify" from Installed Apps. Users can still uninstall.',
    field: 'disableModify',
    property: 'ARPNOMODIFY',
    verified: 'tested',
  },
  {
    kind: 'arp',
    key: 'no-repair',
    group: 'Add/Remove Programs',
    title: 'Hide the Repair button',
    description: 'Removes "Repair" from Installed Apps so users can\'t re-run the installer from there.',
    field: 'disableRepair',
    property: 'ARPNOREPAIR',
    verified: 'tested',
  },
  {
    kind: 'arp',
    key: 'no-remove',
    group: 'Add/Remove Programs',
    title: 'Prevent uninstalling from Settings',
    description: 'Hides the Uninstall button in Installed Apps, so users can’t remove the app themselves.',
    field: 'disableRemove',
    property: 'ARPNOREMOVE',
    verified: 'tested',
  },
]

export const CATALOG_GROUPS: CatalogGroup[] = ['Reboots & restarts', 'Deployment', 'Add/Remove Programs']

/** Absent in manifests saved before the field existed. */
export function propertiesOf(manifest: WinReleaseManifest): MsiProperty[] {
  return manifest.properties ?? []
}

export function isEntryOn(manifest: WinReleaseManifest, entry: CatalogEntry): boolean {
  if (entry.kind === 'arp') return manifest.appInfo[entry.field] === true
  return propertiesOf(manifest).some((p) => p.id === entry.property && p.value === entry.value)
}

/** Flips one catalog switch. A property already present with another value is replaced when switched on, removed when off. */
export function setEntry(manifest: WinReleaseManifest, entry: CatalogEntry, on: boolean): WinReleaseManifest {
  if (entry.kind === 'arp') {
    return { ...manifest, appInfo: { ...manifest.appInfo, [entry.field]: on } }
  }

  const others = propertiesOf(manifest).filter((p) => p.id !== entry.property)
  return { ...manifest, properties: on ? [...others, { id: entry.property, value: entry.value }] : others }
}

/** Properties in the manifest that aren't one of the catalog's own (e.g. from an imported or hand-edited winrelease.json, or added directly here) - editable as a plain Id=Value table. */
export function customProperties(manifest: WinReleaseManifest): MsiProperty[] {
  return customPropertiesWithIndex(manifest).map(({ property }) => property)
}

/**
 * Same as customProperties, but each entry keeps its real index into the full (unfiltered)
 * manifest.properties array - the Id string alone isn't a safe key while it's mid-edit (can be
 * empty or briefly duplicate), so updatePropertyAt/removePropertyAt need the real position, not a
 * re-derived lookup by Id. Mirrors registryTargets.ts's entriesAtTarget ({entry, index}) shape.
 */
export function customPropertiesWithIndex(manifest: WinReleaseManifest): { property: MsiProperty; index: number }[] {
  const curated = new Set(PROPERTY_CATALOG.filter((e): e is PropertyEntry => e.kind === 'property').map((e) => e.property))
  return propertiesOf(manifest)
    .map((property, index) => ({ property, index }))
    .filter(({ property }) => !curated.has(property.id))
}

/**
 * Properties this product's own fields already author (install scope, App Info, package identity -
 * ManifestModel.cs's ReservedNames) - a custom property can't reuse one of these Ids, same rule the
 * backend enforces in WinReleaseManifest.Validate(). Kept in sync by hand (there's no schema export
 * to generate this from); if the real list drifts, the backend validation error at build time is
 * still the final word - this is just the client-side early-warning copy of it.
 */
const RESERVED_PROPERTY_NAMES = new Set([
  'ALLUSERS', 'PRODUCTCODE', 'UPGRADECODE', 'PRODUCTVERSION', 'PRODUCTNAME', 'MANUFACTURER', 'PRODUCTLANGUAGE',
  'INSTALLFOLDER', 'TARGETDIR', 'MSIINSTALLPERUSER',
  'ARPHELPLINK', 'ARPURLUPDATEINFO', 'ARPURLINFOABOUT', 'ARPHELPTELEPHONE', 'ARPCONTACT', 'ARPCOMMENTS',
  'ARPPRODUCTICON', 'ARPNOMODIFY', 'ARPNOREPAIR', 'ARPNOREMOVE', 'ARPSYSTEMCOMPONENT',
])

/** Mirrors MsiProperty.IsValidName exactly: UPPERCASE letters/digits/'_'/'.', starting with a letter or '_', max 72 chars - what lets msiexec's command line override a public property. */
export function isValidPropertyId(id: string): boolean {
  return id.length > 0 && id.length <= 72 && /^[A-Z_][A-Z0-9_.]*$/.test(id)
}

/** The reason a custom property Id would be rejected, or null if it's valid - mirrors isValidPropertyId plus the two checks WinReleaseManifest.Validate() also makes (reserved, duplicate), surfaced here so the Console can explain *why* instead of silently refusing. */
export function customPropertyIdError(manifest: WinReleaseManifest, id: string, ignoringIndex?: number): string | null {
  const trimmed = id.trim()
  if (trimmed.length === 0) return "a property id can't be empty."
  if (!isValidPropertyId(trimmed)) return `'${trimmed}' isn't a valid public MSI property name (UPPERCASE letters, digits, '_' or '.', starting with a letter or '_', up to 72 characters).`
  if (RESERVED_PROPERTY_NAMES.has(trimmed)) return `'${trimmed}' is already set by another field (install scope, App Info, or the package identity) - change it there instead.`
  const curated = new Set(PROPERTY_CATALOG.filter((e): e is PropertyEntry => e.kind === 'property').map((e) => e.property))
  if (curated.has(trimmed)) return `'${trimmed}' is already controlled by one of the switches above - use that instead of a custom property with the same id.`
  const collision = propertiesOf(manifest).findIndex((p) => p.id === trimmed)
  if (collision !== -1 && collision !== ignoringIndex) return `'${trimmed}' is already listed.`
  return null
}

/** Appends a new blank custom property, ready for the Id field to be filled in - mirrors Files & Folders' "New Folder" pattern (create first, name it immediately after). */
export function addCustomProperty(manifest: WinReleaseManifest): WinReleaseManifest {
  return { ...manifest, properties: [...propertiesOf(manifest), { id: '', value: '' }] }
}

/** Updates one property in manifest.properties by its position in the full (unfiltered) array - callers resolve that index via propertiesOf(manifest).indexOf(entry) since the UI only ever shows the customProperties() subset. */
export function updatePropertyAt(manifest: WinReleaseManifest, fullIndex: number, patch: Partial<MsiProperty>): WinReleaseManifest {
  return { ...manifest, properties: propertiesOf(manifest).map((p, i) => (i === fullIndex ? { ...p, ...patch } : p)) }
}

export function removePropertyAt(manifest: WinReleaseManifest, fullIndex: number): WinReleaseManifest {
  return { ...manifest, properties: propertiesOf(manifest).filter((_, i) => i !== fullIndex) }
}
