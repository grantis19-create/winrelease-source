import { HELPER_LATEST_VERSION } from './helperLinks'

/**
 * The oldest Helper this site still works well with (ADR 0105). Below it, Build is refused with a "please update" message instead of failing in
 * a confusing way. Raise it when the site starts relying on something an older Helper lacks.
 */
export const HELPER_MIN_VERSION = '0.1.8'

/** Compares dotted numeric versions ("0.1.2" vs "0.10.0"); a missing or malformed part counts as 0. Negative: a is older. */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) => v.split(/[.+-]/).slice(0, 3).map((n) => Number.parseInt(n, 10) || 0)
  const [pa, pb] = [parts(a), parts(b)]
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

/** A newer Helper than the one running exists. Unknown version (an older Helper that does not report one) is not "outdated" here - see isTooOld. */
export function isUpdateAvailable(helperVersion: string | undefined): boolean {
  return !!helperVersion && compareVersions(helperVersion, HELPER_LATEST_VERSION) < 0
}

/** The running Helper is older than the minimum this site supports. A Helper that reports no version at all is treated as too old. */
export function isTooOld(helperVersion: string | undefined): boolean {
  return !helperVersion || compareVersions(helperVersion, HELPER_MIN_VERSION) < 0
}
