import type { PackageArchitecture, RegistryRoot, WinReleaseManifest } from '../types/manifest'

/** The hives in the order regedit lists them under Computer (HKEY_CURRENT_CONFIG is shown separately, greyed: Windows Installer cannot write there). */
export const REGISTRY_ROOTS: { root: RegistryRoot; label: string }[] = [
  { root: 'hkcr', label: 'HKEY_CLASSES_ROOT' },
  { root: 'hkcu', label: 'HKEY_CURRENT_USER' },
  { root: 'hklm', label: 'HKEY_LOCAL_MACHINE' },
  { root: 'hku', label: 'HKEY_USERS' },
]

export interface ActiveRegistryTarget {
  root: RegistryRoot
  /** "" selects the hive itself - see entriesAtTarget for what that shows. */
  keyPrefix: string
}

/** Registry key names ignore case (SOFTWARE and Software are one key), so every key comparison here does too. */
export function sameRegistryKey(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/** True when `key` is `prefix` itself or sits anywhere under it, ignoring case. */
export function isAtOrUnderRegistryKey(key: string, prefix: string): boolean {
  return sameRegistryKey(key, prefix) || key.toLowerCase().startsWith(`${prefix.toLowerCase()}\\`);
}

/**
 * Immediate child key segments declared under a hive+prefix, derived from RegistryEntry.Key - no separate tree state to keep in sync. Names
 * that differ only in case are one key (a .reg file's SOFTWARE and a typed Software), shown with the first spelling met.
 */
export function subkeysUnderTarget(manifest: WinReleaseManifest, target: ActiveRegistryTarget): string[] {
  const names = new Map<string, string>();
  const prefixSegments = target.keyPrefix.length > 0 ? target.keyPrefix.split('\\') : [];

  for (const entry of manifest.registry) {
    if (entry.root !== target.root) continue;
    const segments = entry.key.split('\\');
    if (segments.length <= prefixSegments.length) continue;
    if (prefixSegments.some((segment, i) => !sameRegistryKey(segments[i], segment))) continue;

    const name = segments[prefixSegments.length];
    if (!names.has(name.toLowerCase())) names.set(name.toLowerCase(), name);
  }

  return [...names.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

/**
 * Selecting a specific key shows only that key's own values (like regedit).
 * Selecting the hive root itself (keyPrefix === "") shows every entry in
 * that hive regardless of key, so nothing is hidden before drilling down -
 * true hive-root values are rare in practice.
 */
export function entriesAtTarget(manifest: WinReleaseManifest, target: ActiveRegistryTarget) {
  return manifest.registry
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.root === target.root && (target.keyPrefix === '' || sameRegistryKey(entry.key, target.keyPrefix)));
}

const REDIRECTED_CLASSES_CHILDREN = ['clsid', 'interface', 'directshow', 'media type', 'mediafoundation'];

function segmentIs(segment: string | undefined, name: string): boolean {
  return segment !== undefined && segment.toLowerCase() === name;
}

/** The index of the one WOW6432Node segment Windows redirects through, or -1. Mirrors WinRelease.Core's Wow6432Redirect (ADR 0108) - keep them identical. */
function wowRedirectPoint(root: RegistryRoot, s: string[]): number {
  const classesRedirect = () =>
    s.length >= 4 && segmentIs(s[0], 'software') && segmentIs(s[1], 'classes') && segmentIs(s[2], 'wow6432node') && REDIRECTED_CLASSES_CHILDREN.includes(s[3].toLowerCase())
      ? 2
      : -1;
  if (root === 'hklm') {
    if (s.length >= 3 && segmentIs(s[0], 'software') && segmentIs(s[1], 'wow6432node')) return 1;
    return classesRedirect();
  }
  if (root === 'hkcu') return classesRedirect();
  if (root === 'hkcr') return s.length >= 2 && segmentIs(s[0], 'wow6432node') && REDIRECTED_CLASSES_CHILDREN.includes(s[1].toLowerCase()) ? 0 : -1;
  return -1;
}

/**
 * How a key relates to WOW6432Node, the folder regedit (and every .reg export) shows the 32-bit view of the registry under on 64-bit Windows.
 * 'redirected': Windows redirects here, so the build drops that one segment and writes a 32-bit component (a 64-bit package), landing in the same
 * place. 'literal': the name is there but Windows does not redirect at that spot (HKCU\SOFTWARE is shared, for one), so it is written exactly as
 * typed. null: no WOW6432Node in the key. Rules and sources: ADR 0108; WinRelease.Core's Wow6432Redirect.
 */
export function wowRegistryKind(root: RegistryRoot, key: string): 'redirected' | 'literal' | null {
  const segments = key.split('\\');
  if (!segments.some((segment) => segmentIs(segment, 'wow6432node'))) return null;
  return wowRedirectPoint(root, segments) >= 0 ? 'redirected' : 'literal';
}

export function joinRegistryKey(prefix: string, name: string): string {
  return prefix.length > 0 ? `${prefix}\\${name}` : name;
}

/** The reason a key name would be rejected, or null if it's valid - mirrors installTargets.ts's folderNameError, '\\' being the registry's own key separator instead of '/'. */
export function keyNameError(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) return "a key name can't be empty.";
  if (trimmed.includes('\\')) return `'${trimmed}' can't contain '\\' - that's the registry's own key separator.`;
  return null;
}

/**
 * Keys aren't first-class entities - they're purely derived from RegistryEntry.Key segments (see
 * subkeysUnderTarget). Renaming one is therefore a batch rewrite: every entry's Key at-or-under
 * root+oldPrefix moves to the same relative position under newPrefix. Mirrors installTargets.ts's
 * renameFolder.
 */
export function renameRegistryKey(manifest: WinReleaseManifest, root: RegistryRoot, oldPrefix: string, newPrefix: string): WinReleaseManifest {
  if (oldPrefix === newPrefix) return manifest;

  const rewrite = (key: string): string => (isAtOrUnderRegistryKey(key, oldPrefix) ? newPrefix + key.slice(oldPrefix.length) : key);

  return { ...manifest, registry: manifest.registry.map((entry) => (entry.root === root ? { ...entry, key: rewrite(entry.key) } : entry)) };
}

/** Bulk-removes every entry at-or-under root+prefix. Mirrors installTargets.ts's deleteFolder. */
export function deleteRegistryKey(manifest: WinReleaseManifest, root: RegistryRoot, prefix: string): WinReleaseManifest {
  return { ...manifest, registry: manifest.registry.filter((entry) => !(entry.root === root && isAtOrUnderRegistryKey(entry.key, prefix))) };
}

/**
 * Total entries at-or-under a target, recursive - the Delete confirmation's "and N value(s) inside
 * it" count, and HiveTree's own [N] badge next to every node. A bare keyPrefix ("" - the hive root
 * itself) counts everything in that hive, same "nothing hidden before drilling down" rule
 * entriesAtTarget already documents - without this case, the hive-root node's own count read as 0
 * regardless of what was actually inside it (caught live: HiveTree showing "HKEY_LOCAL_MACHINE [0]"
 * right above a child key correctly showing "Software [1]").
 */
export function entryCountUnderTarget(manifest: WinReleaseManifest, target: ActiveRegistryTarget): number {
  const isUnder = (key: string) => target.keyPrefix === '' || isAtOrUnderRegistryKey(key, target.keyPrefix);
  return manifest.registry.filter((entry) => entry.root === target.root && isUnder(entry.key)).length;
}

/** The full regedit-style path ("HKEY_CURRENT_USER\Software\Vendor\App") for a target - HiveTree's "Copy Key Name" context-menu action. */
export function fullRegistryKeyPath(target: ActiveRegistryTarget): string {
  const hiveLabel = REGISTRY_ROOTS.find((r) => r.root === target.root)?.label ?? target.root;
  return target.keyPrefix.length > 0 ? `${hiveLabel}\\${target.keyPrefix}` : hiveLabel;
}

/**
 * Placeholders a 64-bit package shows so the 32-bit part of the registry is visible and reachable (ADR 0118): HKEY_LOCAL_MACHINE\SOFTWARE and, under it,
 * WOW6432Node, greyed until something is in them. They exist only in the tree: nothing is written to the manifest, and nothing is built, until a value is
 * added. HKEY_CURRENT_USER gets none, because Windows shares HKCU\SOFTWARE between the 32-bit and 64-bit views (a WOW6432Node key there would be a plain key
 * no 32-bit program reads). A 32-bit package gets none either: everything in it is 32-bit already.
 */
export function stagedSubkeys(root: RegistryRoot, keyPrefix: string, architecture: PackageArchitecture): string[] {
  if (architecture === 'x86' || root !== 'hklm') return [];
  if (keyPrefix === '') return ['SOFTWARE'];
  return sameRegistryKey(keyPrefix, 'SOFTWARE') ? ['WOW6432Node'] : [];
}

/** How many WOW6432Node segments a key path holds. More than one is almost always a mistake: Windows adds one more when it redirects. */
export function wowNodeCount(key: string): number {
  return key.split('\\').filter((segment) => segmentIs(segment, 'wow6432node')).length;
}

/** True for HKLM\SOFTWARE\WOW6432Node and everything under it in a 64-bit package: the 32-bit view, shown with a "32-bit" tag. */
export function isInThirtyTwoBitView(root: RegistryRoot, key: string, architecture: PackageArchitecture): boolean {
  if (architecture === 'x86' || root !== 'hklm') return false;
  const segments = key.split('\\');
  return segments.length >= 2 && segmentIs(segments[0], 'software') && segmentIs(segments[1], 'wow6432node');
}

/** The path as regedit's address bar shows it: Computer\HKEY_LOCAL_MACHINE\SOFTWARE\Vendor. */
export function computerPath(target: ActiveRegistryTarget): string {
  return `Computer\\${fullRegistryKeyPath(target)}`
}
