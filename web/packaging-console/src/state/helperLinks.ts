import { resetResolvedBackend, resolveBackend } from './backend'

const RELEASES_REPO = 'https://github.com/grantis19-create/winrelease-releases'

/** The Helper release this site build points at. Bump with each Helper release (ADR 0104). */
export const HELPER_LATEST_VERSION = '0.1.16'

/**
 * Whether the released Helper is code-signed, and the publisher name in its certificate (the company's legal name). Flip both in the same commit
 * as the first signed release; every sentence that depends on it is in helperSigning.ts. Keep false and empty until the signed file is published.
 */
export const HELPER_IS_SIGNED = false
export const HELPER_PUBLISHER = ''

/** SHA-256 of that release's WinRelease.Helper.exe, so a user can check what they downloaded. Bump with the version; check-release-alignment.ps1 compares it to the release notes. */
export const HELPER_SHA256 = '3304b8347adffddd8f2b58c0befa4242baeae7d4561f8e229c82f3dbcd250f15'

/** Release date and size shown on the Release notes page. Bump with the version (the alignment check does not compare these two). */
export const HELPER_RELEASE_DATE = '17 November 2026'
export const HELPER_SIZE_LABEL = 'about 47 MB'

/** Every released version, newest first (the repo's Releases page). */
export const HELPER_RELEASES_PAGE = `${RELEASES_REPO}/releases`

/**
 * A direct download of the Helper exe: the file itself, served by GitHub Releases, not a page to hunt around on (ADR 0104). It names the
 * version's tag because /releases/latest/download skips pre-releases; once a signed, non-pre-release build exists this can become the permanent
 * `${RELEASES_REPO}/releases/latest/download/WinRelease.Helper.exe`. Override at build time with VITE_HELPER_DOWNLOAD_URL.
 */
export const HELPER_DOWNLOAD_URL: string =
  import.meta.env.VITE_HELPER_DOWNLOAD_URL || `${RELEASES_REPO}/releases/download/v${HELPER_LATEST_VERSION}/WinRelease.Helper.exe`

/** The link type the Helper registers for the current user the first time it runs (ADR 0102). */
export const HELPER_LINK = 'winrelease-helper:start'

/**
 * Asks Windows to start the Helper through its registered link type (the browser shows an "Open WinRelease Helper?" prompt the first time),
 * then re-checks for it every 2s for up to 20s. False means it never answered: it has not been run once on this PC, or the prompt was declined.
 */
export async function startHelperAndWait(): Promise<boolean> {
  window.location.href = HELPER_LINK
  for (let attempt = 0; attempt < 10; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 2000))
    resetResolvedBackend()
    if ((await resolveBackend()).isHelper) return true
  }
  return false
}
