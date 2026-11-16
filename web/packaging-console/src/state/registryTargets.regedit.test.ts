import { describe, expect, it } from 'vitest'
import { REGISTRY_ROOTS, computerPath } from './registryTargets'

describe('regedit alignment', () => {
  it('lists the hives in regedit order', () => {
    expect(REGISTRY_ROOTS.map((r) => r.label)).toEqual(['HKEY_CLASSES_ROOT', 'HKEY_CURRENT_USER', 'HKEY_LOCAL_MACHINE', 'HKEY_USERS'])
  })

  it('writes the path as regedit\'s address bar does', () => {
    expect(computerPath({ root: 'hklm', keyPrefix: '' })).toBe('Computer\\HKEY_LOCAL_MACHINE')
    expect(computerPath({ root: 'hklm', keyPrefix: 'SOFTWARE\\Vendor' })).toBe('Computer\\HKEY_LOCAL_MACHINE\\SOFTWARE\\Vendor')
  })
})
