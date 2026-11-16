/**
 * Links from WinRelease to GE App Solutions' own site. Each carries a short campaign tag (which page the link was on), so that site's visit counts can
 * say how many people arrived from WinRelease. The tag holds nothing about the visitor or their project. The site sends no Referer header
 * (Referrer-Policy: no-referrer, ADR 0105), so without the tag those visits could not be told apart.
 */
const MAIN_SITE = 'https://geappsolutions.com/'

export function geAppSolutionsUrl(placement: string): string {
  const url = new URL(MAIN_SITE)
  url.searchParams.set('utm_source', 'winrelease')
  url.searchParams.set('utm_medium', 'referral')
  url.searchParams.set('utm_campaign', placement)
  return url.toString()
}
