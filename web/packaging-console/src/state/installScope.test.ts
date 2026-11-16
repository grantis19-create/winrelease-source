import { describe, expect, it } from 'vitest'
import { createEmptyManifest } from '../types/manifest'
import { defaultTargetDirectory, scopeWarnings, withInstallScope, withNameOrManufacturerChange } from './installTargets'

const base = () => {
  const m = createEmptyManifest()
  return { ...m, name: 'Reader', manufacturer: 'Acme', targetDirectory: defaultTargetDirectory('Acme', 'Reader') }
}

describe('per-user install scope (ADR 0051)', () => {
  it('moves an auto-derived install directory to LocalAppData\\Programs and back', () => {
    const perUser = withInstallScope(base(), 'perUser')

    expect(perUser.appInfo.installScope).toBe('perUser')
    expect(perUser.targetDirectory).toBe('[LocalAppDataFolder]Programs\\Acme\\Reader')

    const back = withInstallScope(perUser, 'perMachine')
    expect(back.appInfo.installScope).toBe('perMachine')
    expect(back.targetDirectory).toBe('[ProgramFiles64Folder]Acme\\Reader')
  })

  it('goes back to the 32-bit Program Files for an x86 build', () => {
    const x86 = { ...withInstallScope(base(), 'perUser'), architecture: 'x86' as const }

    expect(withInstallScope(x86, 'perMachine').targetDirectory).toBe('[ProgramFilesFolder]Acme\\Reader')
  })

  it('leaves a path the user chose alone', () => {
    const custom = { ...base(), targetDirectory: '[ProgramFiles64Folder]My\\Own\\Place' }

    const result = withInstallScope(custom, 'perUser')

    expect(result.appInfo.installScope).toBe('perUser')
    expect(result.targetDirectory).toBe('[ProgramFiles64Folder]My\\Own\\Place')
  })

  it('keeps following Name/Manufacturer under the per-user root', () => {
    const perUser = withInstallScope(base(), 'perUser')

    expect(withNameOrManufacturerChange(perUser, { name: 'Viewer' }).targetDirectory).toBe('[LocalAppDataFolder]Programs\\Acme\\Viewer')
  })

  it('has no warnings for per-machine, or for a clean per-user project', () => {
    expect(scopeWarnings({ ...base(), registry: [{ root: 'hklm', key: 'K', name: 'n', value: 'v', valueType: 'string' }] })).toEqual([])
    expect(scopeWarnings(withInstallScope(base(), 'perUser'))).toEqual([])
  })

  it('warns about admin-only directory, HKLM entries and admin-only file roots in a per-user project', () => {
    const m = withInstallScope(base(), 'perUser')
    const risky = {
      ...m,
      targetDirectory: '[ProgramFiles64Folder]Acme\\Reader',
      registry: [{ root: 'hklm' as const, key: 'K', name: 'n', value: 'v', valueType: 'string' as const }],
      files: { declared: [{ id: 'a', sourcePath: 'a.dll', installPath: 'a.dll', root: 'commonAppDataFolder' as const }], harvest: [] },
    }

    const warnings = scopeWarnings(risky)

    expect(warnings).toHaveLength(3)
    expect(warnings.join(' ')).toMatch(/administrator/)
    expect(warnings.join(' ')).toMatch(/HKEY_LOCAL_MACHINE/)
  })
})

describe('a bare install directory follows the scope (ADR 0095)', () => {
  it('moves between Program Files and LocalAppData and stays bare', () => {
    const bare = { ...createEmptyManifest(), name: 'Reader', manufacturer: 'Acme', targetDirectory: '[ProgramFiles64Folder]' }

    const perUser = withInstallScope(bare, 'perUser')
    expect(perUser.targetDirectory).toBe('[LocalAppDataFolder]Programs')
    expect(withInstallScope(perUser, 'perMachine').targetDirectory).toBe('[ProgramFiles64Folder]')
  })
})
