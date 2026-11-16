import { FolderOpen, Tag, UploadCloud } from 'lucide-react'
import { useRef, useState } from 'react'
import { Panel } from '../ui/Panel'
import { Field, TextInput } from '../ui/Field'
import { scopeWarnings, withInstallScope } from '../../state/installTargets'
import { IconPickerModal } from './IconPicker'
import type { AppInfo, WinReleaseManifest } from '../../types/manifest'

const ICON_EXTENSION = /\.(ico|exe)$/i

/** Every staged file's sourcePath whose extension WiX can use for the ARP icon (.ico, or an .exe to pull its embedded icon from) - same pool ShortcutsSection's "Browse…" picker offers, deduped since one source can be declared into multiple install locations. */
function iconCandidatesFor(manifest: WinReleaseManifest): string[] {
  return [...new Set(manifest.files.declared.filter((f) => ICON_EXTENSION.test(f.sourcePath)).map((f) => f.sourcePath))]
}

/** Picks a sourcePath key for a freshly-uploaded icon that won't collide with an existing declared file or already-staged blob - both share the same build sources zip namespace. Duplicated from ShortcutDetailPanel's own copy rather than shared: each call site's "taken" set differs slightly and neither is on a path where that matters. */
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

/** The first declared file AutoExtractIcon would actually resolve to server-side (WxsGenerator.BuildArpIcon) - shown so the checkbox's effect isn't a guess. */
function autoExtractCandidate(manifest: WinReleaseManifest): string | null {
  return manifest.files.declared.find((f) => /\.exe$/i.test(f.sourcePath))?.sourcePath ?? null
}

export function AppInfoSection({
  manifest,
  onChange,
  sourceFiles,
  onStageFiles,
}: {
  manifest: WinReleaseManifest
  onChange: (next: WinReleaseManifest) => void
  /** Staged file blobs (session-local, keyed by sourcePath) - lets the icon picker show a real .ico preview instead of just a filename. */
  sourceFiles: Map<string, File>
  /** Stages a freshly-uploaded icon file into the build sources - same mechanism ShortcutDetailPanel's "Upload" button and Files & Folders' Add Files use. */
  onStageFiles: (entries: { path: string; file: File }[]) => void
}) {
  const appInfo = manifest.appInfo
  const iconCandidates = iconCandidatesFor(manifest)
  const autoExtractTarget = autoExtractCandidate(manifest)
  const [pickingIcon, setPickingIcon] = useState(false)
  const iconUploadRef = useRef<HTMLInputElement>(null)

  /** Uploads a brand-new .ico/.exe straight from disk instead of only picking from icons already declared as an install target elsewhere in the project - the gap a user without a declared .exe/.ico (e.g. a standalone branding icon) had no way around before this. */
  function uploadIcon(file: File) {
    const path = uniqueIconSourcePath(manifest, sourceFiles, file.name)
    onStageFiles([{ path, file }])
    update({ iconPath: path })
  }

  function update(patch: Partial<AppInfo>) {
    onChange({ ...manifest, appInfo: { ...appInfo, ...patch } })
  }

  return (
    <Panel
      icon={Tag}
      title="App Info & Installed Apps (ARP)"
      defaultCollapsed
      description="Configure publisher details, support links, control panel icon, and Windows Settings entry behavior."
    >
      <div className="flex flex-col gap-5">
        <div>
          <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Product Support &amp; Publisher Links</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Support Link">
              <TextInput
                value={appInfo.supportUrl ?? ''}
                onChange={(e) => update({ supportUrl: e.target.value || null })}
                placeholder="https://acme.com/support"
                title="WiX/MSI property: ARPHELPLINK"
              />
            </Field>
            <Field label="Update Info Link">
              <TextInput
                value={appInfo.updateUrl ?? ''}
                onChange={(e) => update({ updateUrl: e.target.value || null })}
                placeholder="https://acme.com/updates"
                title="WiX/MSI property: ARPURLUPDATEINFO"
              />
            </Field>
            <Field label="Website / Home Page">
              <TextInput
                value={appInfo.aboutUrl ?? ''}
                onChange={(e) => update({ aboutUrl: e.target.value || null })}
                placeholder="https://acme.com"
                title="WiX/MSI property: ARPURLINFOABOUT"
              />
            </Field>
            <Field label="Support Telephone">
              <TextInput
                value={appInfo.supportPhone ?? ''}
                onChange={(e) => update({ supportPhone: e.target.value || null })}
                placeholder="+1-800-555-0199"
                title="WiX/MSI property: ARPHELPTELEPHONE"
              />
            </Field>
            <Field label="Contact Person">
              <TextInput
                value={appInfo.contact ?? ''}
                onChange={(e) => update({ contact: e.target.value || null })}
                placeholder="Support Team"
                title="WiX/MSI property: ARPCONTACT"
              />
            </Field>
            <Field label="Comments / Description">
              <TextInput
                value={appInfo.comments ?? ''}
                onChange={(e) => update({ comments: e.target.value || null })}
                placeholder="Desktop application package"
                title="WiX/MSI property: ARPCOMMENTS"
              />
            </Field>
            <div className="sm:col-span-2">
              <label className="flex items-center gap-2 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={appInfo.packagedWithCredit !== false}
                  onChange={(e) => update({ packagedWithCredit: e.target.checked })}
                />
                Say the MSI was packaged with WinRelease
              </label>
              <p className="mt-1 text-[11px] text-muted">
                Adds one line to the MSI's file details (and to the Add/Remove Programs comments if you left Comments empty), pointing to winrelease.geappsolutions.com and
                geappsolutions.com for business packaging. Nothing is shown while installing. Untick to leave it out.
              </p>
            </div>
          </div>
        </div>

        <div>
          <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Control Panel Icon &amp; Scope</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="App / Control Panel Icon">
              <div className="flex items-center gap-1.5">
                <TextInput
                  value={appInfo.iconPath ?? ''}
                  onChange={(e) => update({ iconPath: e.target.value || null })}
                  placeholder="assets/app.ico"
                  disabled={appInfo.autoExtractIcon}
                  title="WiX/MSI property: ARPPRODUCTICON"
                />
                <button
                  type="button"
                  onClick={() => setPickingIcon(true)}
                  disabled={appInfo.autoExtractIcon}
                  title="Browse .ico/.exe files already added in Files & Folders"
                  className="shrink-0 rounded-md border border-subtle p-1.5 text-muted hover:border-brand hover:text-brand disabled:opacity-60"
                >
                  <FolderOpen size={14} />
                </button>
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
                  disabled={appInfo.autoExtractIcon}
                  title="Upload a new .ico/.exe from your computer - doesn't need to be declared as an install target first"
                  className="shrink-0 rounded-md border border-subtle p-1.5 text-muted hover:border-brand hover:text-brand disabled:opacity-60"
                >
                  <UploadCloud size={14} />
                </button>
              </div>
              <label className="mt-1.5 flex items-center gap-2 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={appInfo.autoExtractIcon}
                  onChange={(e) => update({ autoExtractIcon: e.target.checked })}
                />
                Auto-extract from primary executable
              </label>
              <p className="mt-1 text-[11px] text-muted">
                {appInfo.autoExtractIcon
                  ? autoExtractTarget
                    ? `Will use the icon embedded in "${autoExtractTarget}".`
                    : 'No declared .exe file yet - add one in Files & Folders, or uncheck this to pick an icon manually.'
                  : 'Uses the icon above (an .ico, or an .exe to pull its embedded icon from).'}
              </p>
            </Field>

            <Field
              label="Install Scope"
              hint="Per-machine installs for every user on the PC and needs administrator rights. Per-user installs just for whoever runs it, into their own profile, with no admin rights."
            >
              <div className="flex rounded-md border border-subtle text-xs">
                <button
                  type="button"
                  onClick={() => onChange(withInstallScope(manifest, 'perMachine'))}
                  className={`rounded-l-md px-3 py-1.5 ${appInfo.installScope === 'perMachine' ? 'bg-brand/10 text-brand' : 'text-muted hover:text-ink'}`}
                >
                  Per-Machine (All Users)
                </button>
                <button
                  type="button"
                  onClick={() => onChange(withInstallScope(manifest, 'perUser'))}
                  className={`rounded-r-md px-3 py-1.5 ${appInfo.installScope === 'perUser' ? 'bg-brand/10 text-brand' : 'text-muted hover:text-ink'}`}
                >
                  Per-User (Current User)
                </button>
              </div>
              <p className="mt-1.5 text-[11px] text-muted">
                {appInfo.installScope === 'perUser'
                  ? 'Just for the person who installs it - no admin prompt. Files in their profile (AppData\\Local\\Programs), settings in HKEY_CURRENT_USER, their own Start Menu and Desktop. Cannot write to Program Files or HKEY_LOCAL_MACHINE.'
                  : 'For everyone on the PC - Windows asks for admin approval. Files in Program Files, settings in HKEY_LOCAL_MACHINE, All Users Start Menu and Desktop.'}{' '}
                <span className="rounded bg-panel-alt px-1.5 py-0.5 font-mono text-[10px]">ALLUSERS</span>{' '}
                {appInfo.installScope === 'perUser' ? 'is left unset for you.' : 'is set to 1 for you.'} Don&apos;t add it under Properties.
              </p>
              {scopeWarnings(manifest).map((warning) => (
                <p key={warning} className="mt-1.5 text-[11px] text-warn">
                  {warning}
                </p>
              ))}
            </Field>
          </div>
        </div>

        <div>
          <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Installer Screens</h3>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={appInfo.installWizard !== false} onChange={(e) => update({ installWizard: e.target.checked })} />
            Show an install wizard
          </label>
          <p className="mt-1 text-[11px] text-muted">
            Double-clicking the MSI opens Welcome, Install folder, Ready and Finish screens, and Windows Settings gets a Repair/Remove screen. Turn it off for just a progress bar. Silent installs (/qn) never show it.
          </p>
        </div>

        <div>
          <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Windows Settings Behavior</h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {/* The install wizard (WixUI_InstallDir) has no Modify page and always sets ARPNOMODIFY itself, so the box is shown ticked and locked while it is on. */}
            <label
              className="flex items-center gap-2 text-sm text-ink"
              title={appInfo.installWizard !== false ? 'Always on while Installer Screens is on: the install wizard has no Modify page, so Windows hides the button.' : undefined}
            >
              <input
                type="checkbox"
                checked={appInfo.disableModify || appInfo.installWizard !== false}
                disabled={appInfo.installWizard !== false}
                onChange={(e) => update({ disableModify: e.target.checked })}
              />
              Disable Modify Button
              <span className="font-mono text-[11px] text-muted">ARPNOMODIFY</span>
            </label>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" checked={appInfo.disableRepair} onChange={(e) => update({ disableRepair: e.target.checked })} />
              Disable Repair Button
              <span className="font-mono text-[11px] text-muted">ARPNOREPAIR</span>
            </label>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" checked={appInfo.disableRemove} onChange={(e) => update({ disableRemove: e.target.checked })} />
              Disable Remove / Uninstall Button
              <span className="font-mono text-[11px] text-muted">ARPNOREMOVE</span>
            </label>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={appInfo.hideFromControlPanel}
                onChange={(e) => update({ hideFromControlPanel: e.target.checked })}
              />
              Do not show in Windows Installed Apps List
              <span className="font-mono text-[11px] text-muted">ARPSYSTEMCOMPONENT</span>
            </label>
          </div>
        </div>
      </div>

      {pickingIcon && (
        <IconPickerModal
          candidates={iconCandidates}
          sourceFiles={sourceFiles}
          onClose={() => setPickingIcon(false)}
          onChoose={(path) => update({ iconPath: path })}
        />
      )}
    </Panel>
  )
}
