import { isWellFormedProductVersion } from './productVersion'
import type { DeclaredFile } from '../types/manifest'

/** Cosmetic per-extension "kind" label for the file grid's Type column - like Explorer's "Type of file" column. */
const EXTENSION_TYPE_LABELS: Record<string, string> = {
  exe: 'Application (.exe)',
  dll: 'Dynamic Library (.dll)',
  ocx: 'ActiveX Control (.ocx)',
  sys: 'System Driver (.sys)',
  msi: 'Windows Installer Package (.msi)',
  ps1: 'PowerShell Script (.ps1)',
  bat: 'Batch File (.bat)',
  cmd: 'Command Script (.cmd)',
  txt: 'Text Document (.txt)',
  md: 'Markdown Document (.md)',
  json: 'JSON Document (.json)',
  xml: 'XML Document (.xml)',
  ini: 'Configuration Settings (.ini)',
  cfg: 'Configuration Settings (.cfg)',
  conf: 'Configuration Settings (.conf)',
  log: 'Log File (.log)',
  reg: 'Registry File (.reg)',
  ico: 'Icon (.ico)',
  dat: 'Data File (.dat)',
  pdf: 'PDF Document (.pdf)',
}

/**
 * A human-friendly display name derived from an executable's own filename - e.g.
 * "my-app_Setup.exe" -> "My App Setup", "notepad.exe" -> "Notepad". Strips the extension, splits on
 * `-`/`_`/whitespace, and title-cases each word unless it's already got internal capitals (so
 * "MyApp" or "NASA" aren't mangled into "Myapp"/"Nasa"). Used to pre-fill a new Shortcut's Name from
 * its target file instead of leaving it blank or showing the raw file Id.
 */
export function friendlyNameFromFileName(fileName: string): string {
  const withoutExtension = fileName.replace(/\.[^./\\]+$/, '')
  const words = withoutExtension.split(/[-_\s]+/).filter((w) => w.length > 0)
  return words
    .map((word) => (/[A-Z]/.test(word.slice(1)) ? word : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()))
    .join(' ')
}

const EXECUTABLE = /\.exe$/i

/**
 * Executable-detection defaults for a Shortcut newly targeted at this file: a `.exe`'s own filename
 * suggests a friendlier Name than the raw file Id, and its icon can be pulled straight from itself
 * (the same capability AppInfo.AutoExtractIcon already relies on server-side - see
 * WxsGenerator.BuildArpIcon) instead of making the user Browse… for it. Returns {} for a non-`.exe`
 * target. Callers only ever apply a returned field onto one that's still empty - this never
 * overwrites a name/icon the user already set, including on a later re-target.
 */
export function executableShortcutDefaults(file: DeclaredFile): { name?: string; iconPath?: string } {
  if (!EXECUTABLE.test(file.sourcePath)) return {}
  const fileName = file.installPath.split('/').pop() ?? file.installPath
  return { name: friendlyNameFromFileName(fileName), iconPath: file.sourcePath }
}

/** Human-readable "Type" cell for the file grid - falls back to a generic "<EXT> File" for anything not in the known-extension table, or "File" for an extensionless name. */
export function typeLabelForFileName(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (ext.length === 0 || ext === name.toLowerCase()) return 'File'
  return EXTENSION_TYPE_LABELS[ext] ?? `${ext.toUpperCase()} File (.${ext})`
}

/** Human-readable file size (binary/1024-based units, matching Explorer's convention) for the file grid's Size column. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unitIndex]}`
}

const VERSION_RESOURCE_EXTENSIONS = /\.(exe|dll|ocx|sys)$/i
/** VS_FIXEDFILEINFO.dwSignature, little-endian. */
const VS_FIXEDFILEINFO_SIGNATURE = 0xfeef04bd
/** Cap how much of a staged binary gets read - typical app EXE/DLL resources sit well inside this, and it keeps a huge unrelated binary from blocking the main thread on a full read. */
const MAX_VERSION_SCAN_BYTES = 64 * 1024 * 1024

/**
 * Best-effort PE version reader for a staged .exe/.dll File blob. Rather than walking the full PE
 * resource-directory tree (named/id entries, RVA-to-file-offset translation via the section table -
 * a real parser's worth of work), this scans for VS_FIXEDFILEINFO's signature directly:
 * VS_FIXEDFILEINFO is a fixed-layout, 4-byte-aligned structure with a signature unique enough
 * (0xFEEF04BD) that a straight byte scan finds the real one reliably in practice, without needing to
 * locate the .rsrc section first. Returns null for a non-PE-versioned file, or when the scan turns up
 * nothing within the byte cap.
 */
export async function readBinaryFileVersion(file: File): Promise<string | null> {
  if (!VERSION_RESOURCE_EXTENSIONS.test(file.name)) return null

  const scanLength = Math.min(file.size, MAX_VERSION_SCAN_BYTES)
  const buffer = await file.slice(0, scanLength).arrayBuffer()
  const view = new DataView(buffer)

  for (let offset = 0; offset + 16 <= view.byteLength; offset += 4) {
    if (view.getUint32(offset, true) !== VS_FIXEDFILEINFO_SIGNATURE) continue
    const fileVersionMs = view.getUint32(offset + 8, true)
    const fileVersionLs = view.getUint32(offset + 12, true)
    const major = (fileVersionMs >>> 16) & 0xffff
    const minor = fileVersionMs & 0xffff
    const build = (fileVersionLs >>> 16) & 0xffff
    const revision = fileVersionLs & 0xffff
    return `${major}.${minor}.${build}.${revision}`
  }

  return null
}

/**
 * Converts a real Win32 FileVersion (`readBinaryFileVersion`'s major.minor.build.revision, 4
 * segments) into a usable WiX/MSI Product Version suggestion (3 segments - the trailing revision
 * has no MSI equivalent, verified via `wix`'s WIX1148 warning, ADR 0055). Returns null rather than a
 * value that would fail `isWellFormedProductVersion` once the 4th segment is dropped (e.g. a
 * major/minor over 255) - the caller should offer no suggestion at all over a broken one.
 */
export function productVersionFromFileVersion(fileVersion: string): string | null {
  const productVersion = fileVersion.split('.').slice(0, 3).join('.')
  return isWellFormedProductVersion(productVersion) ? productVersion : null
}
