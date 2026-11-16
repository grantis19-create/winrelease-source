import { describe, expect, it } from 'vitest'
import { fileNameFromContentDisposition } from './client'

describe('fileNameFromContentDisposition', () => {
  it('reads a plain quoted name', () => {
    expect(fileNameFromContentDisposition('attachment; filename="App-1.0.0.msi"')).toBe('App-1.0.0.msi')
  })

  it('keeps a semicolon that is inside the quoted name (the T9 case)', () => {
    const header = `attachment; filename="Names MSI_WiX treat specially_ [ ] { } ; = @ $ ^-1.0.0.msi"; filename*=UTF-8''Names%20MSI_WiX%20treat%20specially_%20%5B%20%5D%20%7B%20%7D%20%3B%20%3D%20%40%20$%20^-1.0.0.msi`

    expect(fileNameFromContentDisposition(header)).toBe('Names MSI_WiX treat specially_ [ ] { } ; = @ $ ^-1.0.0.msi')
  })

  it('prefers the percent-encoded UTF-8 form, which survives non-ASCII names', () => {
    expect(fileNameFromContentDisposition(`attachment; filename="Caf_ App-1.0.0.msi"; filename*=UTF-8''Caf%C3%A9%20App-1.0.0.msi`)).toBe('Café App-1.0.0.msi')
  })

  it('handles escaped quotes and a bare token', () => {
    expect(fileNameFromContentDisposition('attachment; filename="a \\"b\\" c.msi"')).toBe('a "b" c.msi')
    expect(fileNameFromContentDisposition('attachment; filename=plain.msi')).toBe('plain.msi')
  })

  it('returns undefined when there is no name', () => {
    expect(fileNameFromContentDisposition('attachment')).toBeUndefined()
    expect(fileNameFromContentDisposition('')).toBeUndefined()
  })
})
