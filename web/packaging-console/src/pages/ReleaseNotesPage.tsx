import { AlertTriangle, Download, Heart, Lightbulb, Rss, Sparkles } from 'lucide-react'
import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { AppLayout } from '../components/layout/AppLayout'
import { Panel } from '../components/ui/Panel'
import { WhoMadeThis } from '../components/WhoMadeThis'
import { HELPER_DOWNLOAD_URL, HELPER_LATEST_VERSION, HELPER_RELEASE_DATE, HELPER_RELEASES_PAGE, HELPER_SHA256, HELPER_SIZE_LABEL } from '../state/helperLinks'
import { NEWS, markNewsSeen } from '../state/whatsNew'

/** What WinRelease deliberately does not do, or does not do yet. Keep it short and true; remove a line when it stops being so. */
export const KNOWN_LIMITATIONS: string[] = [
  'Windows only. Builds run in the WinRelease Helper on your own Windows PC, together with the WiX tool and the .NET SDK, which you install yourself.',
  'Aimed at simple, lightweight installers. WinRelease opens only its own project files (winrelease.json and the saved .winrelease.zip); it does not import WiX source or other packaging formats.',
  'The Helper is an unsigned pre-release, so Windows may show an "unknown publisher" warning the first time you run it. Check the SHA-256 below against your download.',
  'WinRelease is in beta. It is free while in beta, and may be changed, limited or withdrawn.',
  'A shortcut can use an icon file but not a numbered icon inside an .exe or .dll; it always uses the first icon.',
  'The installer\'s Repair / Remove page shows a Change button even for packages that have nothing selectable to change. It does nothing useful and is harmless.',
]

/** Ideas only. No dates and no promises: the page says so. Keep each line to something the owner would genuinely consider. */
export const CONSIDERING: string[] = [
  'Building in the cloud with nothing to install: for when you cannot or would rather not install the Helper. Your files would be uploaded for the build and deleted straight after, and the Helper would stay the default.',
  'A winget manifest builder: describe your installer once and get the winget manifest files ready to submit.',
  'A bundle builder: chain prerequisites and your MSI into one setup.exe.',
  'Intune packaging: turn your MSI into an Intune-ready package with its detection rule.',
  'Building many installers at once: give it a list of folders or zips, share the settings (manufacturer, install scope and so on), and get an MSI for each.',
]

/** Release notes: the current download with its checksum, the known limits, and what changed, newest first. Static text shipped with the site; opening it only clears the sidebar dot, in this browser. */
export function ReleaseNotesPage() {
  useEffect(() => {
    markNewsSeen()
  }, [])

  return (
    <AppLayout>
      <h1 className="text-lg font-semibold text-ink">Release notes</h1>
      <p className="max-w-3xl text-sm text-muted">
        The current Helper download, what WinRelease does not do, and every change to the site and the Helper, newest first. Site changes are live as soon as
        they are published; a change marked as needing a newer Helper reaches you when you run the latest download.
      </p>

      <WhoMadeThis />

      <Panel icon={Download} title={`Current Helper: v${HELPER_LATEST_VERSION}`} description={`Released ${HELPER_RELEASE_DATE} (pre-release, unsigned)`}>
        <dl className="grid max-w-3xl grid-cols-[8rem_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted">Download</dt>
          <dd>
            <a className="text-brand hover:underline" href={HELPER_DOWNLOAD_URL}>
              WinRelease.Helper.exe
            </a>{' '}
            <span className="text-muted">({HELPER_SIZE_LABEL})</span>
          </dd>
          <dt className="text-muted">SHA-256</dt>
          <dd className="break-all font-mono text-xs text-ink">{HELPER_SHA256}</dd>
          <dt className="text-muted">Needs</dt>
          <dd className="text-ink">64-bit Windows 11 (the version it is tested on), the .NET SDK and WiX. The Settings page walks you through both.</dd>
          <dt className="text-muted">All versions</dt>
          <dd>
            <a className="text-brand hover:underline" href={HELPER_RELEASES_PAGE} target="_blank" rel="noreferrer">
              GitHub releases page
            </a>
          </dd>
        </dl>
      </Panel>

      <Panel icon={AlertTriangle} title="Known limitations" id="limitations">
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink">
          {KNOWN_LIMITATIONS.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="mt-3 max-w-3xl text-xs text-muted">
          The Build Help page lists how WinRelease is tested, and the Disclaimer covers what you are responsible for.
        </p>
      </Panel>

      <Panel icon={Lightbulb} title="Ideas we are considering" id="considering">
        <p className="max-w-3xl text-sm text-muted">
          These are ideas, not plans. There are no dates and no promises, and some may never happen. If one would help you, tell us: it is how we decide what is worth
          doing.
        </p>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-ink">
          {CONSIDERING.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-muted">
          <Link to="/support?topic=idea" className="text-brand hover:underline">
            Tell us which one you would use
          </Link>
        </p>
      </Panel>

      {NEWS.map((entry) => (
        <Panel key={entry.id} icon={Sparkles} title={entry.title} description={entry.date}>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink">
            {entry.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Panel>
      ))}

      <Panel icon={Rss} title="Hear about new Helper versions">
        <p className="max-w-2xl text-sm text-muted">
          Every Helper release is posted on GitHub. Open the{' '}
          <a className="text-brand hover:underline" href={HELPER_RELEASES_PAGE} target="_blank" rel="noreferrer">
            releases page
          </a>{' '}
          and choose Watch &gt; Custom &gt; Releases to get an email from GitHub when there is a new one, or add its{' '}
          <a className="text-brand hover:underline" href={`${HELPER_RELEASES_PAGE}.atom`} target="_blank" rel="noreferrer">
            feed
          </a>{' '}
          to a feed reader. The site also tells you in Settings when your Helper is out of date.
        </p>
      </Panel>

      <Panel icon={Heart} title="Like it?">
        <p className="max-w-2xl text-sm text-muted">
          We would love to hear it, and so would the next person deciding whether to try it.{' '}
          <Link to="/support?topic=praise" className="text-brand hover:underline">
            Tell us what you like
          </Link>
          .
        </p>
      </Panel>
    </AppLayout>
  )
}
