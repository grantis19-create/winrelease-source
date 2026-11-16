import { describe, expect, it } from 'vitest'
import { withManifestDefaults } from './manifest'

describe('withManifestDefaults', () => {
  it('fills in everything the editor reads from a minimal hand-written manifest', () => {
    const m = withManifestDefaults({ upgradeCode: 'x', name: 'App', manufacturer: 'M', files: { declared: [{ id: 'A', sourcePath: 'a.exe', installPath: 'a.exe' }] } } as never)

    expect(m.files.harvest).toEqual([])
    expect(m.files.declared[0].root).toBe('installFolder')
    expect(m.shortcuts).toEqual([])
    expect(m.registry).toEqual([])
    expect(m.environmentVariables).toEqual([])
    expect(m.properties).toEqual([])
    expect(m.appInfo.installScope).toBe('perMachine')
    expect(m.architecture).toBe('x64')
    expect(m.targetDirectory).toBe('[ProgramFiles64Folder]')
  })

  it('survives a manifest with no files section at all', () => {
    const m = withManifestDefaults({ name: 'App' } as never)

    expect(m.files).toEqual({ declared: [], harvest: [] })
  })

  it('keeps what was supplied and leaves fields it has no editor for untouched', () => {
    const m = withManifestDefaults({
      name: 'App',
      architecture: 'arm64',
      appInfo: { installScope: 'perUser', supportUrl: 'https://x' },
      comClasses: [{ classId: 'g', fileId: 'F' }],
      registry: [{ root: 'hklm', key: 'K' }],
      environmentVariables: [{ name: 'P', system: true }],
    } as never) as ReturnType<typeof withManifestDefaults> & { comClasses?: unknown[] }

    expect(m.architecture).toBe('arm64')
    expect(m.appInfo.installScope).toBe('perUser')
    expect(m.appInfo.supportUrl).toBe('https://x')
    expect(m.appInfo.disableRepair).toBe(false)
    expect(m.comClasses).toEqual([{ classId: 'g', fileId: 'F' }])
    expect(m.registry[0]).toMatchObject({ name: '', value: '', valueType: 'string' })
    expect(m.environmentVariables![0]).toMatchObject({ action: 'set', part: 'all', separator: ';', system: true })
  })
})
