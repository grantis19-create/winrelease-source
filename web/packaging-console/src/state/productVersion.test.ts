import { describe, expect, it } from 'vitest'
import { isWellFormedProductVersion, productVersionAdvice } from './productVersion'

describe('isWellFormedProductVersion', () => {
  it.each([
    ['1.0.0', true],
    ['255.255.65535', true],
    ['256.0.0', false],
    ['1.256.0', false],
    ['1.0.65536', false],
    ['1.0', false],
    ['1.0.0.0', false],
    ['1.0.-1', false],
    ['1.x.0', false],
    ['', false],
  ])('%s -> %s', (version, expected) => {
    expect(isWellFormedProductVersion(version)).toBe(expected)
  })
})

describe('productVersionAdvice', () => {
  it('is silent for a normal or empty version', () => {
    expect(productVersionAdvice('1.0.0')).toBeNull()
    expect(productVersionAdvice('')).toBeNull()
  })

  it('explains, without forbidding, a non-standard version', () => {
    for (const odd of ['1.0', '1', '1.2.3.4', '300.0.0', '1.0.0-beta']) {
      expect(productVersionAdvice(odd)).toMatch(/still build/)
    }
  })
})
