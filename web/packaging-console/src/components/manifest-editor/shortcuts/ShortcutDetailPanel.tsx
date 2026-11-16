import { AppWindow, FolderOpen, FolderTree, Trash2, UploadCloud } from 'lucide-react'
import { useRef, useState } from 'react'
import { Field, NO_AUTOFILL, TextInput } from '../../ui/Field'
import { Toggle } from '../../ui/Toggle'
import { describeShortcutLocation, programMenuGroupLocation, programMenuGroupSubpath, workingDirectorySentinelForInstallPath } from '../../../state/installTargets'
import { executableShortcutDefaults } from '../../../state/fileMetadata'
import { CandidateThumbnail, IconPickerModal } from '../IconPicker'
import { DirectoryPickerModal } from './DirectoryPickerModal'
import { SHORTCUT_LOCATIONS } from '../../../types/manifest'
import type { Shortcut, ShortcutWindowStyle, WinReleaseManifest } from '../../../types/manifest'

/** Picks a sourcePath key for a freshly-uploaded icon that won't collide with an existing declared file or already-staged blob - both share the same build sources zip namespace. */
function uniqueIconSourcePath(manifest: WinReleaseManifest, sourceFiles: Map<string, File>, fileName: string): string {
  const taken = new Set([...manifest.files.declared.map((f) => f.sourcePath), ...sourceFiles.keys()])
  if (!taken.has(fileName)) return fileName
  const dot = fileName.lastIndexOf('.')
  const base = dot === -1 ? fileName : fileName.slice(0, dot)
  const ext = dot === -1 ? '' : fileName.slice(dot)
  let suffix = 2
  while (taken.has(`${base}_${suffix}${ext}`)) suffix += 1
  return `${base}_${suffix}${ext}`
}

const LOCATION_PRESETS: { value: string; label: string }[] = [
  { value: SHORTCUT_LOCATIONS.desktopFolder, label: 'Desktop' },
  { value: SHORTCUT_LOCATIONS.programMenuFolder, label: 'Start Menu' },
  { value: SHORTCUT_LOCATIONS.startupFolder, label: 'Startup (run on boot)' },
  { value: SHORTCUT_LOCATIONS.personalFolder, label: 'Documents' },
  { value: SHORTCUT_LOCATIONS.favoritesFolder, label: 'Favorites' },
  { value: SHORTCUT_LOCATIONS.fontsFolder, label: 'Fonts' },
  { value: SHORTCUT_LOCATIONS.sendToFolder, label: 'Send To' },
  { value: SHORTCUT_LOCATIONS.templateFolder, label: 'Templates' },
]

const WINDOW_STYLES: { value: ShortcutWindowStyle; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'minimized', label: 'Minimized' },
  { value: 'maximized', label: 'Maximized' },
]

/**
 * The properties half of Shortcuts' master-detail layout (ShortcutList is the other half) - every
 * field from the old inline-per-shortcut form, now shown for just the one selected shortcut at a
 * time instead of all of them expanded at once.
 */
export function ShortcutDetailPanel({
  manifest,
  shortcut,
  index,
  onUpdate,
  onRemove,
  iconCandidates,
  sourceFiles,
  onStageFiles,
}: {
  manifest: WinReleaseManifest
  shortcut: Shortcut
  index: number
  onUpdate: (index: number, patch: Partial<Shortcut>) => void
  onRemove: (index: number) => void
  iconCandidates: string[]
  /** Staged file blobs (session-local, keyed by sourcePath) - lets the icon picker and preview show a real .ico image instead of just a filename. */
  sourceFiles: Map<string, File>
  /** Stages a freshly-uploaded icon file into the build sources - same mechanism Files & Folders' Add Files uses. */
  onStageFiles: (entries: { path: string; file: File }[]) => void
}) {
  const declaredIds = manifest.files.declared.map((f) => f.id)
  const [pickingIcon, setPickingIcon] = useState(false)
  const [pickingWorkingDirectory, setPickingWorkingDirectory] = useState(false)
  const [pickingLocation, setPickingLocation] = useState(false)
  const iconUploadRef = useRef<HTMLInputElement>(null)
  // A Start Menu program-group sentinel (with or without a subpath) counts as the "Start Menu"
  // preset in the dropdown below - its subpath shows in the separate Program Group field instead,
  // rather than also showing up as a redundant 4th "custom" option.
  const programMenuGroup = programMenuGroupSubpath(shortcut.location)
  const isStartMenuLocation = programMenuGroup !== undefined
  const selectedLocationPreset = isStartMenuLocation
    ? SHORTCUT_LOCATIONS.programMenuFolder
    : LOCATION_PRESETS.some((preset) => preset.value === shortcut.location)
      ? shortcut.location
      : '__custom__'

  const usesCustomTarget = !shortcut.targetFileId
  const danglingReference = !usesCustomTarget && shortcut.targetFileId !== '' && !declaredIds.includes(shortcut.targetFileId!)
  const missingCustomTarget = usesCustomTarget && !shortcut.targetPath

  function update(patch: Partial<Shortcut>) {
    onUpdate(index, patch)
  }

  /**
   * Auto-derives WorkingDirectory from the newly-picked target file's own folder, plus Name/Icon
   * Path when it's a `.exe` and those fields are still blank (executable detection) - every default
   * here is a convenience, always left fully editable afterward and never re-applied over a value
   * the user already set.
   */
  function selectTargetFile(fileId: string) {
    const file = manifest.files.declared.find((f) => f.id === fileId)
    const defaults = file ? executableShortcutDefaults(file) : {}
    update({
      targetFileId: fileId,
      workingDirectory: file ? workingDirectorySentinelForInstallPath(file.root, file.installPath) : undefined,
      ...(!shortcut.name.trim() && defaults.name ? { name: defaults.name } : {}),
      ...(!shortcut.iconPath && defaults.iconPath ? { iconPath: defaults.iconPath } : {}),
    })
  }

  function setCustomTarget() {
    update({ targetFileId: null, targetPath: shortcut.targetPath ?? '' })
  }

  function setFileTarget() {
    update({ targetPath: null, targetFileId: declaredIds[0] ?? '' })
  }

  /** Uploads a brand-new .ico/.exe straight from disk, instead of only picking from icons already declared elsewhere in the project - stages it into the build sources (no need to also declare it as an install target; IconPath is resolved purely against the sources zip). */
  function uploadIcon(file: File) {
    const path = uniqueIconSourcePath(manifest, sourceFiles, file.name)
    onStageFiles([{ path, file }])
    update({ iconPath: path })
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4 rounded-md border border-subtle bg-panel-alt p-4">
      <div className="flex items-start gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-subtle bg-panel">
          {shortcut.iconPath ? (
            <CandidateThumbnail sourcePath={shortcut.iconPath} file={sourceFiles.get(shortcut.iconPath)} />
          ) : (
            <AppWindow size={28} className="text-muted/50" />
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <Field label="Name">
            <TextInput value={shortcut.name} onChange={(e) => update({ name: e.target.value })} />
          </Field>
          <Field label="Target">
            <div className="flex items-center gap-1.5">
              <div className="flex rounded-md border border-subtle text-xs">
                <button
                  type="button"
                  onClick={setFileTarget}
                  title="Point at a file declared in Files & Folders"
                  className={`rounded-l-md px-2 py-1.5 ${!usesCustomTarget ? 'bg-brand/10 text-brand' : 'text-muted hover:text-ink'}`}
                >
                  Declared File
                </button>
                <button
                  type="button"
                  onClick={setCustomTarget}
                  title="A URL, or any raw WiX Target - including a file inside an imported/harvested folder, which can't be picked from a list since its contents aren't known until build time"
                  className={`rounded-r-md px-2 py-1.5 ${usesCustomTarget ? 'bg-brand/10 text-brand' : 'text-muted hover:text-ink'}`}
                >
                  Custom
                </button>
              </div>
              {usesCustomTarget ? (
                <input
                  value={shortcut.targetPath ?? ''}
                  onChange={(e) => update({ targetPath: e.target.value })}
                  placeholder="https://example.com or [INSTALLFOLDER]bin\tool.exe"
                  autoComplete={NO_AUTOFILL}
                  className={`min-w-0 flex-1 rounded-md border bg-panel px-2.5 py-1.5 text-sm outline-none focus:border-brand disabled:opacity-60 ${
                    missingCustomTarget ? 'border-danger text-danger' : 'border-subtle text-ink'
                  }`}
                />
              ) : (
                <select
                  value={shortcut.targetFileId ?? ''}
                  onChange={(e) => selectTargetFile(e.target.value)}
                  className={`min-w-0 flex-1 rounded-md border bg-panel px-2.5 py-1.5 text-sm outline-none focus:border-brand ${
                    danglingReference ? 'border-danger text-danger' : 'border-subtle text-ink'
                  }`}
                >
                  <option value="">— select a declared file —</option>
                  {declaredIds.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </Field>
          <Field
            label="Advertised"
            hint={
              usesCustomTarget
                ? "Lets this shortcut trigger MSI self-repair/install-on-demand instead of launching the target directly. Only works for a Declared File target - WiX requires an explicit Target path for a Custom target (a URL or raw path), which Advertise can't combine with."
                : "Lets this shortcut trigger MSI self-repair/install-on-demand instead of launching the target directly - recommended by most packaging tools' own defaults."
            }
          >
            <Toggle
              checked={!!shortcut.advertise && !usesCustomTarget}
              disabled={usesCustomTarget}
              label={shortcut.advertise ? 'Advertised' : 'Not advertised'}
              onChange={(checked) => update({ advertise: checked })}
            />
          </Field>
        </div>
      </div>

      <Field label="Location" hint="Not just Desktop/Start Menu/Startup - Browse lets a shortcut land anywhere in the project's own install folders, the same way other packaging tools let you pick any directory.">
        <div className="flex items-center gap-1.5">
          <select
            value={selectedLocationPreset}
            onChange={(e) => update({ location: e.target.value })}
            className="min-w-0 flex-1 rounded-md border border-subtle bg-panel px-2.5 py-1.5 text-sm text-ink outline-none focus:border-brand"
          >
            {LOCATION_PRESETS.map((loc) => (
              <option key={loc.value} value={loc.value}>
                {loc.label}
              </option>
            ))}
            {selectedLocationPreset === '__custom__' && <option value="__custom__">{describeShortcutLocation(manifest, shortcut.location)}</option>}
          </select>
          <button
            type="button"
            onClick={() => setPickingLocation(true)}
            title="Browse the project's own install folders"
            className="shrink-0 rounded-md border border-subtle p-1.5 text-muted hover:border-brand hover:text-brand"
          >
            <FolderTree size={14} />
          </button>
        </div>
      </Field>

      {isStartMenuLocation && (
        <Field label="Program Group" hint='Optional - nests the shortcut in a named Start Menu folder (e.g. your company or product name) instead of directly in Start Menu. Use "Company\Product" to nest two levels deep.'>
          <TextInput
            value={programMenuGroup.replace(/\//g, '\\')}
            onChange={(e) => update({ location: programMenuGroupLocation(e.target.value) })}
            placeholder="Acme Inc"
          />
        </Field>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Working Directory">
          <div className="flex items-center gap-1.5">
            <TextInput
              value={shortcut.workingDirectory ?? ''}
              onChange={(e) => update({ workingDirectory: e.target.value || null })}
              placeholder="[APPLICATIONFOLDER]"
              title="Auto-filled from the picked target file's own folder - just a convenience default, freely editable, never re-applied once you've touched it yourself."
            />
            <button
              type="button"
              onClick={() => setPickingWorkingDirectory(true)}
              title="Browse the project's own install folders"
              className="shrink-0 rounded-md border border-subtle p-1.5 text-muted hover:border-brand hover:text-brand"
            >
              <FolderTree size={14} />
            </button>
          </div>
        </Field>
        <Field label="Arguments">
          <TextInput value={shortcut.arguments ?? ''} onChange={(e) => update({ arguments: e.target.value || null })} placeholder="/silent" />
        </Field>
        <Field label="Description">
          <TextInput value={shortcut.description ?? ''} onChange={(e) => update({ description: e.target.value || null })} />
        </Field>
        <Field label="Run" hint="The launched window's initial state - Normal unless the target itself expects to start minimized/maximized.">
          <select
            value={shortcut.windowStyle ?? 'normal'}
            onChange={(e) => update({ windowStyle: e.target.value as ShortcutWindowStyle })}
            className="rounded-md border border-subtle bg-panel px-2.5 py-1.5 text-sm text-ink outline-none focus:border-brand"
          >
            {WINDOW_STYLES.map((style) => (
              <option key={style.value} value={style.value}>
                {style.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Icon Path">
        <div className="flex items-center gap-1.5">
          <TextInput value={shortcut.iconPath ?? ''} onChange={(e) => update({ iconPath: e.target.value || null })} placeholder="app.ico" />
          <input
            ref={iconUploadRef}
            type="file"
            accept=".ico,.exe"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) uploadIcon(file)
              e.target.value = ''
            }}
          />
          <button
            type="button"
            onClick={() => iconUploadRef.current?.click()}
            title="Upload a new .ico/.exe from your computer"
            className="shrink-0 rounded-md border border-subtle p-1.5 text-muted hover:border-brand hover:text-brand"
          >
            <UploadCloud size={14} />
          </button>
          <button
            type="button"
            onClick={() => setPickingIcon(true)}
            title="Browse .ico/.exe files already added in Files & Folders"
            className="shrink-0 rounded-md border border-subtle p-1.5 text-muted hover:border-brand hover:text-brand"
          >
            <FolderOpen size={14} />
          </button>
        </div>
      </Field>

      <div className="flex justify-end border-t border-subtle pt-3">
        <button onClick={() => onRemove(index)} className="flex items-center gap-1.5 text-xs text-danger hover:underline">
          <Trash2 size={13} /> Remove Shortcut
        </button>
      </div>

      {pickingIcon && (
        <IconPickerModal
          candidates={iconCandidates}
          sourceFiles={sourceFiles}
          onClose={() => setPickingIcon(false)}
          onChoose={(path) => update({ iconPath: path })}
        />
      )}

      {pickingWorkingDirectory && (
        <DirectoryPickerModal
          manifest={manifest}
          title="Browse for a Working Directory"
          includeShellFolders={false}
          initialValue={shortcut.workingDirectory}
          onClose={() => setPickingWorkingDirectory(false)}
          onChoose={(value) => update({ workingDirectory: value })}
        />
      )}

      {pickingLocation && (
        <DirectoryPickerModal
          manifest={manifest}
          title="Browse for a Shortcut Location"
          includeShellFolders
          initialValue={shortcut.location}
          onClose={() => setPickingLocation(false)}
          onChoose={(value) => update({ location: value })}
        />
      )}
    </div>
  )
}
