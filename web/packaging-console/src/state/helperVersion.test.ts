import { describe, expect, it } from 'vitest'
import { compareVersions, HELPER_MIN_VERSION, isTooOld, isUpdateAvailable } from './helperVersion'
import { HELPER_LATEST_VERSION } from './helperLinks'

describe('compareVersions', () => {
  it('compares numerically, not as text', () => {
    expect(compareVersions('0.1.2', '0.1.10')).toBeLessThan(0)
    expect(compareVersions('0.10.0', '0.9.9')).toBeGreaterThan(0)
    expect(compareVersions('1.0.0+abc', '1.0.0')).toBe(0)
  })
})

describe('update checks', () => {
  it('flags an older Helper as updatable, not the current one', () => {
    expect(isUpdateAvailable('0.0.1')).toBe(true)
    expect(isUpdateAvailable(HELPER_LATEST_VERSION)).toBe(false)
    expect(isUpdateAvailable(undefined)).toBe(false)
  })

  it('refuses a Helper below the minimum, or one that reports no version', () => {
    expect(isTooOld('0.0.9')).toBe(true)
    expect(isTooOld(HELPER_MIN_VERSION)).toBe(false)
    expect(isTooOld(undefined)).toBe(true)
  })
})
