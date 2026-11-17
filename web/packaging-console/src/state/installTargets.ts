import type { HarvestFolder, InstallRoot, InstallScope, PackageArchitecture, WinReleaseManifest } from '../types/manifest'

/**
 * The eight install roots the Files & Folders workspace's target tree navigates. See ADR 0033/0038.
 * `installFolder` is the product's own folder, nested wherever General's Target Directory field
 * resolves to; the other seven are raw WiX standard directories, for files placed loose at that
 * root rather than nested under the product's own folder. `label` is the WiX-literate bracket/
 * token form (used in the resolved-path footer, where staying unambiguous with the real Directory
 * Id matters); `friendlyName` is what the tree itself shows as each root's primary label, with
 * `label` demoted to a secondary badge - human-readable first, still exact underneath.
 */
export const INSTALL_ROOTS: { root: InstallRoot; label: string; friendlyName: string }[] = [
  { root: 'installFolder', label: '[INSTALLFOLDER]', friendlyName: 'Install Directory' },
  { root: 'programFiles64Folder', label: '[ProgramFiles64Folder]', friendlyName: 'Program Files (64-bit)' },
  { root: 'programFilesFolder', label: '[ProgramFilesFolder]', friendlyName: 'Program Files (32-bit)' },
  { root: 'commonFiles64Folder', label: '[CommonFiles64Folder]', friendlyName: 'Common Files (64-bit)' },
  { root: 'commonFilesFolder', label: '[CommonFilesFolder]', friendlyName: 'Common Files (32-bit)' },
  // SystemFolder/System64Folder's friendlyName here reflects the default x64/arm64 case (both
  // roots visible at once, so they need to read distinctly) - visibleInstallRoots relabels
  // systemFolder back to a plain "System Folder" for x86, where system64Folder is hidden and
  // there's nothing left to disambiguate from.
  { root: 'systemFolder', label: '[SystemFolder]', friendlyName: 'System Folder (32-bit)' },
  { root: 'system64Folder', label: '[System64Folder]', friendlyName: 'System Folder (64-bit)' },
  { root: 'appDataFolder', label: '[AppDataFolder]', friendlyName: 'AppData (Roaming)' },
  { root: 'localAppDataFolder', label: '[LocalAppDataFolder]', friendlyName: 'AppData (Local)' },
  { root: 'commonAppDataFolder', label: '[CommonAppDataFolder]', friendlyName: 'ProgramData' },
]

/** installFolder and the Program Files/Common Files roots are always usable; AppData/LocalAppData carry the per-user-under-per-machine-install caveat (ADR 0033). */
export const PER_USER_CAVEAT_ROOTS: ReadonlySet<InstallRoot> = new Set(['appDataFolder', 'localAppDataFolder']);

/** Every WiX StandardDirectory Id the Console exposes as a Target Directory root - mirrors WinRelease.Core.Manifest.TargetDirectoryResolver.KnownRootIds exactly. See ADR 0038. */
export const TARGET_DIRECTORY_ROOTS = [
  'ProgramFiles64Folder',
  'ProgramFilesFolder',
  'CommonFiles64Folder',
  'CommonFilesFolder',
  'SystemFolder',
  'System64Folder',
  'AppDataFolder',
  'LocalAppDataFolder',
  'CommonAppDataFolder',
] as const;

export type TargetDirectoryRootId = (typeof TARGET_DIRECTORY_ROOTS)[number];

/** Longest/most-specific prefixes first - mirrors TargetDirectoryResolver.LiteralPathPrefixes exactly. */
const LITERAL_TARGET_DIRECTORY_PREFIXES: [string, TargetDirectoryRootId][] = [
  ['C:\\Program Files (x86)\\Common Files\\', 'CommonFilesFolder'],
  ['C:\\Program Files\\Common Files\\', 'CommonFiles64Folder'],
  ['C:\\Program Files (x86)\\', 'ProgramFilesFolder'],
  ['C:\\Program Files\\', 'ProgramFiles64Folder'],
  ['C:\\ProgramData\\', 'CommonAppDataFolder'],
];

const SYSTEM32_PREFIX = 'c:\\windows\\system32\\'
const SYSWOW64_PREFIX = 'c:\\windows\\syswow64\\'

/**
 * The real, illustrative base path a Target Directory root resolves to - preview text only, never
 * sent to the build. `<installing user>` for AppData/LocalAppData is deliberately not a real
 * username - which profile it lands in isn't knowable until install time (ADR 0033/0005's caveat).
 * `SystemFolder` is the 32-bit system folder, which on 64-bit Windows (every Windows 11 PC) is `%WinDir%\SysWOW64` whatever the package's bitness - verified
 * by reading INSTALLFOLDER from MSIs built for x64 and x86 packages. `System64Folder` is the real `%WinDir%\System32`.
 */
export function exampleBasePath(rootId: string): string {
  switch (rootId) {
    case 'ProgramFiles64Folder':
      return 'C:\\Program Files'
    case 'ProgramFilesFolder':
      return 'C:\\Program Files (x86)'
    case 'CommonFiles64Folder':
      return 'C:\\Program Files\\Common Files'
    case 'CommonFilesFolder':
      return 'C:\\Program Files (x86)\\Common Files'
    case 'SystemFolder':
      return 'C:\\Windows\\SysWOW64'
    case 'System64Folder':
      return 'C:\\Windows\\System32'
    case 'AppDataFolder':
      return 'C:\\Users\\<installing user>\\AppData\\Roaming'
    case 'LocalAppDataFolder':
      return 'C:\\Users\\<installing user>\\AppData\\Local'
    case 'CommonAppDataFolder':
      return 'C:\\ProgramData'
    default:
      return rootId
  }
}

/** Splits a subpath on either separator, dropping empty segments (a leading/trailing/doubled slash). */
function splitPathSegments(rest: string): string[] {
  return rest.split(/[\\/]/).filter((segment) => segment.length > 0)
}

/**
 * Parses a Target Directory string into a known WiX root + subpath - accepts bracketed WiX
 * property syntax (`"[ProgramFiles64Folder]Acme\App"`) or an equivalent literal Windows path
 * (`"C:\Program Files\Acme\App"`), exactly mirroring
 * WinRelease.Core.Manifest.TargetDirectoryResolver.TryParse server-side. Returns null when
 * unrecognized (surfaced as a validation error by the backend, not re-validated here).
 */
export function parseTargetDirectory(raw: string, architecture: PackageArchitecture = 'x64'): { rootId: TargetDirectoryRootId; segments: string[] } | null {
  const trimmed = raw.trim()
  if (trimmed.length === 0) return null

  if (trimmed.startsWith('[')) {
    const closeIndex = trimmed.indexOf(']')
    if (closeIndex < 0) return null
    const token = trimmed.slice(1, closeIndex)
    if (!(TARGET_DIRECTORY_ROOTS as readonly string[]).includes(token)) return null
    return { rootId: token as TargetDirectoryRootId, segments: splitPathSegments(trimmed.slice(closeIndex + 1)) }
  }

  // The Windows system folders depend on the package's bitness (mirrors TargetDirectoryResolver.TryParse). In a 64-bit package, C:\\Windows\\System32 means the
  // real System32, which is System64Folder; SystemFolder is the 32-bit system folder, SysWOW64 on 64-bit Windows (verified with a real build). In a 32-bit
  // package, System32 is what a 32-bit program sees, which is SystemFolder. SysWOW64 is always SystemFolder.
  const lowered = trimmed.toLowerCase()
  if (lowered.startsWith(SYSTEM32_PREFIX)) {
    return { rootId: architecture === 'x86' ? 'SystemFolder' : 'System64Folder', segments: splitPathSegments(trimmed.slice(SYSTEM32_PREFIX.length)) }
  }
  if (lowered.startsWith(SYSWOW64_PREFIX)) {
    return { rootId: 'SystemFolder', segments: splitPathSegments(trimmed.slice(SYSWOW64_PREFIX.length)) }
  }

  for (const [prefix, rootId] of LITERAL_TARGET_DIRECTORY_PREFIXES) {
    if (trimmed.toLowerCase().startsWith(prefix.toLowerCase())) {
      return { rootId, segments: splitPathSegments(trimmed.slice(prefix.length)) }
    }
  }

  if ((TARGET_DIRECTORY_ROOTS as readonly string[]).includes(trimmed)) {
    return { rootId: trimmed as TargetDirectoryRootId, segments: [] }
  }

  return null
}

/** Composes a root + subpath back into bracketed WiX property syntax - what the "Browse..." picker writes into the Target Directory field. */
export function formatTargetDirectory(rootId: TargetDirectoryRootId, subpath: string): string {
  return `[${rootId}]${splitPathSegments(subpath).join('\\')}`
}

/**
 * Rewrites a raw OS literal path (`"C:\Program Files\Acme\App"`) into WiX bracket-property syntax
 * (`"[ProgramFiles64Folder]Acme\App"`) the moment its prefix matches a known system folder - so
 * Target Directory's stored value (and every badge/preview that echoes it) is never left holding a
 * hardcoded drive path. A value that's already bracketed, or doesn't (yet) match a known literal
 * prefix - including a value still mid-typed - passes through unchanged; ADR 0038's freeform field
 * stays freeform for anything this can't confidently map, it just never *silently keeps* a
 * recognized raw path around when a real property token exists for it.
 */
export function normalizeTargetDirectoryToken(raw: string, architecture: PackageArchitecture = 'x64'): string {
  if (raw.trim().startsWith('[')) return raw
  const parsed = parseTargetDirectory(raw, architecture)
  if (!parsed) return raw
  return formatTargetDirectory(parsed.rootId, parsed.segments.join('\\'))
}

/**
 * Friendly-label breadcrumb for wherever Target Directory actually nests Target Folder
 * (INSTALLFOLDER) - e.g. `["Program Files (64-bit)", "Acme", "App"]` for
 * `"[ProgramFiles64Folder]Acme\App"`. Target Folder itself always renders as one flat tree node
 * regardless of how deep this nests it, so without this, a Target Directory subpath is easy to read
 * as "missing" - it's real, it's just not a separately browsable tree entry (see TargetFileGrid's
 * Breadcrumb, which renders this ahead of Target Folder as non-interactive context). Empty for a
 * bare root (nothing to show) or an unparseable value.
 */
export function targetDirectoryNestingLabels(manifest: WinReleaseManifest): string[] {
  const parsed = parseTargetDirectory(manifest.targetDirectory, manifest.architecture)
  if (!parsed || parsed.segments.length === 0) return []
  const rootFriendlyName = INSTALL_ROOTS.find((r) => r.label === `[${parsed.rootId}]`)?.friendlyName ?? parsed.rootId
  return [rootFriendlyName, ...parsed.segments]
}

const RAW_ROOT_IDS: Partial<Record<InstallRoot, TargetDirectoryRootId>> = {
  commonFilesFolder: 'CommonFilesFolder',
  systemFolder: 'SystemFolder',
  appDataFolder: 'AppDataFolder',
  localAppDataFolder: 'LocalAppDataFolder',
  programFiles64Folder: 'ProgramFiles64Folder',
  programFilesFolder: 'ProgramFilesFolder',
  commonFiles64Folder: 'CommonFiles64Folder',
  commonAppDataFolder: 'CommonAppDataFolder',
  system64Folder: 'System64Folder',
}

function installFolderBasePath(manifest: WinReleaseManifest): string {
  const parsed = parseTargetDirectory(manifest.targetDirectory, manifest.architecture)
  if (!parsed) return exampleBasePath('ProgramFiles64Folder')
  const subpath = parsed.segments.length > 0 ? `\\${parsed.segments.join('\\')}` : ''
  return `${exampleBasePath(parsed.rootId)}${subpath}`
}

/**
 * Collapses any run of backslashes into one. `installFolder`'s Target Directory is freeform
 * (ADR 0038) - a user can type/paste a value that already ends in `\`, and naively appending this
 * UI's own trailing separator on top of that produces a visible `\\` artifact. Applied defensively
 * to every display string built by concatenating a literal `\` onto a value this UI doesn't fully
 * control.
 */
function collapseBackslashes(path: string): string {
  return path.replace(/\\{2,}/g, '\\')
}

/** Illustrative resolved OS path for a target - Files & Folders' live footer bar. */
export function resolvedPathPreview(manifest: WinReleaseManifest, target: ActiveTarget): string {
  const base = target.root === 'installFolder' ? installFolderBasePath(manifest) : exampleBasePath(RAW_ROOT_IDS[target.root]!)
  const suffix = target.prefix.length > 0 ? `\\${target.prefix.replace(/\//g, '\\')}` : ''
  return collapseBackslashes(`${base}${suffix}\\`)
}

/**
 * The WiX-token/bracket form of a target's full path - FilesSection's "Selected Target" footer.
 * `installFolder`'s base is the raw (freeform, ADR 0038) Target Directory value itself, which may
 * already end in `\` - `collapseBackslashes` keeps that from doubling up with the trailing
 * separator this function always appends.
 */
export function selectedTargetTokenPreview(manifest: WinReleaseManifest, target: ActiveTarget): string {
  const base = target.root === 'installFolder' ? normalizeTargetDirectoryToken(manifest.targetDirectory, manifest.architecture) : (INSTALL_ROOTS.find((r) => r.root === target.root)?.label ?? target.root)
  const suffix = target.prefix.length > 0 ? `\\${target.prefix.replace(/\//g, '\\')}` : ''
  return collapseBackslashes(`${base}${suffix}\\`)
}

/** Raw roots that only make sense for a 64-bit build - hidden when Architecture is x86 (a 32-bit package installed loose under the real Program Files/Common Files is a real WOW64 mismatch, not just unusual). */
const SIXTY_FOUR_BIT_ONLY_ROOTS: ReadonlySet<InstallRoot> = new Set(['programFiles64Folder', 'commonFiles64Folder', 'system64Folder'])
const SIXTY_FOUR_BIT_ONLY_TARGET_DIRECTORY_ROOTS: ReadonlySet<TargetDirectoryRootId> = new Set(['ProgramFiles64Folder', 'CommonFiles64Folder', 'System64Folder'])

/** Bitness badge for the tree's system/Program Files/Common Files roots - purely informational, doesn't affect anything about how the file installs. Roots with no fixed bitness (installFolder, AppData, ProgramData) get none. */
const ROOT_BITNESS: Partial<Record<InstallRoot, '64-bit' | '32-bit'>> = {
  programFiles64Folder: '64-bit',
  commonFiles64Folder: '64-bit',
  system64Folder: '64-bit',
  programFilesFolder: '32-bit',
  commonFilesFolder: '32-bit',
  systemFolder: '32-bit',
}

export function bitnessBadge(root: InstallRoot): '64-bit' | '32-bit' | undefined {
  return ROOT_BITNESS[root]
}

/** The Program Files root a build's Architecture canonically installs to - x64/arm64 both use the real (64-bit) Program Files; x86 uses the WOW64 Program Files (x86). */
export function defaultProgramFilesRootId(architecture: PackageArchitecture): 'ProgramFiles64Folder' | 'ProgramFilesFolder' {
  return architecture === 'x86' ? 'ProgramFilesFolder' : 'ProgramFiles64Folder'
}

/** The raw TargetDirectoryRootId that `installFolder`'s Target Directory resolves to exactly, when it has no subpath - null otherwise (a subpath makes it a distinct real subfolder, not a duplicate of the raw root). */
function bareTargetDirectoryRootMatch(manifest: WinReleaseManifest): TargetDirectoryRootId | null {
  const parsed = parseTargetDirectory(manifest.targetDirectory, manifest.architecture)
  if (!parsed || parsed.segments.length > 0) return null
  return parsed.rootId
}

/**
 * `INSTALL_ROOTS` filtered for display: drops the 64-bit-only raw roots when building x86, and drops
 * whichever raw root exactly duplicates the resolved `installFolder` target when Target Directory is
 * a bare root with no subpath (e.g. Target Directory left at "[ProgramFiles64Folder]" verbatim) -
 * otherwise Application Folder and that raw root would show as two tree nodes for the identical WiX
 * StandardDirectory. Application Folder itself is never filtered - it's always the primary root.
 */
export function visibleInstallRoots(manifest: WinReleaseManifest): typeof INSTALL_ROOTS {
  const duplicateOfInstallFolder = bareTargetDirectoryRootMatch(manifest)
  return INSTALL_ROOTS.filter(({ root }) => {
    if (root === 'installFolder') return true
    if (manifest.architecture === 'x86' && SIXTY_FOUR_BIT_ONLY_ROOTS.has(root)) return false
    if (duplicateOfInstallFolder && RAW_ROOT_IDS[root] === duplicateOfInstallFolder) return false
    return true
  }).map((entry) =>
    // system64Folder is hidden on x86 (filtered above), so systemFolder is the only "System
    // Folder" row left there - nothing left to disambiguate "(32-bit)" from, so drop the suffix.
    entry.root === 'systemFolder' && manifest.architecture === 'x86' ? { ...entry, friendlyName: 'System Folder' } : entry,
  )
}

/** `TARGET_DIRECTORY_ROOTS` filtered for the Browse modal's root dropdown - same x86/64-bit-only rule as `visibleInstallRoots`, so a 32-bit build can't compose a 64-bit Program Files/Common Files path there either. */
export function visibleTargetDirectoryRoots(architecture: PackageArchitecture): TargetDirectoryRootId[] {
  if (architecture !== 'x86') return [...TARGET_DIRECTORY_ROOTS]
  return TARGET_DIRECTORY_ROOTS.filter((id) => !SIXTY_FOUR_BIT_ONLY_TARGET_DIRECTORY_ROOTS.has(id))
}

/**
 * Rewrites Target Directory's root to match a newly-chosen Architecture, preserving any subpath -
 * only when the current root is exactly one of the two Program Files variants (a recognizable
 * "default" root, not something hand-picked for another reason). A custom literal path or a
 * non-Program-Files root (AppDataFolder, SystemFolder, etc.) is left untouched - this is a
 * convenience default, never a forced rewrite of a root the user chose on purpose.
 */
export function targetDirectoryForArchitectureChange(manifest: WinReleaseManifest, architecture: PackageArchitecture): string {
  const parsed = parseTargetDirectory(manifest.targetDirectory, manifest.architecture)
  if (!parsed || (parsed.rootId !== 'ProgramFiles64Folder' && parsed.rootId !== 'ProgramFilesFolder')) return manifest.targetDirectory

  const nextRoot = defaultProgramFilesRootId(architecture)
  return parsed.rootId === nextRoot ? manifest.targetDirectory : formatTargetDirectory(nextRoot, parsed.segments.join('\\'))
}

/** Applies a single Target Architecture selection, moving Target Directory's default root along with it. */
export function setArchitecture(manifest: WinReleaseManifest, architecture: PackageArchitecture): WinReleaseManifest {
  return {
    ...manifest,
    architecture,
    targetDirectory: targetDirectoryForArchitectureChange(manifest, architecture),
  }
}

export interface ActiveTarget {
  root: InstallRoot
  /** Slash-separated subfolder path under the root, "" for the root itself. */
  prefix: string
}

/** Immediate child subfolder names declared under a root+prefix, derived purely from InstallPath segments - no separate directory state to keep in sync. */
export function subfoldersUnderTarget(manifest: WinReleaseManifest, target: ActiveTarget): string[] {
  const names = new Set<string>();
  const prefixSegments = target.prefix.length > 0 ? target.prefix.split('/') : [];

  for (const path of allInstallPathsUnderRoot(manifest, target.root)) {
    const segments = path.split('/');
    // Need at least one directory segment between the prefix and the file
    // itself - a file living directly at the prefix isn't a subfolder.
    if (segments.length <= prefixSegments.length + 1) continue;
    if (prefixSegments.some((segment, i) => segments[i] !== segment)) continue;

    names.add(segments[prefixSegments.length]);
  }

  return [...names].sort();
}

/** Declared Files (with their index) directly under a root+prefix - not in a deeper subfolder. */
export function declaredFilesAtTarget(manifest: WinReleaseManifest, target: ActiveTarget) {
  return manifest.files.declared
    .map((file, index) => ({ file, index }))
    .filter(({ file }) => file.root === target.root && directoryOf(file.installPath) === target.prefix);
}

/** Harvest Folders (with their index) directly under a root+prefix. */
export function harvestFoldersAtTarget(manifest: WinReleaseManifest, target: ActiveTarget) {
  return manifest.files.harvest
    .map((folder, index) => ({ folder, index }))
    .filter(({ folder }) => folder.root === target.root && directoryOf(folder.installPath) === target.prefix);
}

function allInstallPathsUnderRoot(manifest: WinReleaseManifest, root: InstallRoot): string[] {
  return [
    ...manifest.files.declared.filter((f) => f.root === root).map((f) => f.installPath),
    ...manifest.files.harvest.filter((f) => f.root === root).map((f) => f.installPath),
  ];
}

/**
 * Every real subfolder path under a root, at every nesting depth (not just immediate children, the
 * way subfoldersUnderTarget is) - "bin", "bin/plugins", "docs" all show up separately for a project
 * with a file at "bin/plugins/x.dll" and another at "docs/readme.txt". Used purely as datalist
 * autocomplete suggestions in DirectoryPickerModal's free-text Subfolder field, never to restrict
 * what can be typed there - a brand-new path with nothing under it yet is just as valid (ADR 0073's
 * "touch the directory chain" fix means WxsGenerator emits it either way).
 */
export function allSubfolderPathsUnderRoot(manifest: WinReleaseManifest, root: InstallRoot): string[] {
  const paths = new Set<string>()
  for (const installPath of allInstallPathsUnderRoot(manifest, root)) {
    const segments = installPath.split('/').slice(0, -1)
    for (let i = 0; i < segments.length; i++) {
      paths.add(segments.slice(0, i + 1).join('/'))
    }
  }
  return [...paths].sort()
}

function directoryOf(installPath: string): string {
  const segments = installPath.split('/');
  return segments.slice(0, -1).join('/');
}

/** The trailing filename/foldername segment of an installPath - what a Name cell edits, and what drag-to-move keeps unchanged while the folder prefix changes. */
export function fileNameOf(installPath: string): string {
  return installPath.split('/').pop() ?? installPath;
}

/** DataTransfer MIME type for an in-app file/harvest-folder row drag (TargetFileGrid -> TargetDirectoryTree/TargetFileGrid) - distinguishes an internal move from an external OS file drop, which uses no custom type at all. */
export const MOVE_ENTRY_DATA_TYPE = 'application/x-winrelease-move-entry';

export interface MoveEntryEntry {
  kind: 'declared' | 'harvest';
  index: number;
}

/**
 * One or more Declared Files/Harvest Folders being drag-relocated at once. A row dragged while it's
 * part of a multi-selection carries every selected entry (Explorer-style "drag one of several
 * selected items moves the whole selection"), not just the row the drag started on - see
 * FilesSection's `moveEntry`.
 */
export interface MoveEntryPayload {
  entries: MoveEntryEntry[];
}

/** What was right-clicked in TargetDirectoryTree/TargetFileGrid - drives which actions FilesSection's shared ContextMenu offers. */
export type FileContextTarget =
  | { kind: 'folder'; target: ActiveTarget; isRoot: boolean }
  | { kind: 'declared'; index: number }
  | { kind: 'harvest'; index: number };

/**
 * Stable multi-select keys for TargetFileGrid's checkboxes - deliberately not array index (which
 * shifts under add/remove/move elsewhere while a selection is held across renders). Declared Files
 * already have a real Id; Harvest Folders don't, so root+installPath stands in - the same pair
 * already used everywhere else as a Harvest Folder's effective identity (isTargetOccupied,
 * moveEntry's collision checks).
 */
export function declaredSelectionKey(id: string): string {
  return `declared:${id}`;
}

export function harvestSelectionKey(root: InstallRoot, installPath: string): string {
  return `harvest:${root}:${installPath}`;
}

export function joinInstallPath(prefix: string, name: string): string {
  return prefix.length > 0 ? `${prefix}/${name}` : name;
}

/**
 * "Graceful Ingestion, Deferred Native Errors" pass: dropped the invented Windows folder-name rule
 * set this used to enforce (illegal characters, trailing space/period, reserved device names) -
 * Rule 1, let native `wix build` be the sole evaluator of WiX-level path validity; this Console no
 * longer pre-emptively rejects a value native `wix.exe` doesn't reliably reject either. What's left
 * here is a genuinely different, narrower concern: a folder name containing `/` or `\` would break
 * this app's *own* internal path model (`installPath` is `/`-joined throughout this module) before
 * it ever reaches WiX at all - that's not a "let's be extra strict" heuristic, it's a real
 * structural requirement of how this Console represents folders internally.
 */
function containsPathSeparator(segment: string): boolean {
  return segment.includes('/') || segment.includes('\\')
}

/**
 * A folder name typed into "New Folder"/rename. Trims surrounding whitespace first (a forgiving,
 * expected UX for an interactive single-name prompt), then only checks that it's non-empty and
 * doesn't contain a path separator - see the note above on why that's the one thing still checked
 * client-side.
 */
export function isValidFolderName(name: string): boolean {
  const trimmed = name.trim()
  return trimmed.length > 0 && !containsPathSeparator(trimmed)
}

/** The reason a "New Folder"/rename name would be rejected, or null if it's valid - same trim-then-check behavior as isValidFolderName, for surfacing *why* in the UI instead of silently doing nothing. */
export function folderNameError(name: string): string | null {
  const trimmed = name.trim()
  if (trimmed.length === 0) return "a folder name can't be empty."
  if (containsPathSeparator(trimmed)) return `'${trimmed}' can't contain '/' or '\\' - WinRelease uses those to represent nested folders internally.`
  return null
}

/**
 * Folders aren't first-class entities - they're purely derived from Declared File / Harvest
 * Folder installPath segments (see subfoldersUnderTarget). Renaming one is therefore a batch
 * rewrite: every installPath at-or-under root+oldPrefix moves to the same relative location under
 * newPrefix, and any Shortcut's auto-derived `wr:dir:{root}:{path}` WorkingDirectory sentinel
 * (ADR 0035) pointing into that folder is rewritten too - otherwise it would keep resolving to a
 * Directory Id hash of a path nothing declares anymore, which WxsGenerator/`wix build` would
 * reject as an unresolved symbol. A hand-typed literal WiX Directory Id (not the sentinel) is left
 * untouched - it's opaque by design (ADR 0035), not something this can safely rewrite.
 */
export function renameFolder(manifest: WinReleaseManifest, root: InstallRoot, oldPrefix: string, newPrefix: string): WinReleaseManifest {
  if (oldPrefix === newPrefix) return manifest;

  const rewrite = (path: string): string => {
    if (path === oldPrefix) return newPrefix;
    if (path.startsWith(`${oldPrefix}/`)) return newPrefix + path.slice(oldPrefix.length);
    return path;
  };

  const declared = manifest.files.declared.map((file) => (file.root === root ? { ...file, installPath: rewrite(file.installPath) } : file));
  const harvest = manifest.files.harvest.map((folder) => (folder.root === root ? { ...folder, installPath: rewrite(folder.installPath) } : folder));

  const sentinelPrefix = `wr:dir:${root}:`;
  const shortcuts = manifest.shortcuts.map((shortcut) => {
    if (!shortcut.workingDirectory?.startsWith(sentinelPrefix)) return shortcut;
    const relativePath = shortcut.workingDirectory.slice(sentinelPrefix.length);
    const rewritten = rewrite(relativePath);
    return rewritten === relativePath ? shortcut : { ...shortcut, workingDirectory: `${sentinelPrefix}${rewritten}` };
  });

  return { ...manifest, files: { declared, harvest }, shortcuts };
}

/**
 * Bulk-removes everything at-or-under root+prefix: every Declared File, every Harvest Folder, and
 * (mirroring renameFolder's care) any Shortcut's `wr:dir:{root}:{path}` sentinel pointing into the
 * deleted folder gets cleared back to null (falls back to INSTALLFOLDER) rather than left dangling
 * on a Directory Id nothing declares anymore. A hand-typed literal WorkingDirectory is left as-is,
 * same reasoning as renameFolder - it's opaque by design (ADR 0035).
 */
export function deleteFolder(manifest: WinReleaseManifest, root: InstallRoot, prefix: string): WinReleaseManifest {
  const isUnder = (installPath: string) => installPath === prefix || installPath.startsWith(`${prefix}/`);

  const declared = manifest.files.declared.filter((file) => !(file.root === root && isUnder(file.installPath)));
  const harvest = manifest.files.harvest.filter((folder) => !(folder.root === root && isUnder(folder.installPath)));

  const sentinelPrefix = `wr:dir:${root}:`;
  const shortcuts = manifest.shortcuts.map((shortcut) => {
    if (!shortcut.workingDirectory?.startsWith(sentinelPrefix)) return shortcut;
    const relativePath = shortcut.workingDirectory.slice(sentinelPrefix.length);
    return isUnder(relativePath) ? { ...shortcut, workingDirectory: null } : shortcut;
  });

  return { ...manifest, files: { declared, harvest }, shortcuts };
}

/**
 * Total declared files + harvest folders at-or-under a target, recursive - the tree's live
 * file-count badge. Harvest folders count as one item each (the files inside aren't knowable
 * client-side until a real build scans them).
 */
export function itemCountUnderTarget(manifest: WinReleaseManifest, target: ActiveTarget): number {
  const isUnderPrefix = (installPath: string) =>
    target.prefix.length === 0 || installPath === target.prefix || installPath.startsWith(`${target.prefix}/`);

  const declared = manifest.files.declared.filter((f) => f.root === target.root && isUnderPrefix(f.installPath)).length;
  const harvest = manifest.files.harvest.filter((f) => f.root === target.root && isUnderPrefix(f.installPath)).length;
  return declared + harvest;
}

/**
 * The Console's "wr:dir:{root}:{relativePath}" sentinel (ADR 0035) - WxsGenerator resolves it
 * server-side to the exact deterministic Directory Id a real folder there would get, so a
 * Shortcut's WorkingDirectory can be auto-derived here without duplicating that hashing in TS.
 * Still just a plain string the manifest author can freely overwrite - a convenience default,
 * never enforced.
 */
export function workingDirectorySentinel(root: InstallRoot, relativePath: string): string {
  return `wr:dir:${root}:${relativePath}`;
}

/** Convenience wrapper: derives the sentinel for the folder a given install path already lives in. */
export function workingDirectorySentinelForInstallPath(root: InstallRoot, installPath: string): string {
  return workingDirectorySentinel(root, directoryOf(installPath));
}

const SHORTCUT_LOCATION_LABELS: Record<string, string> = {
  DesktopFolder: 'Desktop',
  ProgramMenuFolder: 'Start Menu',
  StartupFolder: 'Startup (run on boot)',
  PersonalFolder: 'Documents',
  FavoritesFolder: 'Favorites',
  FontsFolder: 'Fonts',
  SendToFolder: 'Send To',
  TemplateFolder: 'Templates',
  INSTALLFOLDER: 'Install Directory',
  // Back-compat: a manifest saved before Location became a free string may still have one of
  // these on disk (the old enum's camelCase JSON wire value) - label them the same either way.
  desktopFolder: 'Desktop',
  programMenuFolder: 'Start Menu',
  startupFolder: 'Startup (run on boot)',
}

/** The sentinel root tokens for the shell folders - not InstallRoots (nothing ever installs a regular file there), but still valid wr:dir: roots so a Shortcut's Location can nest into a named subfolder under one (a Start Menu "program group" being the one real convention). Mirrors WxsGenerator.ShellFolderSentinelRoots exactly. */
const SHELL_FOLDER_SENTINEL_ROOTS: Record<string, string> = {
  desktopFolder: 'Desktop',
  programMenuFolder: 'Start Menu',
  startupFolder: 'Startup (run on boot)',
  personalFolder: 'Documents',
  favoritesFolder: 'Favorites',
  fontsFolder: 'Fonts',
  sendToFolder: 'Send To',
  templateFolder: 'Templates',
}

/**
 * Splits any Shortcut Location/WorkingDirectory value - a bare preset literal (PascalCase or the
 * legacy lowercase form), a "wr:dir:{root}:{relativePath}" sentinel, or a hand-typed literal with
 * nothing structured to say about it - into a {root, subpath} pair DirectoryPickerModal can seed
 * its Root/Subfolder fields from. `root` is either a shell-folder token ("desktopFolder" etc.) or
 * an InstallRoot token; a hand-typed literal falls back to {installFolder, ''} (Install Directory),
 * same "pick something reasonable, never block" spirit as every other default in this file. Mirrors
 * WxsGenerator.EffectiveShortcutLocation's null/empty default (Start Menu) for the bare-value case.
 */
export function parseDirectoryReference(raw: string | null | undefined): { root: string; subpath: string } {
  const effective = raw && raw.length > 0 ? raw : 'ProgramMenuFolder'

  const bareLiteralRoots: Record<string, string> = {
    DesktopFolder: 'desktopFolder',
    ProgramMenuFolder: 'programMenuFolder',
    StartupFolder: 'startupFolder',
    PersonalFolder: 'personalFolder',
    FavoritesFolder: 'favoritesFolder',
    FontsFolder: 'fontsFolder',
    SendToFolder: 'sendToFolder',
    TemplateFolder: 'templateFolder',
    desktopFolder: 'desktopFolder',
    programMenuFolder: 'programMenuFolder',
    startupFolder: 'startupFolder',
    INSTALLFOLDER: 'installFolder',
  }
  if (effective in bareLiteralRoots) return { root: bareLiteralRoots[effective], subpath: '' }

  const sentinelPrefix = 'wr:dir:'
  if (effective.startsWith(sentinelPrefix)) {
    const rest = effective.slice(sentinelPrefix.length)
    const separatorIndex = rest.indexOf(':')
    if (separatorIndex >= 0) {
      return { root: rest.slice(0, separatorIndex), subpath: rest.slice(separatorIndex + 1) }
    }
  }

  return { root: 'installFolder', subpath: '' } // a hand-typed literal or malformed sentinel - nothing structured to seed with
}

/**
 * A human-readable label for any Shortcut.location value - one of the three shell-folder presets,
 * a "wr:dir:{root}:{relativePath}" sentinel pointing into the project's own install tree (resolved
 * the same way Files & Folders' breadcrumb reads a target), or a raw hand-typed Directory Id (shown
 * verbatim - nothing more specific to say about it).
 */
export function describeShortcutLocation(manifest: WinReleaseManifest, raw: string | null | undefined): string {
  if (raw && !(raw in SHORTCUT_LOCATION_LABELS) && !raw.startsWith('wr:dir:')) return raw // a hand-typed literal - nothing more to say

  const { root, subpath } = parseDirectoryReference(raw)
  const shellFolderLabel = SHELL_FOLDER_SENTINEL_ROOTS[root]
  const rootLabel = shellFolderLabel ?? visibleInstallRoots(manifest).find((r) => r.root === root)?.friendlyName ?? root
  return subpath.length === 0 ? rootLabel : `${rootLabel} \\ ${subpath.replace(/\//g, ' \\ ')}`
}

/**
 * The Start Menu "program group" subpath for a Location value already pointing at Start Menu -
 * "" for the bare preset (no group yet), the real subpath for a "wr:dir:programMenuFolder:{path}"
 * sentinel. Returns undefined for anything else (Desktop/Startup, the install tree, a hand-typed
 * literal) - ShortcutDetailPanel uses that to show/hide the "Program Group" field.
 */
export function programMenuGroupSubpath(raw: string | null | undefined): string | undefined {
  const { root, subpath } = parseDirectoryReference(raw)
  return root === 'programMenuFolder' ? subpath : undefined
}

/** Builds the Location value for a Start Menu program-group subpath - "" collapses back to the plain preset (simpler/more readable than an empty sentinel), a real subpath becomes the wr:dir: sentinel. Accepts either slash as input (users type "\\", same as Explorer) but always stores "/" internally, same convention as every other install path in this file. */
export function programMenuGroupLocation(subpath: string): string {
  const trimmed = subpath.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
  return trimmed.length === 0 ? 'ProgramMenuFolder' : `wr:dir:programMenuFolder:${trimmed}`
}

const ILLEGAL_PATH_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g

function folderSegment(raw: string): string {
  return raw.replace(ILLEGAL_PATH_CHARS, '').trim().replace(/[. ]+$/, '')
}

/**
 * `Manufacturer\Name` with unusable characters stripped; either half is dropped when blank. Under
 * `LocalAppDataFolder` it is prefixed with `Programs\` - the per-user convention (%LocalAppData%\Programs),
 * so a per-user app lands beside the OS's own per-user installs rather than loose in the profile (ADR 0051).
 */
export function defaultInstallSubpath(manufacturer: string, name: string, root: TargetDirectoryRootId = 'ProgramFiles64Folder'): string {
  const segments = [manufacturer, name].map(folderSegment).filter(Boolean)
  return (root === 'LocalAppDataFolder' ? ['Programs', ...segments] : segments).join('\\')
}

/**
 * The Install Directory a project gets by default (ADR 0048): `[ProgramFiles64Folder]Manufacturer\Name`,
 * so a first build never drops files straight into C:\Program Files\. `root` keeps whichever root the
 * user already chose.
 */
export function defaultTargetDirectory(manufacturer: string, name: string, root: TargetDirectoryRootId = 'ProgramFiles64Folder'): string {
  return formatTargetDirectory(root, defaultInstallSubpath(manufacturer, name, root))
}

/**
 * Follows a Name/Manufacturer edit with the Install Directory - but only while the directory is still
 * the untouched auto-derived value for the *previous* Name/Manufacturer. Once the user has typed or
 * browsed their own path it is left alone.
 */
export function withNameOrManufacturerChange(manifest: WinReleaseManifest, next: { name?: string; manufacturer?: string }): WinReleaseManifest {
  const updated = { ...manifest, ...next }
  const parsed = parseTargetDirectory(manifest.targetDirectory, manifest.architecture)
  // A bare root (nothing chosen yet) stays bare: WinRelease suggests a folder (suggestedTargetDirectory) but never fills one in unasked (ADR 0095).
  if (!parsed || isBareTarget(parsed)) return updated

  const wasAuto = parsed.segments.join('\\') === defaultInstallSubpath(manifest.manufacturer, manifest.name, parsed.rootId)
  if (!wasAuto) return updated

  return { ...updated, targetDirectory: defaultTargetDirectory(updated.manufacturer, updated.name, parsed.rootId) }
}

/** True while no folder has been chosen: the bare root, or `[LocalAppDataFolder]Programs` (the per-user equivalent of a bare root). */
function isBareTarget(parsed: { rootId: string; segments: string[] }): boolean {
  const { rootId, segments } = parsed
  return segments.length === 0 || (rootId === 'LocalAppDataFolder' && segments.length === 1 && segments[0].toLowerCase() === 'programs')
}

/** The `Manufacturer\Name` folder WinRelease would suggest under the current root, offered as a one-click choice and never applied automatically. Null when nothing is left to suggest or a folder is already chosen. */
export function suggestedTargetDirectory(manifest: WinReleaseManifest): string | null {
  const parsed = parseTargetDirectory(manifest.targetDirectory, manifest.architecture)
  if (!parsed || !isBareTarget(parsed)) return null

  const suggestion = defaultTargetDirectory(manifest.manufacturer, manifest.name, parsed.rootId)
  return manifest.manufacturer.trim() || manifest.name.trim() ? suggestion : null
}

/** The root an auto-derived Install Directory uses for a scope (ADR 0051). */
function autoRootFor(manifest: WinReleaseManifest, scope: InstallScope): TargetDirectoryRootId {
  if (scope === 'perUser') return 'LocalAppDataFolder'
  return manifest.architecture === 'x86' ? 'ProgramFilesFolder' : 'ProgramFiles64Folder'
}

const AUTO_ROOTS: readonly TargetDirectoryRootId[] = ['ProgramFiles64Folder', 'ProgramFilesFolder', 'LocalAppDataFolder']

/**
 * Switches the install scope and, only while the Install Directory is still the untouched auto-derived
 * value, moves it to the matching root: per-user goes to `[LocalAppDataFolder]Programs\Manufacturer\Name`
 * (no admin rights needed to write there), per-machine back to Program Files. A path the user typed or
 * browsed is never touched - `scopeWarnings` flags it instead.
 */
export function withInstallScope(manifest: WinReleaseManifest, scope: InstallScope): WinReleaseManifest {
  const updated = { ...manifest, appInfo: { ...manifest.appInfo, installScope: scope } }
  const parsed = parseTargetDirectory(manifest.targetDirectory, manifest.architecture)
  if (!parsed || !AUTO_ROOTS.includes(parsed.rootId)) return updated

  // A bare root (nothing chosen) moves with the scope and stays bare.
  if (isBareTarget(parsed)) return { ...updated, targetDirectory: defaultTargetDirectory('', '', autoRootFor(manifest, scope)) }

  const wasAuto = parsed.segments.join('\\') === defaultInstallSubpath(manifest.manufacturer, manifest.name, parsed.rootId)
  if (!wasAuto) return updated

  return { ...updated, targetDirectory: defaultTargetDirectory(manifest.manufacturer, manifest.name, autoRootFor(manifest, scope)) }
}

/** Roots that need administrator rights to write to - a per-user (non-elevated) install can't use them. */
const ADMIN_ONLY_ROOTS: ReadonlySet<string> = new Set([
  'ProgramFiles64Folder',
  'ProgramFilesFolder',
  'CommonFiles64Folder',
  'CommonFilesFolder',
  'SystemFolder',
  'System64Folder',
  'CommonAppDataFolder',
  'programFiles64Folder',
  'programFilesFolder',
  'commonFiles64Folder',
  'commonFilesFolder',
  'systemFolder',
  'system64Folder',
  'commonAppDataFolder',
])

/**
 * Things in a per-user package that will fail (or need admin) when installed without elevation. Advisory
 * only - nothing blocks the build. Verified: an HKLM write in a non-elevated per-user install fails with
 * MSI Error 1406 and rolls back (ADR 0051).
 */
export function scopeWarnings(manifest: WinReleaseManifest): string[] {
  if (manifest.appInfo.installScope !== 'perUser') return []

  const warnings: string[] = []
  const parsed = parseTargetDirectory(manifest.targetDirectory, manifest.architecture)
  if (parsed && ADMIN_ONLY_ROOTS.has(parsed.rootId)) {
    warnings.push('The Install Directory is under a folder that needs administrator rights, so a per-user install without admin will fail. Use [LocalAppDataFolder]Programs\\... instead.')
  }

  const hklm = manifest.registry.filter((r) => r.root === 'hklm').length
  if (hklm > 0) {
    warnings.push(`${hklm} registry entr${hklm === 1 ? 'y writes' : 'ies write'} to HKEY_LOCAL_MACHINE, which a per-user install can't do without admin - use HKEY_CURRENT_USER.`)
  }

  const adminFiles = [...manifest.files.declared, ...manifest.files.harvest].filter((f) => ADMIN_ONLY_ROOTS.has(f.root)).length
  if (adminFiles > 0) {
    warnings.push(`${adminFiles} file location${adminFiles === 1 ? '' : 's'} target a folder that needs administrator rights.`)
  }

  return warnings
}

// ---------------------------------------------------------------------------------------------------------------------------
// Imported (harvest) folders are browsable like any other folder (ADR 0097). The manifest only records "everything under
// this source folder goes here"; the Console shows what is inside from the files it has staged this session.
// ---------------------------------------------------------------------------------------------------------------------------

function normalizeSourcePath(path: string): string {
  return path.split(String.fromCharCode(92)).join('/').replace(/^\.\//, '').replace(/^\/+/, '').replace(/\/+$/, '')
}

export interface HarvestView {
  folder: HarvestFolder
  index: number
  /** Immediate subfolder names inside the imported folder at this level. */
  folders: string[]
  /** Files directly at this level, with the staged key they came from. */
  files: { name: string; sourcePath: string }[]
  /** Every staged file at or under this level. */
  totalFiles: number
}

/** When `target` is an imported folder (or a folder inside one), what is in it at this level - null for an ordinary folder. */
export function harvestViewAt(manifest: WinReleaseManifest, sourcePaths: string[], target: ActiveTarget): HarvestView | null {
  for (let index = 0; index < manifest.files.harvest.length; index++) {
    const folder = manifest.files.harvest[index]
    if (folder.root !== target.root) continue
    if (target.prefix !== folder.installPath && !target.prefix.startsWith(`${folder.installPath}/`)) continue

    const relative = target.prefix === folder.installPath ? '' : target.prefix.slice(folder.installPath.length + 1)
    const directory = [normalizeSourcePath(folder.sourceFolder), relative].filter((part) => part.length > 0).join('/')
    const directoryPrefix = directory.length > 0 ? `${directory}/` : ''

    const folders = new Set<string>()
    const files: { name: string; sourcePath: string }[] = []
    let totalFiles = 0
    for (const raw of sourcePaths) {
      const path = normalizeSourcePath(raw)
      if (!path.startsWith(directoryPrefix) || path.length === directoryPrefix.length) continue

      totalFiles++
      const rest = path.slice(directoryPrefix.length)
      const slash = rest.indexOf('/')
      if (slash === -1) files.push({ name: rest, sourcePath: raw })
      else folders.add(rest.slice(0, slash))
    }

    return { folder, index, folders: [...folders].sort(), files: files.sort((a, b) => a.name.localeCompare(b.name)), totalFiles }
  }
  return null
}

/** Immediate subfolders of a target: those implied by file paths, imported folders sitting here, and folders inside an imported folder. */
export function subfoldersWithHarvest(manifest: WinReleaseManifest, sourcePaths: string[], target: ActiveTarget): string[] {
  const names = new Set(subfoldersUnderTarget(manifest, target))
  for (const { folder } of harvestFoldersAtTarget(manifest, target)) names.add(fileNameOf(folder.installPath))
  for (const name of harvestViewAt(manifest, sourcePaths, target)?.folders ?? []) names.add(name)
  return [...names].sort()
}

/** Files directly in this folder (not in subfolders) - the tree's badge. Imported folders are folders, so they are not counted as items of their parent. */
export function itemCountDirectlyAt(manifest: WinReleaseManifest, sourcePaths: string[], target: ActiveTarget): number {
  const view = harvestViewAt(manifest, sourcePaths, target)
  return declaredFilesAtTarget(manifest, target).length + (view ? view.files.length : 0)
}

/** Like itemCountUnderTarget, but counts the real files inside an imported folder (when staged) so hide-empty does not hide its subfolders. */
export function itemCountUnderTargetWithHarvest(manifest: WinReleaseManifest, sourcePaths: string[], target: ActiveTarget): number {
  const view = harvestViewAt(manifest, sourcePaths, target)
  if (!view) return itemCountUnderTarget(manifest, target)

  // The imported folder itself always counts as something, even when its files are not loaded this session.
  return Math.max(view.totalFiles, target.prefix === view.folder.installPath ? 1 : 0)
}

/**
 * The folders between a standard root and the Install Directory (e.g. "Sample Company" in Program Files > Sample Company > Hello Installer) are
 * part of the path General's Install Directory field spells out. They can be selected to see where they sit, but nothing is added to them:
 * the files go in the Install Directory below. Returns the next folder down and the Install Directory's name when `target` is one of them.
 */
export function installPathAncestorInfo(manifest: WinReleaseManifest, target: ActiveTarget): { childName: string; installName: string } | null {
  const parsed = parseTargetDirectory(manifest.targetDirectory, manifest.architecture)
  if (!parsed || parsed.segments.length < 2 || target.prefix === '') return null

  const nestRoot = INSTALL_ROOTS.find((r) => r.label === `[${parsed.rootId}]`)?.root
  if (!nestRoot || target.root !== nestRoot) return null

  const ancestors = parsed.segments.slice(0, -1)
  const prefixSegments = target.prefix.split('/')
  if (prefixSegments.length > ancestors.length || prefixSegments.some((segment, i) => ancestors[i] !== segment)) return null
  if (declaredFilesAtTarget(manifest, target).length > 0 || harvestFoldersAtTarget(manifest, target).length > 0) return null

  return { childName: parsed.segments[prefixSegments.length], installName: parsed.segments[parsed.segments.length - 1] }
}

/** The always-visible folder a target lives under once the tree is collapsed to its top level - the standard root, or the one the Install Directory is nested in. */
export function topLevelTarget(manifest: WinReleaseManifest, target: ActiveTarget): ActiveTarget {
  if (target.root === 'installFolder') {
    const parsed = parseTargetDirectory(manifest.targetDirectory, manifest.architecture)
    const host = parsed && parsed.segments.length > 0 ? INSTALL_ROOTS.find((r) => r.label === `[${parsed.rootId}]`)?.root : undefined
    if (host && visibleInstallRoots(manifest).some((r) => r.root === host)) return { root: host, prefix: '' }
  }
  return { root: target.root, prefix: '' }
}
