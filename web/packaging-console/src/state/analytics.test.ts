import { describe, expect, it } from 'vitest'
import { startAnalytics, visitorOptedOut } from './analytics'

const nav = (extra: Record<string, unknown> = {}) => ({ doNotTrack: null, ...extra }) as unknown as Navigator

describe('analytics', () => {
  it('loads nothing without a token', () => {
    document.head.innerHTML = ''
    expect(startAnalytics(document, nav(), '')).toBe(false)
    expect(document.querySelector('script[data-cf-beacon]')).toBeNull()
  })

  it('adds the Cloudflare script once when there is a token', () => {
    document.head.innerHTML = ''
    expect(startAnalytics(document, nav(), 'abc')).toBe(true)
    expect(startAnalytics(document, nav(), 'abc')).toBe(false)
    const script = document.querySelector('script[data-cf-beacon]') as HTMLScriptElement
    expect(script.src).toBe('https://static.cloudflareinsights.com/beacon.min.js')
    expect(JSON.parse(script.getAttribute('data-cf-beacon')!)).toEqual({ token: 'abc', spa: true })
  })

  it('honours Do Not Track and Global Privacy Control', () => {
    document.head.innerHTML = ''
    expect(visitorOptedOut(nav({ doNotTrack: '1' }))).toBe(true)
    expect(visitorOptedOut(nav({ globalPrivacyControl: true }))).toBe(true)
    expect(startAnalytics(document, nav({ doNotTrack: '1' }), 'abc')).toBe(false)
    expect(document.querySelector('script[data-cf-beacon]')).toBeNull()
  })
})
