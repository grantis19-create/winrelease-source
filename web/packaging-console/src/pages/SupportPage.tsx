import { ClipboardCopy, ExternalLink, LifeBuoy, ShieldAlert, ShieldCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AppLayout } from '../components/layout/AppLayout'
import { Button } from '../components/ui/Button'
import { Panel } from '../components/ui/Panel'
import { WhoMadeThis } from '../components/WhoMadeThis'
import { listLocalProjects } from '../state/localProjects'
import { resolveBackend } from '../state/backend'
import {
  FEEDBACK_REPO_URL,
  SECURITY_REPORT_URL,
  SUPPORT_TOPIC_LABELS,
  buildSupportDetails,
  issueFormUrl,
  lastBuildOutcome,
  topicNeedsDetails,
  type SupportTopic,
} from '../state/supportReport'

const TOPICS = Object.keys(SUPPORT_TOPIC_LABELS) as SupportTopic[]

/**
 * Feedback & Support. There is no server and no inbox behind the site: feedback goes to a public GitHub issue tracker (ADR 0117). This page
 * helps a person open the right form, and can copy a readable block of details (versions, the latest build log, optionally project settings) for them
 * to read and paste into it. Nothing is sent from the page itself.
 */
export function SupportPage() {
  // Other pages link here with ?topic=praise or ?topic=idea.
  const [searchParams] = useSearchParams()
  const requested = searchParams.get('topic')
  const [topic, setTopic] = useState<SupportTopic>(TOPICS.includes(requested as SupportTopic) ? (requested as SupportTopic) : 'problem')
  const needsDetails = topicNeedsDetails(topic)
  const [includeBuild, setIncludeBuild] = useState(true)
  const [projectId, setProjectId] = useState('')
  const [copied, setCopied] = useState<'yes' | 'no' | null>(null)

  const projects = useMemo(() => {
    try {
      return listLocalProjects()
    } catch {
      return []
    }
  }, [])
  const project = projects.find((p) => p.id === projectId)
  const outcome = lastBuildOutcome()

  async function copyDetails() {
    // Refresh the Helper details first so the text reports what is true now, not what was true when the page loaded.
    await resolveBackend()
    const text = buildSupportDetails({ includeBuild, project: project ? { name: project.manifest.name, manifest: project.manifest } : null })
    try {
      await navigator.clipboard.writeText(text)
      setCopied('yes')
    } catch {
      setCopied('no')
    }
  }

  return (
    <AppLayout>
      <h1 className="text-lg font-semibold text-ink">Feedback &amp; Support</h1>
      <p className="max-w-3xl text-sm text-muted">
        Feedback goes to a public tracker on GitHub, where anyone can read it, including us. You need a free GitHub account to post. Nothing is sent from this page.
      </p>

      <Panel icon={LifeBuoy} title="What do you need?">
        <div className="flex max-w-2xl flex-col gap-4">
          <div className="flex flex-wrap gap-4 text-sm">
            {TOPICS.map((candidate) => (
              <label key={candidate} className="flex items-center gap-2">
                <input type="radio" name="topic" checked={topic === candidate} onChange={() => setTopic(candidate)} />
                {SUPPORT_TOPIC_LABELS[candidate]}
              </label>
            ))}
          </div>

          <div>
            <a
              href={issueFormUrl(topic)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-canvas hover:bg-brand-hover"
            >
              <ExternalLink size={14} /> Open the form on GitHub
            </a>
            <p className="mt-2 text-xs text-muted">
              It opens in a new tab on GitHub. You can also{' '}
              <a href={`${FEEDBACK_REPO_URL}/issues`} target="_blank" rel="noreferrer" className="text-brand hover:underline">
                read what others have posted
              </a>{' '}
              first: your question may already be answered.
            </p>
          </div>
        </div>
      </Panel>

      <Panel icon={ShieldAlert} title="Before you post: it is public">
        <ul className="max-w-3xl list-disc space-y-1.5 pl-5 text-sm text-ink">
          <li>Anyone can read an issue, and search engines may keep it even if you delete it later.</li>
          <li>Leave out passwords, licence keys, private folder or server names, and anything else you would not put on a public page.</li>
          <li>Reports may be reviewed, but a reply or a fix is not guaranteed. WinRelease is a free beta.</li>
        </ul>
      </Panel>

      {needsDetails && (
        <Panel icon={ShieldCheck} title="Copy details to paste into the form (optional)">
          <div className="flex max-w-2xl flex-col gap-3 text-sm">
            <p className="text-muted">
              Always: the site, your browser, and the Helper&apos;s version and whether WiX and .NET were found. Never any of your files. Paste it into the form, and read it
              first: you are posting it publicly.
            </p>

            <label className="flex items-start gap-2">
              <input type="checkbox" className="mt-0.5" checked={includeBuild} onChange={(e) => setIncludeBuild(e.target.checked)} />
              <span>
                <span className="text-ink">The latest build log</span>
                <span className="block text-xs text-muted">
                  {outcome
                    ? `Your last build in this tab ${outcome.ok ? 'succeeded' : 'failed'}${outcome.projectName ? ` (${outcome.projectName})` : ''}. File paths in the log may show your folder names.`
                    : 'No build has been run in this tab yet, so there is nothing to include.'}
                </span>
              </span>
            </label>

            <div className="flex flex-col gap-1">
              <label htmlFor="support-project" className="text-ink">
                A project&apos;s settings
              </label>
              <select
                id="support-project"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="max-w-sm rounded-md border border-subtle bg-panel-alt px-2 py-1.5 text-sm text-ink"
              >
                <option value="">None</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.manifest.name || '(untitled)'}
                  </option>
                ))}
              </select>
              <span className="text-xs text-muted">Names, folders and settings only, no file contents.</span>
            </div>

            <div>
              <Button variant="primary" onClick={() => void copyDetails()}>
                <ClipboardCopy size={14} /> Copy details
              </Button>
              {copied === 'yes' && <span className="ml-2 text-xs text-ok">Copied. Paste it into the form, and read it first.</span>}
              {copied === 'no' && <span className="ml-2 text-xs text-warn">Your browser would not let us copy. Allow clipboard access and try again.</span>}
            </div>
          </div>
        </Panel>
      )}

      <Panel icon={ShieldAlert} title="A security problem?">
        <p className="max-w-3xl text-sm text-muted">
          Please do not post it publicly. Use GitHub&apos;s{' '}
          <a href={SECURITY_REPORT_URL} target="_blank" rel="noreferrer" className="text-brand hover:underline">
            private report form
          </a>
          , which only we can see.
        </p>
      </Panel>
      <WhoMadeThis placement="support" />
    </AppLayout>
  )
}
