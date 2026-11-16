import { beforeEach, describe, expect, it } from 'vitest'
import {
  FEEDBACK_REPO_URL,
  SECURITY_REPORT_URL,
  SOURCE_REPO_URL,
  SUPPORT_TOPIC_LABELS,
  SUPPORT_TOPIC_TEMPLATES,
  buildSupportDetails,
  issueFormUrl,
  lastBuildOutcome,
  recordBuildOutcome,
  topicNeedsDetails,
} from './supportReport'
import type { WinReleaseManifest } from '../types/manifest'

const base = { includeBuild: true, project: null }

describe('support details', () => {
  beforeEach(() => sessionStorage.clear())

  it('lists the site, the browser and the Helper, and carries no email address', () => {
    const text = buildSupportDetails(base, new Date('2026-10-28T12:00:00Z'))
    expect(text).toContain('Created: 2026-10-28T12:00:00.000Z')
    expect(text).toContain('== This computer and browser ==')
    expect(text).toContain('== Helper ==')
    expect(text).not.toMatch(/@/)
  })

  it('includes the latest build log only when asked', () => {
    recordBuildOutcome({ job: 'msi', ok: false, projectName: 'Acme', error: '500 failed', standardError: 'WIX0103 file not found' })
    expect(buildSupportDetails(base)).toContain('WIX0103 file not found')
    expect(buildSupportDetails({ ...base, includeBuild: false })).not.toContain('WIX0103')
    expect(lastBuildOutcome()?.projectName).toBe('Acme')
  })

  it('says so when no build has run', () => {
    expect(buildSupportDetails(base)).toContain('No build has been run in this browser tab.')
  })

  it('includes project settings only when a project is chosen', () => {
    const manifest = { name: 'Acme', manufacturer: 'Acme Inc' } as unknown as WinReleaseManifest
    expect(buildSupportDetails(base)).not.toContain('Project settings')
    const withProject = buildSupportDetails({ ...base, project: { name: 'Acme', manifest } })
    expect(withProject).toContain('== Project settings: Acme ==')
    expect(withProject).toContain('none of your files are included')
  })
})

describe('issue forms', () => {
  it('opens the matching form in the public feedback repository for every topic', () => {
    for (const topic of Object.keys(SUPPORT_TOPIC_LABELS) as (keyof typeof SUPPORT_TOPIC_LABELS)[]) {
      expect(issueFormUrl(topic)).toBe(`${FEEDBACK_REPO_URL}/issues/new?template=${SUPPORT_TOPIC_TEMPLATES[topic]}`)
    }
  })

  it('asks for technical details on problems and questions only', () => {
    expect(topicNeedsDetails('problem')).toBe(true)
    expect(topicNeedsDetails('question')).toBe(true)
    expect(topicNeedsDetails('idea')).toBe(false)
    expect(topicNeedsDetails('praise')).toBe(false)
  })

  it('reports security problems privately, through the source repository', () => {
    expect(SECURITY_REPORT_URL).toBe(`${SOURCE_REPO_URL}/security/advisories/new`)
  })
})
