import { getBackendStatus } from './backend'
import { HELPER_LATEST_VERSION } from './helperLinks'
import type { WinReleaseManifest } from '../types/manifest'

/**
 * Where feedback goes: a public GitHub issue tracker, with no email inbox behind the site (ADR 0117). Issues there are public, so the Support page
 * warns before anything is posted. Change the repository here only; the Support and Privacy pages read these constants.
 */
export const FEEDBACK_REPO_URL = 'https://github.com/grantis19-create/winrelease-feedback'
/** The published source, for inspection (ADR 0117). Security problems are reported privately through this repository's security tab. */
export const SOURCE_REPO_URL = 'https://github.com/grantis19-create/winrelease-source'
export const SECURITY_REPORT_URL = `${SOURCE_REPO_URL}/security/advisories/new`

const OUTCOME_KEY = 'winrelease:last-build-outcome'

export interface BuildOutcome {
  at: string
  job: 'msi' | 'intune'
  ok: boolean
  projectName?: string
  error?: string
  standardOutput?: string
  standardError?: string
}

/** Remembers the latest build (success or failure) for this browser tab, so the Support page can offer it as details without the user copying anything. */
export function recordBuildOutcome(outcome: Omit<BuildOutcome, 'at'>): void {
  try {
    sessionStorage.setItem(OUTCOME_KEY, JSON.stringify({ ...outcome, at: new Date().toISOString() }))
  } catch {
    // Best-effort: with storage blocked the Support page simply has no build to offer.
  }
}

export function lastBuildOutcome(): BuildOutcome | null {
  try {
    const raw = sessionStorage.getItem(OUTCOME_KEY)
    return raw ? (JSON.parse(raw) as BuildOutcome) : null
  } catch {
    return null
  }
}

export type SupportTopic = 'problem' | 'question' | 'idea' | 'praise'

export const SUPPORT_TOPIC_LABELS: Record<SupportTopic, string> = {
  problem: 'Something went wrong',
  question: 'I have a question',
  idea: 'I have an idea',
  praise: 'I like something',
}

/** The issue form in the feedback repository for each topic (.github/ISSUE_TEMPLATE there). */
export const SUPPORT_TOPIC_TEMPLATES: Record<SupportTopic, string> = {
  problem: 'bug.yml',
  question: 'question.yml',
  idea: 'idea.yml',
  praise: 'praise.yml',
}

/** Praise and ideas need no technical details; a problem or a question about a build does. */
export function topicNeedsDetails(topic: SupportTopic): boolean {
  return topic === 'problem' || topic === 'question'
}

/** The link that opens the right blank issue form on GitHub. */
export function issueFormUrl(topic: SupportTopic): string {
  return `${FEEDBACK_REPO_URL}/issues/new?template=${SUPPORT_TOPIC_TEMPLATES[topic]}`
}

export interface SupportDetailsOptions {
  includeBuild: boolean
  /** The chosen project's settings (never its files), or null to leave projects out. */
  project: { name: string; manifest: WinReleaseManifest } | null
}

/**
 * The plain text a person can copy into an issue. Readable on purpose: they see exactly what is in it before posting it publicly. It carries
 * versions and the latest build log, and a project's settings only when they tick that. Never the contents of any file.
 */
export function buildSupportDetails(options: SupportDetailsOptions, now: Date = new Date()): string {
  const status = getBackendStatus()
  const outcome = options.includeBuild ? lastBuildOutcome() : null
  const lines: string[] = []

  lines.push('WinRelease details', `Created: ${now.toISOString()}`, '')

  lines.push('== This computer and browser ==')
  lines.push(`Site: ${typeof location !== 'undefined' ? location.origin : 'unknown'}`)
  lines.push(`Browser: ${typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'}`)
  lines.push(`Window: ${typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : 'unknown'}`, '')

  lines.push('== Helper ==')
  if (status?.isHelper) {
    lines.push(`Running: yes, v${status.helperVersion ?? 'unknown'} (latest is v${HELPER_LATEST_VERSION})`)
    lines.push(`WiX compiler: ${status.wixAvailable === undefined ? 'unknown' : status.wixAvailable ? 'found' : 'NOT FOUND'}`)
    lines.push(`.NET SDK: ${status.dotnetSdkVersion === undefined ? 'unknown' : (status.dotnetSdkVersion ?? 'NOT FOUND')}`)
  } else {
    lines.push(`Running: ${status === null ? 'not checked yet' : 'no'} (latest is v${HELPER_LATEST_VERSION})`)
  }
  lines.push('')

  if (options.includeBuild) {
    lines.push('== Latest build ==')
    if (outcome) {
      lines.push(`When: ${outcome.at}`, `Kind: ${outcome.job}`, `Result: ${outcome.ok ? 'succeeded' : 'FAILED'}`)
      if (outcome.projectName) lines.push(`Project: ${outcome.projectName}`)
      if (outcome.error) lines.push(`Message: ${outcome.error}`)
      if (outcome.standardOutput) lines.push('', '-- output --', outcome.standardOutput.trim())
      if (outcome.standardError) lines.push('', '-- errors --', outcome.standardError.trim())
    } else {
      lines.push('No build has been run in this browser tab.')
    }
    lines.push('')
  }

  if (options.project) {
    lines.push(`== Project settings: ${options.project.name} ==`, '(settings only - none of your files are included)', JSON.stringify(options.project.manifest, null, 2), '')
  }

  return lines.join('\n')
}
