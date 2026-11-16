import { describe, expect, it } from 'vitest'
import { createEmptyManifest } from '../types/manifest'
import { entriesAtTarget, entryCountUnderTarget, wowRegistryKind, subkeysUnderTarget } from './registryTargets'

function manifestWithRegistry(entries: { key: string; name: string; root?: 'hklm' | 'hkcu' }[]) {
  return {
    ...createEmptyManifest(),
    registry: entries.map((e) => ({ root: e.root ?? ('hklm' as const), key: e.key, name: e.name, value: '1', valueType: 'string' as const })),
  }
}

describe('subkeysUnderTarget', () => {
  it('lists immediate child key segments at the hive root', () => {
    const manifest = manifestWithRegistry([
      { key: 'Software\\Vendor\\App', name: 'A' },
      { key: 'Software\\Vendor', name: 'B' },
    ])

    expect(subkeysUnderTarget(manifest, { root: 'hklm', keyPrefix: '' })).toEqual(['Software'])
    expect(subkeysUnderTarget(manifest, { root: 'hklm', keyPrefix: 'Software' })).toEqual(['Vendor'])
    expect(subkeysUnderTarget(manifest, { root: 'hklm', keyPrefix: 'Software\\Vendor' })).toEqual(['App'])
  })

  it('is scoped to the given hive', () => {
    const manifest = manifestWithRegistry([
      { key: 'Software\\App', name: 'A', root: 'hklm' },
      { key: 'Software\\App', name: 'B', root: 'hkcu' },
    ])

    expect(subkeysUnderTarget(manifest, { root: 'hkcu', keyPrefix: '' })).toEqual(['Software'])
  })
})

describe('entriesAtTarget', () => {
  it('shows every entry in the hive when the hive root itself is selected', () => {
    const manifest = manifestWithRegistry([
      { key: 'Software\\App', name: 'A' },
      { key: 'Software\\App\\Sub', name: 'B' },
    ])

    expect(entriesAtTarget(manifest, { root: 'hklm', keyPrefix: '' }).map((x) => x.entry.name)).toEqual(['A', 'B'])
  })

  it('shows only exact-key matches once a specific key is selected', () => {
    const manifest = manifestWithRegistry([
      { key: 'Software\\App', name: 'A' },
      { key: 'Software\\App\\Sub', name: 'B' },
    ])

    expect(entriesAtTarget(manifest, { root: 'hklm', keyPrefix: 'Software\\App' }).map((x) => x.entry.name)).toEqual(['A'])
  })
})

describe('wowRegistryKind', () => {
  const B = String.fromCharCode(92)
  const k = (...parts: string[]) => parts.join(B)

  it('is redirected only at the places Windows redirects (mirrors WinRelease.Core Wow6432Redirect)', () => {
    expect(wowRegistryKind('hklm', k('SOFTWARE', 'WOW6432Node', 'Vendor'))).toBe('redirected')
    expect(wowRegistryKind('hklm', k('software', 'wow6432node', 'Vendor', 'App'))).toBe('redirected')
    expect(wowRegistryKind('hklm', k('SOFTWARE', 'Classes', 'WOW6432Node', 'CLSID', '{X}'))).toBe('redirected')
    expect(wowRegistryKind('hkcu', k('SOFTWARE', 'Classes', 'WOW6432Node', 'Interface', '{X}'))).toBe('redirected')
    expect(wowRegistryKind('hkcr', k('WOW6432Node', 'CLSID', '{X}'))).toBe('redirected')
  })

  it('is literal for a WOW6432Node that Windows does not redirect through', () => {
    expect(wowRegistryKind('hklm', k('SOFTWARE', 'WOW6432Node'))).toBe('literal')
    expect(wowRegistryKind('hklm', k('SOFTWARE', 'Vendor', 'WOW6432Node', 'X'))).toBe('literal')
    expect(wowRegistryKind('hkcu', k('SOFTWARE', 'WOW6432Node', 'X'))).toBe('literal')
    expect(wowRegistryKind('hklm', k('SOFTWARE', 'Classes', 'WOW6432Node', 'MyApp.Doc'))).toBe('literal')
    expect(wowRegistryKind('hkcr', k('WOW6432Node', 'MyApp.Doc'))).toBe('literal')
    expect(wowRegistryKind('hklm', k('SYSTEM', 'WOW6432Node', 'X'))).toBe('literal')
  })

  it('is null when there is no WOW6432Node segment', () => {
    expect(wowRegistryKind('hklm', k('SOFTWARE', 'Vendor', 'NotWOW6432NodeHere'))).toBeNull()
  })
})

describe('registry keys ignore case', () => {
  it('shows SOFTWARE and Software as one key holding both entries', () => {
    const manifest = {
      ...createEmptyManifest(),
      registry: [
        { root: 'hklm' as const, key: 'SOFTWARE|A', name: 'x', value: '1', valueType: 'string' as const },
        { root: 'hklm' as const, key: 'Software|B', name: 'y', value: '2', valueType: 'string' as const },
      ].map((e) => ({ ...e, key: e.key.replace('|', String.fromCharCode(92)) })),
    }
    expect(subkeysUnderTarget(manifest, { root: 'hklm', keyPrefix: '' })).toEqual(['SOFTWARE'])
    expect(subkeysUnderTarget(manifest, { root: 'hklm', keyPrefix: 'Software' })).toEqual(['A', 'B'])
    expect(entryCountUnderTarget(manifest, { root: 'hklm', keyPrefix: 'software' })).toBe(2)
  })
})
