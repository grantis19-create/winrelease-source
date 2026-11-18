import { FolderOpen, Info, Shuffle, Wand2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Panel } from '../ui/Panel'
import { AutoGrowTextArea, Field, TextInput } from '../ui/Field'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { GuidField } from '../ui/GuidField'
import { newGuid } from '../../state/guid'
import { productVersionAdvice } from '../../state/productVersion'
import { productVersionFromFileVersion, readBinaryFileVersion } from '../../state/fileMetadata'
import { exampleBasePath, formatTargetDirectory, normalizeTargetDirectoryToken, parseTargetDirectory, resolvedPathPreview, setArchitecture, suggestedTargetDirectory, visibleTargetDirectoryRoots, withNameOrManufacturerChange } from '../../state/installTargets'
import type { TargetDirectoryRootId } from '../../state/installTargets'
import type { PackageArchitecture, WinReleaseManifest } from '../../types/manifest'

/** Compact input height shared across General's fields - see the density pass's "h-8/h-9" ask. */
const COMPACT_INPUT = 'h-9'

const ARCHITECTURES: { value: PackageArchitecture; label: string }[] = [
  { value: 'x64', label: 'x64 (Default)' },
  { value: 'x86', label: 'x86' },
  { value: 'arm64', label: 'arm64' },
]

/** A stable empty-Map identity for callers with nothing staged - keeps useDetectedProductVersion's effect dependency from churning every render on a fresh `new Map()`. */
const EMPTY_SOURCE_FILES: Map<string, File> = new Map()

/**
 * Executable detection for Product Version: the first staged `.exe` with a real blob (session-local
 * only, same `sourceFiles` map FilesSection/BuildPanel use - never an entry for a file restored
 * without its blob, e.g. after a reload that didn't restore IndexedDB) gets its PE version read via
 * `readBinaryFileVersion`. That reads the real Win32 FileVersion (major.minor.build.revision, all
 * four segments - correct for the file grid's own Version column, which just mirrors Explorer), but
 * WiX/MSI's Product Version only ever holds 3 (ADR 0055 - verified via `wix`'s WIX1148 warning): the
 * trailing revision segment is dropped here before offering a suggestion, and a version that's still
 * not well-formed after dropping it (e.g. a major/minor over 255) is suppressed rather than offered
 * broken. A pure suggestion surfaced next to the field, never applied automatically - this only
 * re-reads when the staged `.exe` itself changes.
 */
function useDetectedProductVersion(manifest: WinReleaseManifest, sourceFiles: Map<string, File>): { version: string; fileName: string } | null {
  const exeFile = manifest.files.declared.find((f) => /\.exe$/i.test(f.sourcePath) && sourceFiles.has(f.sourcePath))
  const [detected, setDetected] = useState<{ sourcePath: string; version: string } | null>(null)

  useEffect(() => {
    if (!exeFile) return
    const blob = sourceFiles.get(exeFile.sourcePath)
    if (!blob) return
    let cancelled = false
    readBinaryFileVersion(blob).then((fileVersion) => {
      if (cancelled || !fileVersion) return
      const productVersion = productVersionFromFileVersion(fileVersion)
      if (productVersion) setDetected({ sourcePath: exeFile.sourcePath, version: productVersion })
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exeFile?.sourcePath, sourceFiles])

  if (!exeFile || detected?.sourcePath !== exeFile.sourcePath) return null
  return { version: detected.version, fileName: exeFile.installPath.split('/').pop() ?? exeFile.installPath }
}

function BrowseTargetDirectoryModal({
  initial,
  architecture,
  onClose,
  onChoose,
}: {
  initial: string
  architecture: PackageArchitecture
  onClose: () => void
  onChoose: (value: string) => void
}) {
  const parsed = parseTargetDirectory(initial, architecture)
  const rootOptions = visibleTargetDirectoryRoots(architecture)
  const [root, setRoot] = useState<TargetDirectoryRootId>(
    parsed && rootOptions.includes(parsed.rootId) ? parsed.rootId : rootOptions[0],
  )
  const [subpath, setSubpath] = useState(parsed?.segments.join('\\') ?? '')
  const [localPath, setLocalPath] = useState(() => composeLocalPath(root, subpath))
  const [localPathUnrecognized, setLocalPathUnrecognized] = useState(false)

  /** Root/Subfolder edited directly - keep the local-path field's preview in sync with them. */
  function updateStructured(nextRoot: TargetDirectoryRootId, nextSubpath: string) {
    setRoot(nextRoot)
    setSubpath(nextSubpath)
    setLocalPath(composeLocalPath(nextRoot, nextSubpath))
    setLocalPathUnrecognized(false)
  }

  /**
   * A real local path typed/pasted directly (e.g. "C:\Program Files\Acme\MyApplication") -
   * auto-mapped to its WiX property via the same TargetDirectoryResolver-mirroring parser the
   * field itself uses, keeping Root/Subfolder in sync so either input stays editable afterward.
   * An unrecognized prefix (a drive other than C:, or a path with no known system-folder prefix)
   * is left as free text with a hint - Root/Subfolder below still work as a fallback.
   */
  function updateFromLocalPath(raw: string) {
    setLocalPath(raw)
    const parsedLocal = parseTargetDirectory(raw, architecture)
    if (!parsedLocal || !rootOptions.includes(parsedLocal.rootId)) {
      setLocalPathUnrecognized(raw.trim().length > 0)
      return
    }
    setLocalPathUnrecognized(false)
    setRoot(parsedLocal.rootId)
    setSubpath(parsedLocal.segments.join('\\'))
  }

  return (
    <Modal title="Browse for a Target Directory" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <Field label="Local path (type or paste)">
          <TextInput
            value={localPath}
            onChange={(e) => updateFromLocalPath(e.target.value)}
            placeholder="C:\Program Files\Acme\MyApplication"
            className="font-mono text-sm"
          />
          {localPathUnrecognized ? (
            <p className="mt-1 text-[11px] text-warn">
              Not a recognized system path - pick a Root below instead, or a mapped prefix like "C:\Program Files\", "C:\ProgramData\".
            </p>
          ) : (
            <p className="mt-1 text-[11px] text-muted">Recognized prefixes (Program Files, ProgramData, AppData, System32, …) auto-map to the Root/Subfolder below.</p>
          )}
        </Field>

        <Field label="Root">
          <select
            value={root}
            onChange={(e) => updateStructured(e.target.value as TargetDirectoryRootId, subpath)}
            className="rounded-md border border-subtle bg-panel-alt px-2.5 py-1.5 text-sm text-ink outline-none focus:border-brand"
          >
            {rootOptions.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
          {architecture === 'x86' && (
            <p className="mt-1 text-[11px] text-muted">64-bit-only roots are hidden while Architecture is x86.</p>
          )}
        </Field>
        <Field label="Subfolder (optional)">
          <TextInput value={subpath} onChange={(e) => updateStructured(root, e.target.value)} placeholder="Acme\App" />
        </Field>
        <div className="mt-1 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              onChoose(formatTargetDirectory(root, subpath))
              onClose()
            }}
          >
            Use This Path
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function composeLocalPath(root: TargetDirectoryRootId, subpath: string): string {
  return `${exampleBasePath(root)}${subpath.length > 0 ? `\\${subpath}` : ''}`
}

export function GeneralSection({
  manifest,
  onChange,
  lastBuiltProductCode,
  autoProductCode,
  onNewAutoProductCode,
  sourceFiles,
}: {
  manifest: WinReleaseManifest
  onChange: (next: WinReleaseManifest) => void
  /** The random Product Code the latest build put in its MSI (ADR 0120), shown under the field when no code is pinned. */
  lastBuiltProductCode?: string
  /** The random Product Code the next build will use when none is pinned (ADR 0120); shown in the field from the start. */
  autoProductCode?: string
  /** Replaces that code with another random one. */
  onNewAutoProductCode?: () => void
  /** Staged file blobs (session-local, keyed by sourcePath) - only source of a detected Product Version suggestion (executable detection). Omitted entirely when the caller has none to offer. */
  sourceFiles?: Map<string, File>
}) {
  const [browsingTargetDirectory, setBrowsingTargetDirectory] = useState(false)
  const [dismissedDetectedVersion, setDismissedDetectedVersion] = useState<string | null>(null)
  const detectedVersion = useDetectedProductVersion(manifest, sourceFiles ?? EMPTY_SOURCE_FILES)
  const versionSuggestion =
    detectedVersion && detectedVersion.version !== manifest.displayVersion && detectedVersion.version !== dismissedDetectedVersion ? detectedVersion : null

  // A fresh random GUID, set directly - no "automatic vs. pinned" distinction. Typical use: testing
  // a few iterations of a similar package (hit this, bump Product Version, change a file, compile) -
  // each wand click should be a one-step action, no confirmation in the way of that.
  function generateNewProductCode() {
    if (manifest.productCode) onChange({ ...manifest, productCode: newGuid() })
    else onNewAutoProductCode?.()
  }

  // Upgrade Code is what Windows Installer actually keys upgrade/uninstall recognition off -
  // riskier to regenerate than Product Code, so this confirms before replacing it.
  function generateNewUpgradeCode() {
    if (!window.confirm('Generate a brand new random Upgrade Code?\n\nIf this product has already been installed anywhere, builds made after this change will no longer be recognized as upgrades to - or able to cleanly replace - those installs.')) {
      return
    }
    onChange({ ...manifest, upgradeCode: newGuid() })
  }

  const productCodeShown = (manifest.productCode ?? autoProductCode ?? '').toUpperCase()

  return (
    <Panel icon={Info} title="General">
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Product Name">
            <TextInput
              value={manifest.name}
              onChange={(e) => onChange(withNameOrManufacturerChange(manifest, { name: e.target.value }))}
              aria-invalid={!manifest.name.trim()}
              className={`${COMPACT_INPUT} ${manifest.name.trim() ? '' : 'ring-1 ring-danger/60'}`}
            />
          </Field>
          <Field label="Manufacturer" hint="Your company or your own name - shown as the publisher in Add/Remove Programs.">
            <TextInput
              value={manifest.manufacturer}
              onChange={(e) => onChange(withNameOrManufacturerChange(manifest, { manufacturer: e.target.value }))}
              placeholder="Acme Corp"
              aria-invalid={!manifest.manufacturer.trim()}
              className={`${COMPACT_INPUT} ${manifest.manufacturer.trim() ? '' : 'ring-1 ring-danger/60'}`}
            />
          </Field>

          <Field
            label="Product Version"
            hint="Usually 3 numbers - major.minor.build, e.g. 1.0.0. This is what Windows Installer compares to decide whether a build is an upgrade, the same, or older - not just a label. Major and minor can be 0-255, build 0-65535."
          >
            <TextInput
              value={manifest.displayVersion}
              onChange={(e) => onChange({ ...manifest, displayVersion: e.target.value, productVersion: null })}
              placeholder="1.0.0"
                            className={`${COMPACT_INPUT} ${productVersionAdvice(manifest.displayVersion) ? 'ring-1 ring-warn/60' : manifest.displayVersion.trim() ? '' : 'ring-1 ring-danger/60'}`}
            />
            {productVersionAdvice(manifest.displayVersion) && <p className="mt-1 text-[11px] text-warn">{productVersionAdvice(manifest.displayVersion)}</p>}
            {versionSuggestion && (
              <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted">
                Detected {versionSuggestion.version} from {versionSuggestion.fileName}.
                <button
                  type="button"
                  onClick={() => onChange({ ...manifest, displayVersion: versionSuggestion.version, productVersion: null })}
                  className="font-medium text-brand hover:underline"
                >
                  Use this
                </button>
                <button type="button" onClick={() => setDismissedDetectedVersion(versionSuggestion.version)} className="text-muted hover:text-ink">
                  Dismiss
                </button>
              </p>
            )}
          </Field>
        </div>

        <div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <GuidField
              label="Product Code"
              hint="Identifies one build of your installer to Windows Installer. WinRelease fills in a random one, uses it for the next build, then makes a new one, as WiX does, so a rebuilt installer replaces the one before it and upgrades just work. If you type or paste your own, it stays fixed for every build (Pinned) and is yours to manage: use a different Product Code for every new Product Version. A new version that reuses the same Product Code is refused by Windows (“another version of this product is already installed”), not installed as an upgrade."
              value={productCodeShown}
              badge={
                manifest.productCode ? (
                  <span className="rounded border border-warn px-1 text-[10px] font-semibold uppercase tracking-wide text-warn" title="You set this Product Code yourself; WinRelease will not change it when the Product Version changes.">
                    Pinned
                  </span>
                ) : undefined
              }
              onCommit={(guid) => onChange({ ...manifest, productCode: guid })}
              actions={
                <button type="button" onClick={generateNewProductCode} title="Generate another random Product Code" className="text-muted hover:text-brand">
                  <Wand2 size={14} />
                </button>
              }
            />

            <GuidField
              label="Upgrade Code"
              hint="Identifies your product across all of its versions. Set once when the project is created - keep it the same for every release, or a newer version won't be recognized as an upgrade of an older install. Paste in your own GUID, or generate a fresh one, to replace it."
              value={manifest.upgradeCode.toUpperCase()}
              onCommit={(guid) => onChange({ ...manifest, upgradeCode: guid })}
              actions={
                <button type="button" onClick={generateNewUpgradeCode} title="Generate a new random Upgrade Code" className="text-muted hover:text-brand">
                  <Shuffle size={14} />
                </button>
              }
            />
          </div>
          {!manifest.productCode && lastBuiltProductCode && (
            <p className="mt-2 text-[11px] text-muted">
              Last build used <span className="font-mono text-ink">{lastBuiltProductCode}</span>. The code above is for the next build.
            </p>
          )}
          {manifest.productCode && (
            <p role="note" className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-warn">
              <span>
                This Product Code is pinned. If you release a new Product Version with the same Product Code, Windows refuses it (“another version of this product is already installed”) instead of upgrading. Use a new Product Code for each version.
              </span>
              <button type="button" onClick={() => onChange({ ...manifest, productCode: null })} className="font-medium text-brand hover:underline">
                Back to automatic
              </button>
            </p>
          )}
        </div>

        <div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Field
              label="Install Directory"
              className="sm:w-[70%]"
              hint={`This is INSTALLFOLDER. ↳ Resolves to: ${resolvedPathPreview(manifest, { root: 'installFolder', prefix: '' })}`}
            >
              <div className="relative">
                <AutoGrowTextArea
                  value={manifest.targetDirectory}
                  onChange={(e) => onChange({ ...manifest, targetDirectory: normalizeTargetDirectoryToken(e.target.value.replace(/[\r\n]+/g, '')) })}
                  placeholder="[ProgramFiles64Folder]Acme\App"
                  title="A WiX root token plus an optional subpath, e.g. [ProgramFiles64Folder]Acme\App - paste a literal path like C:\Program Files\Acme\App and it's converted to the WiX property form automatically."
                  className="w-full pr-8 font-mono text-sm"
                />
                <button
                  type="button"
                  onClick={() => setBrowsingTargetDirectory(true)}
                  title="Browse..."
                  className="absolute right-1.5 top-1.5 text-muted hover:text-brand"
                >
                  <FolderOpen size={14} />
                </button>
              </div>
              {suggestedTargetDirectory(manifest) && (
                <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted">
                  {manifest.files.declared.length + manifest.files.harvest.length > 0 ? 'Files will install straight into this folder. ' : ''}Suggestion:
                  <span className="font-mono">{suggestedTargetDirectory(manifest)}</span>
                  <button
                    type="button"
                    onClick={() => onChange({ ...manifest, targetDirectory: suggestedTargetDirectory(manifest)! })}
                    className="font-medium text-brand hover:underline"
                  >
                    Use this
                  </button>
                </p>
              )}
            </Field>

            <Field
              label="Target Architecture"
              className="sm:w-[30%]"
              hint="Builds one MSI targeting this architecture (wix build -arch) - the standard way to ship x86/x64/arm64 as separate installers. WinRelease doesn't check that the files you add actually match it. Switching moves the 32/64-bit folders to match; registry keys keep their text, so a key without WOW6432Node is written to the 32-bit view in an x86 package and the 64-bit view in x64."
            >
              <select
                value={manifest.architecture}
                onChange={(e) => onChange(setArchitecture(manifest, e.target.value as PackageArchitecture))}
                className={`w-full rounded-md border border-subtle bg-panel-alt px-2.5 text-sm text-ink outline-none focus:border-brand ${COMPACT_INPUT}`}
              >
                {ARCHITECTURES.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {parseTargetDirectory(manifest.targetDirectory, manifest.architecture)?.segments.length === 0 && (
            <p className="mt-2 text-xs text-warn">
              Your files will be installed directly into {resolvedPathPreview(manifest, { root: 'installFolder', prefix: '' })} with nothing
              around them. Add a folder for your app, e.g. <span className="font-mono">{manifest.targetDirectory.trim()}{manifest.manufacturer.trim() || 'Acme'}\{manifest.name.trim() || 'App'}</span>.
            </p>
          )}
        </div>
      </div>

      {browsingTargetDirectory && (
        <BrowseTargetDirectoryModal
          initial={manifest.targetDirectory}
          architecture={manifest.architecture}
          onClose={() => setBrowsingTargetDirectory(false)}
          onChoose={(value) => onChange({ ...manifest, targetDirectory: value })}
        />
      )}
    </Panel>
  )
}
