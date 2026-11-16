import { describe, expect, it } from 'vitest'
import { geAppSolutionsUrl } from './outbound'

describe('geAppSolutionsUrl', () => {
  it('points at the main site and tags where the link was', () => {
    const url = new URL(geAppSolutionsUrl('landing'))
    expect(url.origin).toBe('https://geappsolutions.com')
    expect(url.searchParams.get('utm_source')).toBe('winrelease')
    expect(url.searchParams.get('utm_medium')).toBe('referral')
    expect(url.searchParams.get('utm_campaign')).toBe('landing')
  })

  it('carries nothing but the three tags', () => {
    expect([...new URL(geAppSolutionsUrl('footer')).searchParams.keys()].sort()).toEqual(['utm_campaign', 'utm_medium', 'utm_source'])
  })
})
