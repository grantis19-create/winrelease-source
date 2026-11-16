import { describe, expect, it } from 'vitest'
import { isGuid, newGuid, normalizeGuid, normalizeManifestGuids } from './guid'

describe('guid helpers', () => {
  it('generates uppercase, well-formed, distinct GUIDs', () => {
    const a = newGuid()
    const b = newGuid()

    expect(a).toMatch(/^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/)
    expect(a).not.toBe(b)
  })

  it('normalizes braces, spacing and case', () => {
    expect(normalizeGuid('  {d9d7dafc-d0da-588d-9bc6-ed448b6a8151} ')).toBe('D9D7DAFC-D0DA-588D-9BC6-ED448B6A8151')
  })

  it('validates the canonical 8-4-4-4-12 form only', () => {
    expect(isGuid('d9d7dafc-d0da-588d-9bc6-ed448b6a8151')).toBe(true)
    expect(isGuid('{D9D7DAFC-D0DA-588D-9BC6-ED448B6A8151}')).toBe(true)
    expect(isGuid('D9D7DAFC-D0DA-588D-9BC6')).toBe(false)
    expect(isGuid('not a guid')).toBe(false)
    expect(isGuid('')).toBe(false)
  })

  it('uppercases an older manifest’s stored GUIDs and leaves non-GUIDs alone', () => {
    const m = normalizeManifestGuids({ upgradeCode: 'd9d7dafc-d0da-588d-9bc6-ed448b6a8151', productCode: '{e0a2cda3-ed54-56a1-aac5-206cf8cfdd7c}' })

    expect(m.upgradeCode).toBe('D9D7DAFC-D0DA-588D-9BC6-ED448B6A8151')
    expect(m.productCode).toBe('E0A2CDA3-ED54-56A1-AAC5-206CF8CFDD7C')
    expect(normalizeManifestGuids({ upgradeCode: 'oops', productCode: null })).toEqual({ upgradeCode: 'oops', productCode: null })
  })
})
