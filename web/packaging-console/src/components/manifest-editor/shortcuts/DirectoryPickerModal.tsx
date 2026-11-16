import { useState } from 'react'
import { Modal } from '../../ui/Modal'
import { Button } from '../../ui/Button'
import { Field, TextInput } from '../../ui/Field'
import { allSubfolderPathsUnderRoot, describeShortcutLocation, parseDirectoryReference, visibleInstallRoots } from '../../../state/installTargets'
import type { InstallRoot, WinReleaseManifest } from '../../../types/manifest'

/**
 * The real Windows shell shortcut folders - only offered when picking a Shortcut's Location, never
 * its Working Directory (nothing runs "from" Desktop/Start Menu as a working directory - see
 * DirectoryPickerModal's own includeShellFolders doc). Desktop/Start Menu/Startup plus the five that
 * actually show up as real shortcut targets in Advanced Installer's own location list - not WiX's
 * full ~25-entry StandardDirectory set. All eight verified against the real `wix` CLI.
 */
const SHELL_FOLDER_OPTIONS: { value: string; label: string }[] = [
  { value: 'desktopFolder', label: 'Desktop' },
  { value: 'programMenuFolder', label: 'Start Menu' },
  { value: 'startupFolder', label: 'Startup (run on boot)' },
  { value: 'personalFolder', label: 'Documents' },
  { value: 'favoritesFolder', label: 'Favorites' },
  { value: 'fontsFolder', label: 'Fonts' },
  { value: 'sendToFolder', label: 'Send To' },
  { value: 'templateFolder', label: 'Templates' },
]

const DATALIST_ID = 'winrelease-directory-picker-subfolders'

/**
 * Root + free-text Subfolder, the same shape GeneralSection's BrowseTargetDirectoryModal already
 * uses for Target Directory - not a click-only tree. A tree can only ever offer folders that
 * already have something in them; typing a path works for a brand-new one too (ADR 0073's "touch
 * the directory chain" fix means WxsGenerator emits it either way), which a pure navigator can't
 * offer. Existing subfolders still show up, as native `<datalist>` autocomplete on the Subfolder
 * field - a suggestion, never a restriction.
 */
export function DirectoryPickerModal({
  manifest,
  title,
  includeShellFolders,
  initialValue,
  onClose,
  onChoose,
}: {
  manifest: WinReleaseManifest
  title: string
  /** Shows Desktop/Start Menu/Startup as root choices too - only meaningful for a Shortcut's Location. */
  includeShellFolders: boolean
  /** The field's current value, if any - the picker opens already pointed at wherever it's set now, instead of always defaulting to Install Directory. */
  initialValue?: string | null
  onClose: () => void
  /** Always a concrete Directory reference - the bare Install Directory root resolves to the literal "INSTALLFOLDER" Id, a bare shell folder to its own literal Id, never null/empty. */
  onChoose: (value: string) => void
}) {
  const installRootOptions = visibleInstallRoots(manifest).map((r) => ({ value: r.root as string, label: r.friendlyName }))
  const rootOptions = includeShellFolders ? [...SHELL_FOLDER_OPTIONS, ...installRootOptions] : installRootOptions

  const initial = parseDirectoryReference(initialValue)
  const initialRootValid = rootOptions.some((r) => r.value === initial.root)
  const [root, setRoot] = useState(initialRootValid ? initial.root : 'installFolder')
  const [subpath, setSubpath] = useState(initialRootValid ? initial.subpath.replace(/\//g, '\\') : '')

  const value = subpath.trim().length === 0 ? bareRootLiteral(root) : `wr:dir:${root}:${subpath.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')}`
  const subfolderSuggestions = isInstallRoot(root) ? allSubfolderPathsUnderRoot(manifest, root) : []

  return (
    <Modal title={title} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <Field label="Root">
          <select
            value={root}
            onChange={(e) => setRoot(e.target.value)}
            className="rounded-md border border-subtle bg-panel-alt px-2.5 py-1.5 text-sm text-ink outline-none focus:border-brand"
          >
            {includeShellFolders && (
              <optgroup label="Shortcut Folders">
                {SHELL_FOLDER_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label="Install Folders">
              {installRootOptions.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </optgroup>
          </select>
        </Field>
        <Field label="Subfolder (optional)" hint="Type any folder name - it doesn't need to exist yet.">
          <TextInput value={subpath} onChange={(e) => setSubpath(e.target.value)} placeholder="Acme Inc\MyApp" list={DATALIST_ID} />
          <datalist id={DATALIST_ID}>
            {subfolderSuggestions.map((path) => (
              <option key={path} value={path.replace(/\//g, '\\')} />
            ))}
          </datalist>
        </Field>
        <div className="truncate rounded-md border border-subtle bg-panel-alt px-3 py-2 text-xs text-muted">
          <span className="text-ink">{describeShortcutLocation(manifest, value)}</span>
        </div>
        <div className="mt-1 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              onChoose(value)
              onClose()
            }}
          >
            Use This Folder
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function isInstallRoot(root: string): root is InstallRoot {
  return !SHELL_FOLDER_OPTIONS.some((r) => r.value === root)
}

/**
 * The value for a bare (no subfolder) root. INSTALLFOLDER and every shell folder are always emitted
 * regardless (INSTALLFOLDER unconditionally; a shell folder via Generate()'s own preset-literal
 * check), so their real literal Id is simplest/safest. Every *other* InstallRoot (AppDataFolder,
 * ProgramFiles64Folder, ...) is "optional" - WxsGenerator only emits its StandardDirectory when
 * something actually references it, and only a wr:dir: sentinel (not a bare literal) is recognized
 * by the "touch the directory chain" pass that makes that happen (ADR 0073) - a bare literal here
 * would silently dangle exactly the reference that fix exists to prevent.
 */
function bareRootLiteral(root: string): string {
  switch (root) {
    case 'desktopFolder':
      return 'DesktopFolder'
    case 'programMenuFolder':
      return 'ProgramMenuFolder'
    case 'startupFolder':
      return 'StartupFolder'
    case 'personalFolder':
      return 'PersonalFolder'
    case 'favoritesFolder':
      return 'FavoritesFolder'
    case 'fontsFolder':
      return 'FontsFolder'
    case 'sendToFolder':
      return 'SendToFolder'
    case 'templateFolder':
      return 'TemplateFolder'
    case 'installFolder':
      return 'INSTALLFOLDER'
    default:
      return `wr:dir:${root}:`
  }
}
