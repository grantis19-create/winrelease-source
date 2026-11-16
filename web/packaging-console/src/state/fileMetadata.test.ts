import { describe, expect, it } from 'vitest'
import { executableShortcutDefaults, friendlyNameFromFileName, productVersionFromFileVersion } from './fileMetadata'
import type { DeclaredFile } from '../types/manifest'

function declaredFile(overrides: Partial<DeclaredFile> = {}): DeclaredFile {
  return { id: 'f1', sourcePath: 'MyApp-Setup.exe', installPath: 'MyApp-Setup.exe', root: 'installFolder', ...overrides }
}

describe('friendlyNameFromFileName', () => {
  it('title-cases a simple lowercase filename', () => {
    expect(friendlyNameFromFileName('notepad.exe')).toBe('Notepad')
  })

  it('splits on hyphens and underscores into separate words', () => {
    expect(friendlyNameFromFileName('my-app_setup.exe')).toBe('My App Setup')
  })

  it('leaves an already-mixed-case word alone instead of lowercasing it', () => {
    expect(friendlyNameFromFileName('MyApp.exe')).toBe('MyApp')
  })

  it('preserves an all-caps acronym', () => {
    expect(friendlyNameFromFileName('NASA-Viewer.exe')).toBe('NASA Viewer')
  })

  it('strips the extension regardless of case', () => {
    expect(friendlyNameFromFileName('Installer.EXE')).toBe('Installer')
  })

  it('collapses extra whitespace/underscore runs between words', () => {
    expect(friendlyNameFromFileName('foo__bar   baz.exe')).toBe('Foo Bar Baz')
  })
})

describe('executableShortcutDefaults', () => {
  it('suggests a friendly name and the file itself as the icon for a .exe', () => {
    expect(executableShortcutDefaults(declaredFile())).toEqual({ name: 'MyApp Setup', iconPath: 'MyApp-Setup.exe' })
  })

  it('derives the name from the install path filename, not a longer source path', () => {
    const file = declaredFile({ sourcePath: 'build/output/my-app.exe', installPath: 'bin/my-app.exe' })
    expect(executableShortcutDefaults(file)).toEqual({ name: 'My App', iconPath: 'build/output/my-app.exe' })
  })

  it('returns no suggestions for a non-executable file', () => {
    expect(executableShortcutDefaults(declaredFile({ sourcePath: 'readme.txt', installPath: 'readme.txt' }))).toEqual({})
  })

  it('matches .exe case-insensitively', () => {
    expect(executableShortcutDefaults(declaredFile({ sourcePath: 'Tool.EXE', installPath: 'Tool.EXE' })).iconPath).toBe('Tool.EXE')
  })
})

describe('productVersionFromFileVersion', () => {
  it('drops the 4th (revision) segment a real Win32 FileVersion has but MSI Product Version does not support', () => {
    expect(productVersionFromFileVersion('2.5.100.7')).toBe('2.5.100')
  })

  it('returns null when the truncated version is still not well-formed (major over 255)', () => {
    expect(productVersionFromFileVersion('300.5.100.7')).toBeNull()
  })

  it('returns null when build exceeds the 65535 MSI limit', () => {
    expect(productVersionFromFileVersion('1.0.70000.0')).toBeNull()
  })
})
