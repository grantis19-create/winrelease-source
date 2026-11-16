import { describe, expect, it } from 'vitest'
import { disclaimerSigningLine, landingNote, releaseLabel, signingNow, smartScreenAdvice, smartScreenWhy, unsignedLimitation } from './helperSigning'

const unsigned = { signed: false, publisher: '' }
const signed = { signed: true, publisher: 'Example Ltd' }

describe('helperSigning', () => {
  it('says unsigned today (the signed switch is off)', () => {
    expect(signingNow.signed).toBe(false)
  })

  it('warns about SmartScreen and unknown publishers while unsigned', () => {
    expect(smartScreenAdvice(unsigned)).toContain('not code-signed yet')
    expect(smartScreenWhy(unsigned)).toContain('not code-signed yet')
    expect(disclaimerSigningLine(unsigned)).toContain('not code-signed yet')
    expect(unsignedLimitation(unsigned)).toContain('unsigned pre-release')
    expect(releaseLabel(unsigned)).toBe('pre-release, unsigned')
    expect(landingNote(unsigned)).toContain('unsigned pre-release')
  })

  it('names the publisher once signed, and drops the unsigned limitation', () => {
    expect(smartScreenAdvice(signed)).toContain('Example Ltd')
    expect(smartScreenAdvice(signed)).not.toContain('not code-signed')
    expect(smartScreenWhy(signed)).toContain('Example Ltd')
    expect(disclaimerSigningLine(signed)).toContain('signed by Example Ltd')
    expect(unsignedLimitation(signed)).toBeNull()
    expect(releaseLabel(signed)).toBe('signed by Example Ltd')
    expect(landingNote(signed)).toContain('signed by Example Ltd')
  })
})
