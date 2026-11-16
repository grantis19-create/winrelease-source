import type { WinReleaseManifest } from '../types/manifest'

/**
 * Which Shortcuts target a given Declared File - purely a client-side convenience (mirrors the
 * mockup's "Referenced By" column); the backend doesn't compute or store this. Includes each
 * Shortcut's index so a "Referenced By" name can link straight to its row in ShortcutsSection
 * (`#shortcut-{index}`) rather than just being informational text.
 */
export function referencedByFor(manifest: WinReleaseManifest, fileId: string): { name: string; index: number }[] {
  return manifest.shortcuts
    .map((shortcut, index) => ({ shortcut, index }))
    .filter(({ shortcut }) => shortcut.targetFileId === fileId)
    .map(({ shortcut, index }) => ({ name: shortcut.name, index }))
}

/** Declared File ids that are not one of the enum's declared entries - flags what ManifestModel.cs's Validate() would reject as a dangling Shortcut reference. */
export function declaredFileIds(manifest: WinReleaseManifest): Set<string> {
  return new Set(manifest.files.declared.map((file) => file.id))
}

/**
 * A project counts as a still-untouched placeholder (safe to delete on a successful import from
 * inside its own editor, rather than abandoning it) only if it has *nothing* a user could have
 * meant to keep: still the literal default name, and no files/shortcuts/registry entries at all.
 * Deliberately conservative - anything more permissive risks silently deleting real work.
 */
export function isPristinePlaceholderProject(manifest: WinReleaseManifest): boolean {
  return (
    manifest.name === 'New Project' &&
    manifest.files.declared.length === 0 &&
    manifest.files.harvest.length === 0 &&
    manifest.shortcuts.length === 0 &&
    manifest.registry.length === 0
  )
}
