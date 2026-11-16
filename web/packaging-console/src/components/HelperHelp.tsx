import { BookOpen, Download, Laptop2, ShieldCheck, Wrench } from 'lucide-react'
import { DEFAULT_HELPER_URL, useBackendStatus } from '../state/backend'
import { HELPER_DOWNLOAD_URL, HELPER_LATEST_VERSION, HELPER_RELEASES_PAGE, HELPER_SHA256 } from '../state/helperLinks'
import { geAppSolutionsUrl } from '../state/outbound'
import { smartScreenAdvice, smartScreenWhy } from '../state/helperSigning'
import { isUpdateAvailable } from '../state/helperVersion'
import { CopyCommand } from './ui/CopyCommand'
import { Panel } from './ui/Panel'

/**
 * The Helper's help sections, shared by the Helper guide page and Settings so the same text is reachable from both (collapsed by default
 * in Settings, where they sit under the connection settings; the guide opens them). The panel's collapsed state is remembered per title.
 */

type HelpPanelProps = { defaultCollapsed?: boolean; forceExpanded?: boolean }

export function HelperDownloadPanel({ defaultCollapsed = false, forceExpanded = false }: HelpPanelProps) {
  const status = useBackendStatus()
  const update = status?.isHelper && isUpdateAvailable(status.helperVersion)

  return (
    <Panel id="download" icon={Download} title="Download the Helper" defaultCollapsed={defaultCollapsed} forceExpanded={forceExpanded}>
      <div className="flex flex-col gap-2 text-sm text-ink">
        <p>
          <a className="text-brand hover:underline" href={HELPER_DOWNLOAD_URL}>
            Download WinRelease.Helper.exe (v{HELPER_LATEST_VERSION}, about 47 MB)
          </a>
        </p>
        <p className="text-muted">
          Run it once and it installs itself for your Windows user (no administrator rights), so you can delete the download afterwards. Other
          versions are on the{' '}
          <a className="text-brand hover:underline" href={HELPER_RELEASES_PAGE} target="_blank" rel="noreferrer">
            releases page
          </a>
          .
        </p>
        {update && (
          <p className="text-warn">
            You are running v{status?.helperVersion}; v{HELPER_LATEST_VERSION} is available. Run the new download and it replaces the old one by
            itself (from v0.1.4 on; before that, quit the old one from its tray icon first). From v0.1.7 the new one also takes the old one&apos;s
            place, so the downloaded file can be deleted.
          </p>
        )}
      </div>
    </Panel>
  )
}

export function HelperSetupPanel({ defaultCollapsed = false, forceExpanded = false }: HelpPanelProps) {
  return (
    <Panel id="quick-start" icon={BookOpen} title="Quick-start guide" defaultCollapsed={defaultCollapsed} forceExpanded={forceExpanded}>
      <ol className="list-decimal space-y-3 pl-5 text-sm text-ink">
        <li>
          <strong>Download the Helper.</strong>{' '}
          <a className="text-brand hover:underline" href={HELPER_DOWNLOAD_URL}>
            Download WinRelease.Helper.exe (v{HELPER_LATEST_VERSION}, about 47 MB)
          </a>
          . Nothing to unzip: running it installs it for you (next steps).
        </li>
        <li>
          <strong>Install the WiX compiler once.</strong> The Helper itself needs nothing installed, but the MSI is built by Microsoft&apos;s WiX
          tool, which is a separate .NET tool. In a terminal, run these commands:
          <CopyCommand command="winget install Microsoft.DotNet.SDK.9 --source winget" />
          <p className="mt-1.5 text-xs text-muted">
            On an older Windows 11 image, winget can stop with <span className="text-ink">Failed when opening source(s)</span> or a certificate error from
            &ldquo;msstore&rdquo;; the <code>--source winget</code> part avoids that. If winget still fails, update <strong>App Installer</strong> in the
            Microsoft Store, then run the command again.
          </p>
          <p className="mt-1.5 text-xs text-muted">Then open a new terminal (so the new .NET is found) and run:</p>
          <CopyCommand command="dotnet tool install --global wix --version 7.0.0" />
          <p className="mt-1.5 text-xs text-muted">
            Then add the part WiX needs for the installer screens. WiX 7 refuses every command until you have accepted its terms, and the Helper&apos;s own
            acceptance only covers what the Helper runs, so the acceptance is part of this command: organisations with more than US$10,000 in annual revenue (as the maintenance fee terms define it) are required to sponsor the WiX
            project (the norm is about $10 a month; see docs.firegiant.com/wix/osmf).
          </p>
          <CopyCommand command="wix extension add --global WixToolset.UI.wixext/7.0.0 -acceptEula wix7" />
          <p className="mt-1.5 text-xs text-muted">
            Already have the .NET 9 SDK? Skip the first command. If WiX is missing, the connection check warns you (and the Helper&apos;s log file says so).
            Use a normal terminal, not &ldquo;Run as administrator&rdquo;: the tool installs for the Windows user running it.
          </p>
          <p className="mt-1.5 text-xs text-muted">
            Seeing <span className="text-ink">No NuGet sources are defined or enabled</span>? This PC has no package source set up for .NET (common on a fresh or
            locked-down machine). Add the standard one, then run the install command again:
          </p>
          <CopyCommand command="dotnet nuget add source https://api.nuget.org/v3/index.json --name nuget.org" />
          <p className="mt-1.5 text-xs text-muted">
            If that source already exists but is disabled, enable it with <code>dotnet nuget enable source nuget.org</code>. On a work PC that blocks the public
            package source, ask your IT team to allow it, or to install WiX 7.0.0 for you.
          </p>
        </li>
        <li>
          <strong>Run WinRelease.Helper.exe once.</strong> It installs itself into <code>%LOCALAPPDATA%\Programs\WinRelease Helper</code> for your
          Windows user (no administrator rights), says so, and starts. You can then delete the downloaded file. No window opens: look for the orange
          W icon near the clock (click the ^ if it is hidden). Right-click it to open the site, see the log, start it with Windows, uninstall it, or
          Quit. It listens only on your own computer ({DEFAULT_HELPER_URL}), and quits by itself a few minutes after you close the site. From then on, the{' '}
          <strong>Start the Helper</strong> button starts it for you.{' '}
          <span className="text-muted">
            {smartScreenAdvice()} If Windows offers no Run anyway (common on work PCs), right-click the downloaded file, choose Properties, tick{' '}
            <strong>Unblock</strong>, press OK and run it again.
          </span>
        </li>
        <li>
          <strong>Check the connection.</strong> If your browser asks about local network access, choose Allow. Then build as normal.
        </li>
      </ol>
    </Panel>
  )
}

export function AboutHelperPanel({ defaultCollapsed = false, forceExpanded = false }: HelpPanelProps) {
  const row = 'flex flex-col gap-0.5'
  return (
    <Panel id="about" icon={ShieldCheck} title="What is the Helper?" defaultCollapsed={defaultCollapsed} forceExpanded={forceExpanded}>
      <dl className="space-y-3 text-sm">
        <div className={row}>
          <dt className="font-medium text-ink">What it is</dt>
          <dd className="text-muted">
            A small program from GE App Solutions that runs on your PC and does the actual MSI build with Microsoft&apos;s WiX tool. The website cannot
            build Windows installers by itself, so it hands the job to the Helper and gets the finished MSI back.
          </dd>
        </div>
        <div className={row}>
          <dt className="font-medium text-ink">Your files stay on your PC</dt>
          <dd className="text-muted">
            The Helper makes no connections to the internet of its own and sends nothing anywhere: no account, no tracking. It reads only the project and
            files the site passes to it for a build, works in a temporary folder, and deletes that folder when the build finishes.
          </dd>
        </div>
        <div className={row}>
          <dt className="font-medium text-ink">Read the source</dt>
          <dd className="text-muted">
            The Helper&apos;s source code is published for inspection, so you can see what runs on your PC.{' '}
            <a className="text-brand hover:underline" href="/help#inspect">
              How to check it
            </a>
            .
          </dd>
        </div>
        <div className={row}>
          <dt className="font-medium text-ink">Who can talk to it</dt>
          <dd className="text-muted">
            &ldquo;Your own computer&rdquo; means the PC you installed it on, not this website or any server. It listens only there ({DEFAULT_HELPER_URL}), never on your network or the
            internet, and refuses to start if it is told to use a network address. That is why Windows Firewall does not ask whether to allow it. It only answers requests that come from this website.
          </dd>
        </div>
        <div className={row}>
          <dt className="font-medium text-ink">How it is protected, and what it cannot stop</dt>
          <dd className="text-muted">
            <ul className="list-disc space-y-1 pl-5">
              <li>It only accepts calls from your own computer, the one it is running on, and only for requests addressed to a local name, which blocks a web page pointing its own address at your PC.</li>
              <li>
                Your browser only lets pages from this website use it. Pages from other websites are refused by the browser&apos;s own checks, and a page cannot fake
                where it came from.
              </li>
              <li>It builds only from the project and files the page sends, inside a temporary folder that is deleted afterwards.</li>
              <li>
                <span className="text-ink">The limit:</span> there is no password or pairing step. Another program already running on your PC as you could call it
                too, but such a program can already run the WiX tool itself, so it gains nothing it did not have. If a PC is already compromised, the Helper cannot
                fix that.
              </li>
              <li>We plan an independent security review once the Helper is code-signed, and will say what it finds.</li>
            </ul>
          </dd>
        </div>
        <div className={row}>
          <dt className="font-medium text-ink">What it changes on your PC</dt>
          <dd className="text-muted">
            Its own folder, <code>%LOCALAPPDATA%\Programs\WinRelease Helper</code>; a log file in <code>%LOCALAPPDATA%\WinRelease</code>; an entry in
            Settings &gt; Apps; and a small entry for your Windows user that lets the site&apos;s Start button open it. A Start with Windows entry is added
            only if you tick that in its tray menu. All of it is for your Windows user only: no administrator rights, no service, nothing else
            installed.
          </dd>
        </div>
        <div className={row}>
          <dt className="font-medium text-ink">Check what you downloaded</dt>
          <dd className="text-muted">
            This is v{HELPER_LATEST_VERSION}, about 47 MB, from this project&apos;s GitHub releases. Its SHA-256 should match this value; in PowerShell,
            run <code>Get-FileHash .\WinRelease.Helper.exe</code> and compare:
            <code className="mt-1 block break-all rounded bg-panel-alt px-2 py-1 text-[11px] text-ink">{HELPER_SHA256}</code>
            {smartScreenWhy()}
          </dd>
        </div>
        <div className={row}>
          <dt className="font-medium text-ink">Stopping and removing it</dt>
          <dd className="text-muted">
            Right-click the orange W icon near the clock and choose Quit (it also quits by itself a few minutes after you close the site). To remove it
            completely, choose Uninstall in that menu, or uninstall WinRelease Helper from Settings &gt; Apps: that stops it and removes the program,
            its Start with Windows setting, the Start-button link and its log. Your projects stay, because they are saved in your browser.
          </dd>
        </div>
      </dl>
    </Panel>
  )
}

export function HelperTroubleshootingPanel({ defaultCollapsed = false, forceExpanded = false }: HelpPanelProps) {
  return (
    <Panel id="troubleshooting" icon={Wrench} title="Troubleshooting" defaultCollapsed={defaultCollapsed} forceExpanded={forceExpanded}>
      <dl className="space-y-3 text-sm">
        <div>
          <dt className="font-medium text-ink">&ldquo;Couldn&apos;t be checked right now (502)&rdquo; or &ldquo;build service couldn&apos;t be reached&rdquo;</dt>
          <dd className="text-muted">The Helper wasn&apos;t running when the page loaded. Start it, then press Try again or Check connection.</dd>
        </div>
        <div>
          <dt className="font-medium text-ink">Nothing happens on Check connection</dt>
          <dd className="text-muted">
            Your browser may have blocked local network access for this site. Click the lock icon in the address bar, allow Local network access, and
            check again.
          </dd>
        </div>
        <div>
          <dt className="font-medium text-ink">Build fails with a WiX error</dt>
          <dd className="text-muted">Open Build Output in the project: the full WiX log is shown there. Most errors name the file or setting at fault.</dd>
        </div>
        <div>
          <dt className="font-medium text-ink">&ldquo;Start the Helper&rdquo; does nothing</dt>
          <dd className="text-muted">
            The button only works after you have run WinRelease.Helper.exe once by hand (that is when it installs and registers itself with Windows),
            and the browser must be allowed to open it: choose Open when it asks. If you uninstalled it, download it and run it once again.
          </dd>
        </div>
        <div>
          <dt className="font-medium text-ink">The Helper went away by itself</dt>
          <dd className="text-muted">
            It quits a few minutes after the site is closed, on purpose. Press Start the Helper (or run it again) next time. To keep it running, tick
            Start with Windows in its tray menu.
          </dd>
        </div>
        <div>
          <dt className="font-medium text-ink">A new download will not start</dt>
          <dd className="text-muted">
            An older Helper is still running. From v0.1.4 a newer one replaces it automatically. Before that, right-click the orange W icon near the
            clock, choose Quit, then run the new one.
          </dd>
        </div>
        <div>
          <dt className="font-medium text-ink">The port is already in use</dt>
          <dd className="text-muted">Another copy of the Helper is probably running. Right-click its orange W icon near the clock and choose Quit, then start it once.</dd>
        </div>
      </dl>
    </Panel>
  )
}

export function MoreThanBasicPanel({ defaultCollapsed = false, forceExpanded = false }: HelpPanelProps) {
  return (
    <Panel icon={Laptop2} title="Need more than a basic MSI?" defaultCollapsed={defaultCollapsed} forceExpanded={forceExpanded}>
      <p className="text-sm text-muted">
        WinRelease builds basic installers. For custom actions, features, upgrades, signing or enterprise packaging, see{' '}
        <a className="text-brand hover:underline" href={geAppSolutionsUrl('settings-more-than-basic')} target="_blank" rel="noreferrer">
          geappsolutions.com
        </a>
        .
      </p>
    </Panel>
  )
}
