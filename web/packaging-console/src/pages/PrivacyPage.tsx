import { BarChart3, Database, EyeOff, Globe, MessageSquare } from 'lucide-react'
import { AppLayout } from '../components/layout/AppLayout'
import { Panel } from '../components/ui/Panel'
import { analyticsEnabled } from '../state/analytics'
import { FEEDBACK_REPO_URL, SECURITY_REPORT_URL } from '../state/supportReport'

/** What the site and the Helper do with your information. Keep it true of the released site: change it in the same deploy as any change to what is collected. */
export const PRIVACY_UPDATED = '16 November 2026'

/** What this browser keeps for the site. Nothing here is sent anywhere. */
export const STORED_IN_BROWSER: string[] = [
  'Your projects, the files you attached to them, and the MSIs you have built (kept so your work and the Download button are still there after a reload).',
  'Settings you chose: the Helper address, the theme, which sections are open, column widths, and whether you have seen the latest release notes.',
  'The result and log of your last build, for this browser tab only, so the Support page can attach it if you ask it to.',
  'Whether you have seen the browser\'s local-network permission explanation.',
]

export function PrivacyPage() {
  const counting = analyticsEnabled()
  return (
    <AppLayout>
      <h1 className="text-lg font-semibold text-ink">Privacy</h1>
      <p className="max-w-3xl text-sm text-muted">
        How WinRelease handles your information. Last updated {PRIVACY_UPDATED}. WinRelease is made by GE App Solutions. In short: your projects and files stay on
        your own computer, the site has no accounts and sets no cookies{counting ? ', and counts visits without identifying anyone' : ', and counts no visitors'}.
      </p>

      <Panel icon={EyeOff} title="What we do not collect">
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink">
          <li>No accounts, sign-in or passwords.</li>
          <li>No cookies, and no advertising.</li>
          {counting ? (
            <li>
              No profiles. We count visits in totals only (see below); we do not follow individuals from visit to visit, record sessions, or collect names or emails.
            </li>
          ) : (
            <li>No visitor analytics. We do not currently measure visits, page views or clicks.</li>
          )}
          <li>
            Your project, your files and your built MSI are never uploaded by the website or the Helper: the site does not receive them and the Helper does not send them
            anywhere. The one thing that can leave your PC is what you choose to post to the public feedback tracker (see below).
          </li>
        </ul>
      </Panel>

      <Panel icon={Database} title="What stays in your browser">
        <p className="max-w-3xl text-sm text-muted">The site keeps these in your own browser (local storage, IndexedDB and session storage). They never leave your computer, and clearing your browser data removes them.</p>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-ink">
          {STORED_IN_BROWSER.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </Panel>

      <Panel icon={Globe} title="The Helper on your computer">
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink">
          <li>
            The Helper runs on your own PC and only answers programs on that PC (127.0.0.1). Builds, checks and the WiX compiler run there. It makes no requests to the internet. WiX and the .NET SDK, which you install separately, are other programs with their own settings (the .NET SDK, for
            example, has its own usage-data opt-out).
          </li>
          <li>The site talks to the Helper from your browser, on your own computer. Your browser asks you once to allow that local-network access.</li>
          <li>The Helper has no telemetry, no update check and no licence check. To update it, you download the new version yourself. Its tray menu can open this website or its log file in your own programs when you choose.</li>
          <li>The MSI you build adds a short line saying it was created with WinRelease. You can turn that off in App Info.</li>
        </ul>
      </Panel>

      <Panel icon={Globe} title="The services that host it">
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink">
          <li>
            The website is served by Netlify. Like any web host, Netlify processes request details such as your IP address and the page requested, under its own privacy policy. We
            do not use that to identify visitors.
          </li>
          <li>
            Links from WinRelease to our own site, geappsolutions.com, carry a short tag saying you came from WinRelease and which page the link was on, so that site can
            count the visit. The tag holds nothing about you or your project.
          </li>
          <li>
            The Helper download comes from GitHub Releases. GitHub processes the download request under its own privacy policy and counts downloads. We see the download total,
            not who downloaded.
          </li>
        </ul>
      </Panel>

      {counting && (
        <Panel icon={BarChart3} title="Counting visits">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink">
            <li>
              We use Cloudflare Web Analytics to see how many people visit, which pages they open, and where they came from, in totals. Like any server, Cloudflare receives
              your IP address and browser details with the request and processes them under its own privacy policy; it says Web Analytics does not use cookies or track
              individual visitors, and we get totals, not names.
            </li>
            <li>
              The counting script does not read or set cookies or browser storage. It sees the address of the page you open. In the editor that address holds a random project
              number, never your project&apos;s name or contents.
            </li>
            <li>It does not run inside your builds, and nothing from your project, files or MSI is sent to it.</li>
            <li>If your browser sends Do Not Track or Global Privacy Control, the counting script is not loaded at all.</li>
          </ul>
        </Panel>
      )}

      <Panel icon={MessageSquare} title="If you give us feedback">
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink">
          <li>
            There is no inbox behind the site. Feedback goes to a{' '}
            <a className="text-brand hover:underline" href={FEEDBACK_REPO_URL} target="_blank" rel="noreferrer">
              public issue tracker on GitHub
            </a>
            . What you post there is public, is stored by GitHub under its own privacy policy, and may be kept by search engines even if you delete it. Please leave out private
            details.
          </li>
          <li>
            Feedback &amp; Support can copy a plain block of details for you to read and paste: versions, the last build log if you tick that, and a project&apos;s settings (never its files)
            only if you tick that. Nothing is sent from the site itself.
          </li>
          <li>
            A security problem should not go in a public issue: use{' '}
            <a className="text-brand hover:underline" href={SECURITY_REPORT_URL} target="_blank" rel="noreferrer">
              GitHub&apos;s private report form
            </a>
            .
          </li>
        </ul>
        <p className="mt-3 max-w-3xl text-sm text-muted">If this changes, this page is updated first and the change is listed in the release notes.</p>
      </Panel>
    </AppLayout>
  )
}
