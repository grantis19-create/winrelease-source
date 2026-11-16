import { describe, expect, it } from 'vitest'
import { createEmptyManifest } from '../types/manifest'
import { builtInProperties } from './builtInProperties'

function valueOf(rows: ReturnType<typeof builtInProperties>, id: string) {
  return rows.find((r) => r.id === id)
}

describe('builtInProperties', () => {
  it('per-machine with the install wizard matches what wix 7 wrote', () => {
    const base = createEmptyManifest()
    const manifest = { ...base, name: 'Probe', manufacturer: 'Acme', displayVersion: '1.2.3', appInfo: { ...base.appInfo, installScope: 'perMachine' as const, installWizard: true, supportUrl: 'https://acme.example', disableRepair: true } }
    const rows = builtInProperties(manifest, { productCode: '{f51756b2-c060-50bd-8926-f5b0190af220}' })

    expect(valueOf(rows, 'ALLUSERS')?.value).toBe('1')
    expect(valueOf(rows, 'ProductLanguage')?.value).toBe('1033')
    expect(valueOf(rows, 'ARPNOMODIFY')?.value).toBe('1')
    expect(valueOf(rows, 'WIXUI_INSTALLDIR')?.value).toBe('INSTALLFOLDER')
    expect(valueOf(rows, 'ARPHELPLINK')?.value).toBe('https://acme.example')
    expect(valueOf(rows, 'ARPNOREPAIR')?.value).toBe('1')
    expect(valueOf(rows, 'ProductCode')?.value).toBe('{F51756B2-C060-50BD-8926-F5B0190AF220}')
    expect(valueOf(rows, 'ProductVersion')?.value).toBe('1.2.3')
  })

  it('per-user without the wizard leaves ALLUSERS out and is language neutral', () => {
    const base = createEmptyManifest()
    const rows = builtInProperties({ ...base, appInfo: { ...base.appInfo, installScope: 'perUser' as const, installWizard: false } })

    expect(valueOf(rows, 'ALLUSERS')?.value).toBeNull()
    expect(valueOf(rows, 'ProductLanguage')?.value).toBe('0')
    expect(valueOf(rows, 'ARPNOMODIFY')).toBeUndefined()
    expect(valueOf(rows, 'WIXUI_INSTALLDIR')).toBeUndefined()
    expect(valueOf(rows, 'ProductCode')?.value).toBeNull()
  })

  it('treats a missing installWizard as on, like the App Info checkbox', () => {
    const base = createEmptyManifest()
    const rows = builtInProperties({ ...base, appInfo: { ...base.appInfo, installWizard: undefined } })
    expect(valueOf(rows, 'WIXUI_INSTALLDIR')).toBeDefined()
  })
})
