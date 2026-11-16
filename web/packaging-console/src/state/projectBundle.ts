import { unzip, zip } from 'fflate'
import { withManifestDefaults } from '../types/manifest'
import type { WinReleaseManifest } from '../types/manifest'

/**
 * "Export project" / "Open" for people who want their work OFFLINE: one .zip holding the project's settings
 * (winrelease.json) plus every file they added (under sources/), so it can be kept, emailed or versioned and reopened
 * on any machine or browser - projects otherwise live only in this browser's storage. Built and read entirely in the
 * browser; it is WinRelease's own format, not an import of anyone else's.
 */
export const BUNDLE_MANIFEST_NAME = 'winrelease.json'
export const BUNDLE_SOURCES_PREFIX = 'sources/'
export const BUNDLE_EXTENSION = '.winrelease.zip'

/**
 * Header written into every saved project and required on open: proof the zip was made by WinRelease's "Export project".
 * It is a sanity check (a hand-built zip can copy it), not a security control - the manifest is still validated by the backend.
 */
export const BUNDLE_MARKER_NAME = 'winrelease-project.json'
export const BUNDLE_FORMAT = 'winrelease-project'
export const BUNDLE_FORMAT_VERSION = 1

export async function createProjectBundle(manifest: WinReleaseManifest, sourceFiles: Map<string, File>): Promise<Blob> {
  const marker = { format: BUNDLE_FORMAT, formatVersion: BUNDLE_FORMAT_VERSION, createdBy: 'WinRelease', createdAt: new Date().toISOString() }
  const entries: Record<string, Uint8Array> = {
    [BUNDLE_MARKER_NAME]: new TextEncoder().encode(JSON.stringify(marker, null, 2)),
    [BUNDLE_MANIFEST_NAME]: new TextEncoder().encode(JSON.stringify(manifest, null, 2)),
  }
  for (const [path, file] of sourceFiles) {
    entries[BUNDLE_SOURCES_PREFIX + path.replaceAll('\\', '/').replace(/^\.?\//, '')] = new Uint8Array(await file.arrayBuffer())
  }

  const zipped = await new Promise<Uint8Array>((resolve, reject) => zip(entries, (err, data) => (err ? reject(err) : resolve(data))))
  return new Blob([zipped as BlobPart], { type: 'application/zip' })
}

export interface OpenedBundle {
  manifest: WinReleaseManifest
  files: { path: string; file: File }[]
}

/** Reads a bundle made by `createProjectBundle`; throws an Error with a plain-language message when it isn't one. */
export async function readProjectBundle(archive: File): Promise<OpenedBundle> {
  const data = new Uint8Array(await archive.arrayBuffer())
  const entries = await new Promise<Record<string, Uint8Array>>((resolve, reject) =>
    unzip(data, (err, result) => (err ? reject(new Error(`"${archive.name}" isn't a valid zip file.`)) : resolve(result))),
  )

  assertMarker(entries[BUNDLE_MARKER_NAME], archive.name)

  const manifestBytes = entries[BUNDLE_MANIFEST_NAME]
  if (!manifestBytes) {
    throw new Error(`"${archive.name}" isn't a WinRelease project - it has no ${BUNDLE_MANIFEST_NAME}. Use "Export project" in the editor to make one.`)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder().decode(manifestBytes))
  } catch {
    throw new Error(`The ${BUNDLE_MANIFEST_NAME} inside "${archive.name}" isn't valid JSON.`)
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`The ${BUNDLE_MANIFEST_NAME} inside "${archive.name}" isn't a WinRelease manifest.`)
  }

  const files = Object.entries(entries)
    .filter(([name]) => name.startsWith(BUNDLE_SOURCES_PREFIX) && !name.endsWith('/'))
    .map(([name, bytes]) => {
      const path = name.slice(BUNDLE_SOURCES_PREFIX.length)
      return { path, file: new File([bytes as BlobPart], path.split('/').pop() ?? path) }
    })

  return { manifest: withManifestDefaults(parsed as Partial<WinReleaseManifest>), files }
}

function assertMarker(bytes: Uint8Array | undefined, fileName: string): void {
  const notOurs = `"${fileName}" wasn't made by WinRelease, so it can't be opened. Only projects exported with "Export project" are supported.`
  if (!bytes) throw new Error(notOurs)

  let marker: { format?: unknown; formatVersion?: unknown }
  try {
    marker = JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    throw new Error(notOurs)
  }

  if (marker.format !== BUNDLE_FORMAT) throw new Error(notOurs)
  if (typeof marker.formatVersion !== 'number' || marker.formatVersion > BUNDLE_FORMAT_VERSION) {
    throw new Error(`"${fileName}" was saved by a newer version of WinRelease. Update WinRelease to open it.`)
  }
}

/**
 * Files inside a sources .zip the user attached for building (the Build panel's "manual zip" path), so Export project keeps them too:
 * without this a project built from an attached zip would save settings only and lose its files.
 */
export async function filesFromSourcesZip(archive: File): Promise<Map<string, File>> {
  const data = new Uint8Array(await archive.arrayBuffer())
  const entries = await new Promise<Record<string, Uint8Array>>((resolve, reject) =>
    unzip(data, (err, result) => (err ? reject(new Error(`"${archive.name}" isn't a valid zip file.`)) : resolve(result))),
  )

  const files = new Map<string, File>()
  for (const [name, bytes] of Object.entries(entries)) {
    if (name.endsWith('/')) continue
    files.set(name, new File([bytes as BlobPart], name.split('/').pop() ?? name))
  }
  return files
}

/** "My App 2.0" -> "My-App-2.0.winrelease.zip": a file name Windows accepts. */
export function bundleFileName(productName: string): string {
  const stem = productName.trim().replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '-').replace(/[. ]+$/, '')
  return (stem.length > 0 ? stem : 'project') + BUNDLE_EXTENSION
}

/** Key of the origin header in an exported winrelease.json. Optional on open (hand-written manifests are legitimate), checked when present. */
export const MANIFEST_HEADER_KEY = '$winrelease'

/** The manifest as exported: an origin header first, then the manifest itself. */
export function manifestWithHeader(manifest: WinReleaseManifest): Record<string, unknown> {
  return { [MANIFEST_HEADER_KEY]: { format: 'winrelease-manifest', formatVersion: BUNDLE_FORMAT_VERSION, createdBy: 'WinRelease' }, ...manifest }
}

/**
 * Removes and checks the origin header from a parsed winrelease.json. A missing header is fine; a header from another
 * format or a newer version is refused in plain words. The header is never stored in the project.
 */
export function stripManifestHeader(parsed: Record<string, unknown>, fileName: string): Record<string, unknown> {
  const { [MANIFEST_HEADER_KEY]: header, ...rest } = parsed
  if (header === undefined) return rest

  const h = header as { format?: unknown; formatVersion?: unknown } | null
  if (h === null || typeof h !== 'object' || h.format !== 'winrelease-manifest') {
    throw new Error(`"${fileName}" has a ${MANIFEST_HEADER_KEY} header that isn't WinRelease's, so it can't be opened.`)
  }
  if (typeof h.formatVersion !== 'number' || h.formatVersion > BUNDLE_FORMAT_VERSION) {
    throw new Error(`"${fileName}" was exported by a newer version of WinRelease. Update WinRelease to open it.`)
  }
  return rest
}
