import { newGuid } from '../state/guid'

// Mirrors WinRelease.Core.Manifest.WinReleaseManifest and friends
// (src/WinRelease.Core/Manifest/ManifestModel.cs). Field names and enum
// values match the camelCase wire format exactly - see winrelease.sample.json.

export type InstallRoot =
  | 'installFolder'
  | 'commonFilesFolder'
  | 'systemFolder'
  | 'appDataFolder'
  | 'localAppDataFolder'
  | 'programFiles64Folder'
  | 'programFilesFolder'
  | 'commonFiles64Folder'
  /** %ProgramData% (C:\ProgramData) - shared, per-machine application data, unlike appDataFolder/localAppDataFolder which land in the installing user's own profile. */
  | 'commonAppDataFolder'
  /** The real, non-redirected %WinDir%\System32 for a 64-bit component - distinct from systemFolder, which Windows itself redirects to %WinDir%\SysWOW64 for a 32-bit process under WOW64 on a 64-bit OS. */
  | 'system64Folder'

export type PackageArchitecture = 'x64' | 'x86' | 'arm64'

/**
 * Convenience constants for Shortcut.location's real Windows shell shortcut folders - the exact WiX
 * StandardDirectory Ids (PascalCase, matching WinRelease.Core.Manifest.ShortcutLocation exactly - no
 * camelCase translation anymore, see the note on Shortcut.location below). Location isn't limited to
 * these: it also accepts the installTargets.ts "wr:dir:{root}:{relativePath}" sentinel to point
 * anywhere in the project's own install-directory tree, same as WorkingDirectory. Desktop/Start
 * Menu/Startup plus the five that actually show up as real shortcut targets in Advanced Installer's
 * own location list (Documents, Favorites, Fonts, SendTo, Templates) - not WiX's full ~25-entry
 * StandardDirectory set. All eight verified against the real `wix` CLI before being added here.
 */
export const SHORTCUT_LOCATIONS = {
  desktopFolder: 'DesktopFolder',
  programMenuFolder: 'ProgramMenuFolder',
  startupFolder: 'StartupFolder',
  /** WiX's own (legacy MSI) Id for the current user's Documents folder. */
  personalFolder: 'PersonalFolder',
  favoritesFolder: 'FavoritesFolder',
  fontsFolder: 'FontsFolder',
  sendToFolder: 'SendToFolder',
  /** Singular, matching WiX's own Id spelling exactly - not "TemplatesFolder". */
  templateFolder: 'TemplateFolder',
} as const

/** WiX's own three legal Shortcut/@Show values (verified against wix 7.0.0 - WIX0021 rejects anything else). */
export type ShortcutWindowStyle = 'normal' | 'minimized' | 'maximized'

export type RegistryRoot = 'hklm' | 'hkcu' | 'hkcr' | 'hku'

export type RegistryValueType = 'string' | 'expandString' | 'integer' | 'multiString' | 'binary'

/**
 * What a Registry entry does. Write authors the value (the only behavior before this field
 * existed). RemoveValue/RemoveKey clean up registry content this product doesn't own - not the
 * values it writes itself, which the Windows Installer engine already removes on uninstall with no
 * extra authoring needed. Mirrors WinRelease.Core.Manifest.RegistryEntryAction exactly.
 */
export type RegistryEntryAction = 'write' | 'removeValue' | 'removeKey'

export type IntuneArchitecture = 'x86' | 'x64' | 'arm64'

/** UI-only for now - always compiled as perMachine regardless of this value. See ADR 0005/0039. */
export type InstallScope = 'perMachine' | 'perUser'

export interface DeclaredFile {
  id: string
  sourcePath: string
  installPath: string
  /** Top-level install destination. Defaults to installFolder (ProgramFilesFolder\INSTALLFOLDER). See ADR 0033. */
  root: InstallRoot
  /** WiX/MSI File/@ReadOnly. Defaults to false/omitted - verified against the real wix CLI, compiles cleanly either set or omitted. */
  readOnly?: boolean
  /** WiX/MSI File/@Hidden. Defaults to false/omitted, same as readOnly. */
  hidden?: boolean
}

export interface HarvestFolder {
  sourceFolder: string
  installPath: string
  root: InstallRoot
}

export interface ManifestFiles {
  declared: DeclaredFile[]
  harvest: HarvestFolder[]
}

export interface Shortcut {
  name: string
  /** Must match a declared file's id. Exactly one of targetFileId/targetPath is set - see ADR 0035. */
  targetFileId?: string | null
  /**
   * A raw WiX Shortcut Target expression (a URL, a literal path, or a "[Property]path") for a
   * shortcut that isn't tied to a declared file - e.g. a file inside a Harvest Folder (whose
   * individual files aren't known until build time) or an external URL. Exactly one of
   * targetFileId/targetPath is set - see ADR 0035.
   */
  targetPath?: string | null
  /**
   * Where the .lnk itself lives: one of the SHORTCUT_LOCATIONS constants, a raw WiX Directory Id
   * typed by hand, or the "wr:dir:{root}:{path}" sentinel pointing anywhere in the project's own
   * install-directory tree (same scheme as workingDirectory below). Not a closed set of values -
   * real packaging tools let a shortcut go anywhere in the install tree, not just Desktop/Start
   * Menu/Startup.
   */
  location: string
  /**
   * A raw WiX Directory Id (e.g. "INSTALLFOLDER"), or the Console's own "wr:dir:{root}:{path}"
   * sentinel (resolved server-side to the same deterministic Id a real folder there would get -
   * see ADR 0035). Null/omitted defaults to INSTALLFOLDER. Always freely editable either way -
   * this is just a convenience default, never enforced. See ADR 0033/0035.
   */
  workingDirectory?: string | null
  arguments?: string | null
  description?: string | null
  /** Path (relative to the build's source root) to an .ico/.exe to use instead of the target file's own icon. */
  iconPath?: string | null
  /** The launched window's initial state. Defaults to 'normal' when omitted (absent from a manifest saved before this field existed). */
  windowStyle?: ShortcutWindowStyle
  /**
   * WiX's Shortcut/@Advertise - lets the shortcut trigger MSI's install-on-demand/self-repair
   * instead of launching the target path directly. Defaults to false (every shortcut before this
   * field existed was non-advertised). Only meaningful for a declared-file target: verified against
   * the real `wix` CLI (WIX0035) that Advertise="yes" and an explicit Target attribute are flatly
   * incompatible, and a Custom-target shortcut always needs an explicit Target - the Console
   * disables the toggle for a Custom target, and WxsGenerator forces it off server-side regardless.
   */
  advertise?: boolean
}

/** One authored MSI property (ADR 0053): a public UPPERCASE name and its value. */
export interface MsiProperty {
  id: string
  value: string
}

export interface RegistryEntry {
  root: RegistryRoot
  key: string
  /** Empty string represents the key's default (unnamed) value. Ignored for action "removeKey" - the whole key goes, not one value. */
  name: string
  /** Ignored for anything other than action "write". */
  value: string
  /** Ignored for anything other than action "write". */
  valueType: RegistryValueType
  /**
   * Defaults to "write" (every entry before this field existed meant "author this value") - see
   * RegistryEntryAction for what removeValue/removeKey mean and how they differ from write (they
   * clean up registry content this product doesn't own, not values it writes itself - those are
   * already removed on uninstall by the Windows Installer engine with no extra authoring).
   */
  action?: RegistryEntryAction
  /**
   * removeKey only (ignored otherwise): false/omitted removes the key when this product is
   * installed - the common "clean up before I write mine" case; true defers removal to when this
   * product is uninstalled instead. removeValue has no equivalent timing choice at all (always
   * install-time) - verified against the real `wix` CLI, which is why this only applies to removeKey.
   */
  removeOnUninstall?: boolean
}

/** What an Environment Variable entry does to the named variable. Mirrors WinRelease.Core.Manifest.EnvironmentVariableAction exactly. */
export type EnvironmentVariableAction = 'set' | 'create' | 'remove'

/** How Value combines with whatever the variable already holds - only meaningful for action "set"/"remove" (WiX rejects Part alongside "create" - verified against the real wix CLI, WIX0035). Mirrors EnvironmentVariablePart exactly. */
export type EnvironmentVariablePart = 'all' | 'first' | 'last'

/** One WiX/MSI Environment-table entry (ADR 0077). Mirrors WinRelease.Core.Manifest.EnvironmentVariableEntry exactly. */
export interface EnvironmentVariableEntry {
  name: string
  /** Ignored (and omittable - WiX rejects an explicit empty string, verified against the real wix CLI) for action "remove". */
  value: string
  action: EnvironmentVariableAction
  part: EnvironmentVariablePart
  /** true: machine-wide (HKLM) - needs the install itself to be per-machine. false (default): the current user's own (HKCU). */
  system: boolean
  /** true: leaves the value (or appended segment) behind after uninstall. false (default): Windows Installer cleans it back up. */
  permanent: boolean
  /** Only meaningful for part "first"/"last". Defaults to ";", the universal Windows PATH-style separator. */
  separator: string
}

export interface IntuneRequirements {
  minimumOSVersion?: string | null
  architecture?: IntuneArchitecture | null
}

export interface IntuneManifest {
  requirements?: IntuneRequirements | null
}

/** Add/Remove Programs ("ARP") properties - see the per-field WiX-property mapping on WxsGenerator. ADR 0039. */
export interface AppInfo {
  /** WiX/MSI property: ARPHELPLINK. */
  supportUrl?: string | null
  /** WiX/MSI property: ARPURLUPDATEINFO. */
  updateUrl?: string | null
  /** WiX/MSI property: ARPURLINFOABOUT. */
  aboutUrl?: string | null
  /** WiX/MSI property: ARPHELPTELEPHONE. */
  supportPhone?: string | null
  /** WiX/MSI property: ARPCONTACT. */
  contact?: string | null
  /** WiX/MSI property: ARPCOMMENTS. */
  comments?: string | null
  /** Path (relative to the build's source root) to an .ico/.exe. Ignored when autoExtractIcon is set. WiX/MSI property: ARPPRODUCTICON. */
  iconPath?: string | null
  /** Resolves ARPPRODUCTICON from the first declared .exe file instead of iconPath. */
  autoExtractIcon: boolean
  /** On by default (a missing value counts as on): the MSI's details say it was packaged with WinRelease. Nothing is shown during install. ADR 0113. */
  packagedWithCredit?: boolean
  installScope: InstallScope
  /** WiX/MSI property: ARPNOMODIFY. */
  disableModify: boolean
  /** WiX/MSI property: ARPNOREPAIR. */
  disableRepair: boolean
  /** WiX/MSI property: ARPNOREMOVE. */
  disableRemove: boolean
  /** WiX/MSI property: ARPSYSTEMCOMPONENT - hides the product from Windows' Installed Apps list entirely. */
  hideFromControlPanel: boolean
  /** Adds WiX's stock install wizard (Welcome, Install folder, Ready, Progress, Finish). Absent means on. */
  installWizard?: boolean
}

export interface WinReleaseManifest {
  schemaVersion: number
  upgradeCode: string
  name: string
  manufacturer: string
  displayVersion: string
  productVersion?: string | null
  /** Server-computed (WinReleaseManifest.ResolvedProductVersion) - present on responses, ignored if sent back on a request. */
  readonly resolvedProductVersion?: string
  /**
   * Where the product's own folder (INSTALLFOLDER) sits - a WiX bracketed root token plus an
   * optional subpath (e.g. "[ProgramFiles64Folder]Acme\App"), or an equivalent literal Windows
   * path. Defaults to the bare "[ProgramFiles64Folder]" root. Supersedes ADR 0037's
   * installUnderManufacturerFolder boolean - see ADR 0038.
   */
  targetDirectory: string
  /** Overrides the deterministic default ProductCode. Null means "use the derived value" - see resolvedProductCode. ADR 0038. */
  productCode?: string | null
  /** Server-computed effective ProductCode (manifest.productCode when set, else the deterministic default) - present on responses. See ADR 0038. */
  readonly resolvedProductCode?: string
  /**
   * The build architecture passed to `wix build -arch`. Defaults to x64. A single-select choice
   * - ADR 0042's multi-select checkboxes (x64/arm64 selectable together) were reverted by
   * ADR 0056, since `-arch` only ever drives one build. See ADR 0038.
   */
  architecture: PackageArchitecture
  files: ManifestFiles
  /** Add/Remove Programs properties. Always present on responses; a brand-new draft seeds sensible defaults - see createEmptyManifest. ADR 0039. */
  appInfo: AppInfo
  shortcuts: Shortcut[]
  registry: RegistryEntry[]
  /** System/user environment variables (ADR 0077). Absent in manifests saved before this field existed. */
  environmentVariables?: EnvironmentVariableEntry[]
  /** Curated MSI install-behavior properties (ADR 0053). Absent in manifests saved before this field existed - read via `propertiesOf`. */
  properties?: MsiProperty[]
  intune?: IntuneManifest | null
}

/** A brand-new, still-unsaved manifest draft - upgradeCode is generated once client-side and never changes after (CONTEXT.md's UpgradeCode entry). */
export function createEmptyManifest(): WinReleaseManifest {
  return {
    schemaVersion: 1,
    upgradeCode: newGuid(),
    name: '',
    manufacturer: '',
    displayVersion: '1.0.0',
    targetDirectory: '[ProgramFiles64Folder]',
    architecture: 'x64',
    files: { declared: [], harvest: [] },
    appInfo: {
      autoExtractIcon: false,
      packagedWithCredit: true,
      installScope: 'perMachine',
      disableModify: false,
      disableRepair: false,
      disableRemove: false,
      hideFromControlPanel: false,
      installWizard: true,
    },
    shortcuts: [],
    registry: [],
    environmentVariables: [],
    properties: [],
  }
}

/**
 * Fills in every field the editor assumes is present but a hand-written (or older) manifest may omit. The backend treats all of these
 * as optional - `ManifestModel.cs` defaults them - so a manifest that is valid for the API used to blank the editor with
 * "Cannot read properties of undefined (reading 'filter')" the moment it was imported (found by UAT T9). Fields the Console has no UI for
 * yet (comClasses, comTypeLibs) are left exactly as given and survive an edit round-trip because every editor change spreads the manifest.
 */
export function withManifestDefaults(raw: Partial<WinReleaseManifest>): WinReleaseManifest {
  const base = createEmptyManifest()
  const files = (raw.files ?? {}) as Partial<ManifestFiles>
  return {
    ...raw,
    schemaVersion: raw.schemaVersion ?? 1,
    upgradeCode: raw.upgradeCode ?? base.upgradeCode,
    name: raw.name ?? '',
    manufacturer: raw.manufacturer ?? '',
    displayVersion: raw.displayVersion ?? base.displayVersion,
    targetDirectory: raw.targetDirectory ?? base.targetDirectory,
    architecture: raw.architecture ?? base.architecture,
    files: {
      ...files,
      declared: (files.declared ?? []).map((f) => ({ ...f, root: f.root ?? 'installFolder' })),
      harvest: (files.harvest ?? []).map((h) => ({ ...h, root: h.root ?? 'installFolder' })),
    },
    appInfo: { ...base.appInfo, ...(raw.appInfo ?? {}) },
    shortcuts: raw.shortcuts ?? [],
    registry: (raw.registry ?? []).map((r) => ({ ...r, name: r.name ?? '', value: r.value ?? '', valueType: r.valueType ?? 'string' })),
    environmentVariables: (raw.environmentVariables ?? []).map((e) => ({ ...e, value: e.value ?? '', action: e.action ?? 'set', part: e.part ?? 'all', system: e.system ?? false, permanent: e.permanent ?? false, separator: e.separator ?? ';' })),
    properties: raw.properties ?? [],
  }
}

/** RFC 7807-ish field -> messages, exactly as ManifestParser.Parse and Validation.Validate shape it. */
export type ValidationErrors = Record<string, string[]>
