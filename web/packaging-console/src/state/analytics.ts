/**
 * Visitor counting with Cloudflare Web Analytics (ADR 0116): cookieless, free, counts page views and referrers only.
 * It is off unless the site is built with VITE_CF_BEACON_TOKEN set, so a build without the token loads nothing and the Privacy page says so
 * (analyticsEnabled() drives that wording). Do Not Track and Global Privacy Control are honoured.
 */
const BEACON_SRC = 'https://static.cloudflareinsights.com/beacon.min.js'

/** The Cloudflare site token, set at build time. Empty means analytics is off. */
export const ANALYTICS_TOKEN: string = import.meta.env.VITE_CF_BEACON_TOKEN || ''

/** True when this build counts visitors. The Privacy page wording follows this, so it cannot say one thing while the site does another. */
export function analyticsEnabled(): boolean {
  return ANALYTICS_TOKEN !== ''
}

/** True when the browser asks not to be tracked (Do Not Track or Global Privacy Control). */
export function visitorOptedOut(nav: Navigator = navigator): boolean {
  const anyNav = nav as Navigator & { globalPrivacyControl?: boolean; msDoNotTrack?: string }
  return nav.doNotTrack === '1' || anyNav.msDoNotTrack === '1' || anyNav.globalPrivacyControl === true
}

/** Adds the counting script once, unless this build has no token or the visitor opted out. Returns whether it was added. */
export function startAnalytics(doc: Document = document, nav: Navigator = navigator, token: string = ANALYTICS_TOKEN): boolean {
  if (!token || visitorOptedOut(nav)) return false
  if (doc.querySelector('script[data-cf-beacon]')) return false
  const script = doc.createElement('script')
  script.defer = true
  script.src = BEACON_SRC
  script.setAttribute('data-cf-beacon', JSON.stringify({ token, spa: true }))
  doc.head.appendChild(script)
  return true
}
