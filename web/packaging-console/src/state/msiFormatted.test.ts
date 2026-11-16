import { describe, expect, it } from 'vitest'
import { createEmptyManifest } from '../types/manifest'
import { unknownPropertyReferences } from './msiFormatted'

describe('unknownPropertyReferences', () => {
  it('flags only bracketed names nothing in the package sets', () => {
    const manifest = createEmptyManifest()
    expect(unknownPropertyReferences('Installed Components\\[PackageName] [ProductName] msiexec /fup [ProductCode]', manifest)).toEqual([
      'PackageName',
    ])
  })

  it("accepts the package's own properties and skips Windows Installer's special forms", () => {
    const manifest = { ...createEmptyManifest(), properties: [{ id: 'PACKAGENAME', value: 'x' }] }
    expect(unknownPropertyReferences('[PACKAGENAME] [#App.exe] [!f] [$c] [%PATH] [\[] [~] [1] [INSTALLFOLDER]bin', manifest)).toEqual([])
  })
})
