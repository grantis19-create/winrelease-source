import { describe, expect, it } from 'vitest'
import { createEmptyManifest } from '../types/manifest'
import {
  bitnessBadge,
  declaredFilesAtTarget,
  deleteFolder,
  fileNameOf,
  folderNameError,
  defaultTargetDirectory,
  suggestedTargetDirectory,
  harvestViewAt,
  subfoldersWithHarvest,
  itemCountDirectlyAt,
  itemCountUnderTargetWithHarvest,
  formatTargetDirectory,
  withNameOrManufacturerChange,
  harvestFoldersAtTarget,
  isValidFolderName,
  itemCountUnderTarget,
  joinInstallPath,
  normalizeTargetDirectoryToken,
  parseTargetDirectory,
  renameFolder,
  resolvedPathPreview,
  setArchitecture,
  subfoldersUnderTarget,
  visibleInstallRoots,
  workingDirectorySentinel,
  workingDirectorySentinelForInstallPath,
} from './installTargets'

function manifestWith(
  declared: { id: string; installPath: string; root?: 'installFolder' | 'commonFilesFolder' }[],
  harvest: { sourceFolder: string; installPath: string; root?: 'installFolder' | 'commonFilesFolder' }[] = [],
) {
  return {
    ...createEmptyManifest(),
    files: {
      declared: declared.map((f) => ({ id: f.id, sourcePath: f.id, installPath: f.installPath, root: f.root ?? ('installFolder' as const) })),
      harvest: harvest.map((f) => ({ sourceFolder: f.sourceFolder, installPath: f.installPath, root: f.root ?? ('installFolder' as const) })),
    },
  }
}

describe('subfoldersUnderTarget', () => {
  it('lists immediate child folders at the root', () => {
    const manifest = manifestWith([
      { id: 'A', installPath: 'app.exe' },
      { id: 'B', installPath: 'bin/lib.dll' },
      { id: 'C', installPath: 'bin/native/lib.dll' },
    ])

    expect(subfoldersUnderTarget(manifest, { root: 'installFolder', prefix: '' })).toEqual(['bin'])
    expect(subfoldersUnderTarget(manifest, { root: 'installFolder', prefix: 'bin' })).toEqual(['native'])
  })

  it('is scoped to the given root', () => {
    const manifest = manifestWith([
      { id: 'A', installPath: 'shared/config.ini', root: 'commonFilesFolder' },
      { id: 'B', installPath: 'shared/other.ini', root: 'installFolder' },
    ])

    expect(subfoldersUnderTarget(manifest, { root: 'commonFilesFolder', prefix: '' })).toEqual(['shared'])
    expect(subfoldersUnderTarget(manifest, { root: 'installFolder', prefix: '' })).toEqual(['shared'])
  })
})

describe('declaredFilesAtTarget / harvestFoldersAtTarget', () => {
  it('only returns entries directly under the target, not deeper descendants', () => {
    const manifest = manifestWith(
      [
        { id: 'Root', installPath: 'app.exe' },
        { id: 'Nested', installPath: 'bin/lib.dll' },
      ],
      [{ sourceFolder: 'locales', installPath: 'bin/locales' }],
    )

    expect(declaredFilesAtTarget(manifest, { root: 'installFolder', prefix: '' }).map((x) => x.file.id)).toEqual(['Root'])
    expect(declaredFilesAtTarget(manifest, { root: 'installFolder', prefix: 'bin' }).map((x) => x.file.id)).toEqual(['Nested'])
    expect(harvestFoldersAtTarget(manifest, { root: 'installFolder', prefix: 'bin' }).map((x) => x.folder.sourceFolder)).toEqual(['locales'])
  })
})

describe('isValidFolderName', () => {
  it('rejects empty/whitespace-only names and path separators', () => {
    expect(isValidFolderName('bin')).toBe(true)
    expect(isValidFolderName('  bin  ')).toBe(true)
    expect(isValidFolderName('')).toBe(false)
    expect(isValidFolderName('   ')).toBe(false)
    expect(isValidFolderName('bin/native')).toBe(false)
    expect(isValidFolderName('bin\\native')).toBe(false)
  })
})

describe('folderNameError', () => {
  it('accepts an ordinary folder name, trimming before validating', () => {
    expect(folderNameError('Acme')).toBeNull()
    expect(folderNameError('  bin  ')).toBeNull()
  })

  it('rejects an empty/whitespace-only name', () => {
    expect(folderNameError('')).not.toBeNull()
    expect(folderNameError('   ')).not.toBeNull()
  })

  it('rejects a name containing a path separator - this app\'s own installPath model joins on those', () => {
    expect(folderNameError('bin/native')).not.toBeNull()
    expect(folderNameError('bin\\native')).not.toBeNull()
  })
})

describe('renameFolder', () => {
  it('rewrites declared file and harvest folder installPaths at or under the renamed prefix', () => {
    const manifest = manifestWith(
      [
        { id: 'App', installPath: 'bin/app.exe' },
        { id: 'Native', installPath: 'bin/native/lib.dll' },
        { id: 'Root', installPath: 'readme.txt' },
        { id: 'Other', installPath: 'bin/app.exe', root: 'commonFilesFolder' },
      ],
      [{ sourceFolder: 'locales-src', installPath: 'bin/locales' }],
    )

    const renamed = renameFolder(manifest, 'installFolder', 'bin', 'lib')

    expect(renamed.files.declared.map((f) => f.installPath)).toEqual(['lib/app.exe', 'lib/native/lib.dll', 'readme.txt', 'bin/app.exe'])
    expect(renamed.files.harvest.map((f) => f.installPath)).toEqual(['lib/locales'])
  })

  it('rewrites a Shortcut wr:dir: sentinel pointing into the renamed folder, leaving literal Directory Ids alone', () => {
    const manifest = {
      ...manifestWith([{ id: 'App', installPath: 'bin/app.exe' }]),
      shortcuts: [
        { name: 'App', targetFileId: 'App', location: 'desktopFolder' as const, workingDirectory: 'wr:dir:installFolder:bin' },
        { name: 'Other', targetFileId: 'App', location: 'desktopFolder' as const, workingDirectory: 'wr:dir:installFolder:bin/deep' },
        { name: 'Literal', targetFileId: 'App', location: 'desktopFolder' as const, workingDirectory: 'SomeHandTypedDirectoryId' },
      ],
    }

    const renamed = renameFolder(manifest, 'installFolder', 'bin', 'lib')

    expect(renamed.shortcuts.map((s) => s.workingDirectory)).toEqual(['wr:dir:installFolder:lib', 'wr:dir:installFolder:lib/deep', 'SomeHandTypedDirectoryId'])
  })

  it('only touches the given root', () => {
    const manifest = manifestWith([
      { id: 'A', installPath: 'bin/app.exe', root: 'installFolder' },
      { id: 'B', installPath: 'bin/app.exe', root: 'commonFilesFolder' },
    ])

    const renamed = renameFolder(manifest, 'installFolder', 'bin', 'lib')

    expect(renamed.files.declared.find((f) => f.id === 'A')!.installPath).toBe('lib/app.exe')
    expect(renamed.files.declared.find((f) => f.id === 'B')!.installPath).toBe('bin/app.exe')
  })

  it('is a no-op when old and new prefixes match', () => {
    const manifest = manifestWith([{ id: 'App', installPath: 'bin/app.exe' }])
    expect(renameFolder(manifest, 'installFolder', 'bin', 'bin')).toBe(manifest)
  })
})

describe('deleteFolder', () => {
  it('removes every declared file and harvest folder at or under the prefix, leaving siblings untouched', () => {
    const manifest = manifestWith(
      [
        { id: 'App', installPath: 'bin/app.exe' },
        { id: 'Native', installPath: 'bin/native/lib.dll' },
        { id: 'Root', installPath: 'readme.txt' },
        { id: 'Other', installPath: 'bin/app.exe', root: 'commonFilesFolder' },
      ],
      [{ sourceFolder: 'locales-src', installPath: 'bin/locales' }],
    )

    const result = deleteFolder(manifest, 'installFolder', 'bin')

    expect(result.files.declared.map((f) => f.id)).toEqual(['Root', 'Other'])
    expect(result.files.harvest).toEqual([])
  })

  it('clears a Shortcut wr:dir: sentinel pointing into the deleted folder, leaving literal Directory Ids alone', () => {
    const manifest = {
      ...manifestWith([{ id: 'App', installPath: 'bin/app.exe' }]),
      shortcuts: [
        { name: 'App', targetFileId: 'App', location: 'desktopFolder' as const, workingDirectory: 'wr:dir:installFolder:bin' },
        { name: 'Other', targetFileId: 'App', location: 'desktopFolder' as const, workingDirectory: 'wr:dir:installFolder:elsewhere' },
        { name: 'Literal', targetFileId: 'App', location: 'desktopFolder' as const, workingDirectory: 'SomeHandTypedDirectoryId' },
      ],
    }

    const result = deleteFolder(manifest, 'installFolder', 'bin')

    expect(result.shortcuts.map((s) => s.workingDirectory)).toEqual([null, 'wr:dir:installFolder:elsewhere', 'SomeHandTypedDirectoryId'])
  })

  it('only touches the given root', () => {
    const manifest = manifestWith([
      { id: 'A', installPath: 'bin/app.exe', root: 'installFolder' },
      { id: 'B', installPath: 'bin/app.exe', root: 'commonFilesFolder' },
    ])

    const result = deleteFolder(manifest, 'installFolder', 'bin')

    expect(result.files.declared.map((f) => f.id)).toEqual(['B'])
  })
})

describe('fileNameOf', () => {
  it('returns the trailing segment of a nested path, or the whole string at the root', () => {
    expect(fileNameOf('documentation/notes.txt')).toBe('notes.txt')
    expect(fileNameOf('bin/native/lib.dll')).toBe('lib.dll')
    expect(fileNameOf('app.exe')).toBe('app.exe')
  })
})

describe('joinInstallPath', () => {
  it('joins a prefix and name, or returns the name alone at the root', () => {
    expect(joinInstallPath('', 'app.exe')).toBe('app.exe')
    expect(joinInstallPath('bin', 'app.exe')).toBe('bin/app.exe')
  })
})

describe('itemCountUnderTarget', () => {
  it('counts declared files and harvest folders recursively under a target, scoped to its root', () => {
    const manifest = manifestWith(
      [
        { id: 'Root', installPath: 'app.exe' },
        { id: 'Nested', installPath: 'bin/lib.dll' },
        { id: 'DeepNested', installPath: 'bin/native/lib.dll' },
        { id: 'OtherRoot', installPath: 'app.exe', root: 'commonFilesFolder' },
      ],
      [{ sourceFolder: 'locales', installPath: 'bin/locales' }],
    )

    expect(itemCountUnderTarget(manifest, { root: 'installFolder', prefix: '' })).toBe(4)
    expect(itemCountUnderTarget(manifest, { root: 'installFolder', prefix: 'bin' })).toBe(3)
    expect(itemCountUnderTarget(manifest, { root: 'installFolder', prefix: 'bin/native' })).toBe(1)
    expect(itemCountUnderTarget(manifest, { root: 'commonFilesFolder', prefix: '' })).toBe(1)
  })

  it('is zero for an empty target', () => {
    const manifest = manifestWith([])
    expect(itemCountUnderTarget(manifest, { root: 'installFolder', prefix: '' })).toBe(0)
  })
})

describe('resolvedPathPreview', () => {
  it('resolves installFolder from the bare default targetDirectory, with a subfolder appended', () => {
    const manifest = manifestWith([])

    expect(resolvedPathPreview(manifest, { root: 'installFolder', prefix: '' })).toBe('C:\\Program Files\\')
    expect(resolvedPathPreview(manifest, { root: 'installFolder', prefix: 'bin/native' })).toBe('C:\\Program Files\\bin\\native\\')
  })

  it('resolves installFolder using a subpath appended to targetDirectory', () => {
    const manifest = { ...manifestWith([]), targetDirectory: '[ProgramFiles64Folder]Acme\\App' }
    expect(resolvedPathPreview(manifest, { root: 'installFolder', prefix: '' })).toBe('C:\\Program Files\\Acme\\App\\')
  })

  it('resolves installFolder from a literal targetDirectory path', () => {
    const manifest = { ...manifestWith([]), targetDirectory: 'C:\\Program Files\\Acme\\App' }
    expect(resolvedPathPreview(manifest, { root: 'installFolder', prefix: '' })).toBe('C:\\Program Files\\Acme\\App\\')
  })

  it('falls back to the ProgramFiles64Folder default when targetDirectory is unrecognized', () => {
    const manifest = { ...manifestWith([]), targetDirectory: 'not a real path' }
    expect(resolvedPathPreview(manifest, { root: 'installFolder', prefix: '' })).toBe('C:\\Program Files\\')
  })

  it('resolves the fixed WiX standard directories independent of targetDirectory', () => {
    const manifest = manifestWith([])

    expect(resolvedPathPreview(manifest, { root: 'commonFilesFolder', prefix: '' })).toBe('C:\\Program Files (x86)\\Common Files\\')
    expect(resolvedPathPreview(manifest, { root: 'commonFiles64Folder', prefix: '' })).toBe('C:\\Program Files\\Common Files\\')
    expect(resolvedPathPreview(manifest, { root: 'programFiles64Folder', prefix: '' })).toBe('C:\\Program Files\\')
    expect(resolvedPathPreview(manifest, { root: 'programFilesFolder', prefix: '' })).toBe('C:\\Program Files (x86)\\')
    expect(resolvedPathPreview(manifest, { root: 'appDataFolder', prefix: '' })).toBe('C:\\Users\\<installing user>\\AppData\\Roaming\\')
  })

  it('SystemFolder is WOW64-redirected on an x64/arm64 build - System64Folder is the real, non-redirected System32', () => {
    const x64 = { ...manifestWith([]), architecture: 'x64' as const }
    expect(resolvedPathPreview(x64, { root: 'systemFolder', prefix: '' })).toBe('C:\\Windows\\SysWOW64\\')
    expect(resolvedPathPreview(x64, { root: 'system64Folder', prefix: '' })).toBe('C:\\Windows\\System32\\')
  })

  it('SystemFolder resolves to the real System32 on an x86 build - nothing 64-bit to be redirected away from', () => {
    const x86 = { ...manifestWith([]), architecture: 'x86' as const }
    expect(resolvedPathPreview(x86, { root: 'systemFolder', prefix: '' })).toBe('C:\\Windows\\System32\\')
  })
})

describe('parseTargetDirectory / formatTargetDirectory', () => {
  it('parses bracketed WiX syntax into a root and segments', () => {
    expect(parseTargetDirectory('[ProgramFiles64Folder]Acme\\App')).toEqual({ rootId: 'ProgramFiles64Folder', segments: ['Acme', 'App'] })
    expect(parseTargetDirectory('[AppDataFolder]')).toEqual({ rootId: 'AppDataFolder', segments: [] })
  })

  it('parses an equivalent literal Windows path', () => {
    expect(parseTargetDirectory('C:\\Program Files\\Acme\\App')).toEqual({ rootId: 'ProgramFiles64Folder', segments: ['Acme', 'App'] })
    expect(parseTargetDirectory('C:\\Program Files (x86)\\Common Files\\Acme')).toEqual({ rootId: 'CommonFilesFolder', segments: ['Acme'] })
  })

  it('returns null for an unrecognized root or path', () => {
    expect(parseTargetDirectory('[NotAToken]App')).toBeNull()
    expect(parseTargetDirectory('D:\\SomeOtherDrive\\App')).toBeNull()
    expect(parseTargetDirectory('')).toBeNull()
  })

  it('composes a root + subpath back into bracketed syntax', () => {
    expect(formatTargetDirectory('ProgramFiles64Folder', 'Acme\\App')).toBe('[ProgramFiles64Folder]Acme\\App')
    expect(formatTargetDirectory('AppDataFolder', '')).toBe('[AppDataFolder]')
  })
})

describe('normalizeTargetDirectoryToken', () => {
  it('converts a recognized raw OS path to bracketed WiX property syntax', () => {
    expect(normalizeTargetDirectoryToken('C:\\Program Files\\Acme\\App')).toBe('[ProgramFiles64Folder]Acme\\App')
    expect(normalizeTargetDirectoryToken('C:\\Program Files (x86)\\Acme\\App')).toBe('[ProgramFilesFolder]Acme\\App')
    expect(normalizeTargetDirectoryToken('C:\\ProgramData\\Acme')).toBe('[CommonAppDataFolder]Acme')
  })

  it('leaves an already-bracketed value untouched', () => {
    expect(normalizeTargetDirectoryToken('[ProgramFiles64Folder]Acme\\App')).toBe('[ProgramFiles64Folder]Acme\\App')
  })

  it('leaves an unrecognized or still-mid-typed value untouched', () => {
    expect(normalizeTargetDirectoryToken('D:\\SomeOtherDrive\\App')).toBe('D:\\SomeOtherDrive\\App')
    expect(normalizeTargetDirectoryToken('C:\\Program F')).toBe('C:\\Program F')
    expect(normalizeTargetDirectoryToken('')).toBe('')
  })
})

describe('workingDirectorySentinel', () => {
  it('builds the wr:dir: sentinel WxsGenerator resolves server-side', () => {
    expect(workingDirectorySentinel('installFolder', 'bin')).toBe('wr:dir:installFolder:bin')
    expect(workingDirectorySentinel('appDataFolder', '')).toBe('wr:dir:appDataFolder:')
  })

  it('derives the containing folder from a full install path', () => {
    expect(workingDirectorySentinelForInstallPath('installFolder', 'bin/tool.exe')).toBe('wr:dir:installFolder:bin')
    expect(workingDirectorySentinelForInstallPath('installFolder', 'app.exe')).toBe('wr:dir:installFolder:')
  })
})

describe('setArchitecture', () => {
  it('switches the single architecture and moves Target Directory along with it', () => {
    const next = setArchitecture(manifestWith([]), 'x86')
    expect(next.architecture).toBe('x86')
    expect(next.targetDirectory).toBe('[ProgramFilesFolder]')
  })
})

describe('visibleInstallRoots - system folder mapping by architecture', () => {
  it('x64/arm64 builds show both System Folder (32-bit) and System Folder (64-bit)', () => {
    const x64 = visibleInstallRoots({ ...manifestWith([]), architecture: 'x64' })
    expect(x64.find((r) => r.root === 'systemFolder')?.friendlyName).toBe('System Folder (32-bit)')
    expect(x64.find((r) => r.root === 'system64Folder')?.friendlyName).toBe('System Folder (64-bit)')
  })

  it('x86 builds show only a plain "System Folder", with system64Folder hidden entirely', () => {
    const x86 = visibleInstallRoots({ ...manifestWith([]), architecture: 'x86' })
    expect(x86.find((r) => r.root === 'systemFolder')?.friendlyName).toBe('System Folder')
    expect(x86.find((r) => r.root === 'system64Folder')).toBeUndefined()
  })
})

describe('bitnessBadge', () => {
  it('badges the six bitness-specific roots and leaves the rest unbadged', () => {
    expect(bitnessBadge('programFiles64Folder')).toBe('64-bit')
    expect(bitnessBadge('commonFiles64Folder')).toBe('64-bit')
    expect(bitnessBadge('system64Folder')).toBe('64-bit')
    expect(bitnessBadge('programFilesFolder')).toBe('32-bit')
    expect(bitnessBadge('commonFilesFolder')).toBe('32-bit')
    expect(bitnessBadge('systemFolder')).toBe('32-bit')
    expect(bitnessBadge('installFolder')).toBeUndefined()
    expect(bitnessBadge('commonAppDataFolder')).toBeUndefined()
  })
})

describe('default install directory (ADR 0048)', () => {
  it('derives Manufacturer\\Name, dropping blanks and illegal characters', () => {
    expect(defaultTargetDirectory('Acme Corp', 'My App')).toBe('[ProgramFiles64Folder]Acme Corp\\My App')
    expect(defaultTargetDirectory('', 'My App')).toBe('[ProgramFiles64Folder]My App')
    expect(defaultTargetDirectory('', '')).toBe('[ProgramFiles64Folder]')
    expect(defaultTargetDirectory('A/B: Inc.', 'App?*')).toBe('[ProgramFiles64Folder]AB Inc\\App')
  })

  it('follows Name/Manufacturer edits while the directory is still the auto value', () => {
    let m = { ...createEmptyManifest(), name: 'New Project', targetDirectory: defaultTargetDirectory('', 'New Project') }
    m = withNameOrManufacturerChange(m, { manufacturer: 'Acme' })
    expect(m.targetDirectory).toBe('[ProgramFiles64Folder]Acme\\New Project')
    m = withNameOrManufacturerChange(m, { name: 'Tool' })
    expect(m.targetDirectory).toBe('[ProgramFiles64Folder]Acme\\Tool')
  })

  it('leaves a user-chosen directory alone and keeps the chosen root', () => {
    const custom = { ...createEmptyManifest(), name: 'App', manufacturer: 'Acme', targetDirectory: '[ProgramFiles64Folder]Custom\\Place' }
    expect(withNameOrManufacturerChange(custom, { name: 'Other' }).targetDirectory).toBe('[ProgramFiles64Folder]Custom\\Place')

    const x86 = { ...createEmptyManifest(), name: 'App', manufacturer: 'Acme', targetDirectory: '[ProgramFilesFolder]Acme\\App' }
    expect(withNameOrManufacturerChange(x86, { name: 'Z' }).targetDirectory).toBe('[ProgramFilesFolder]Acme\\Z')
  })
})

describe('suggested install directory (ADR 0095)', () => {
  it('is offered for a bare root and never applied by an edit', () => {
    const m = { ...createEmptyManifest(), name: 'Tool', manufacturer: 'Acme', targetDirectory: '[ProgramFiles64Folder]' }

    expect(suggestedTargetDirectory(m)).toBe('[ProgramFiles64Folder]Acme\\Tool')
    expect(withNameOrManufacturerChange(m, { name: 'Other' }).targetDirectory).toBe('[ProgramFiles64Folder]')
  })

  it('is not offered once a folder is chosen, or when there is nothing to base it on', () => {
    expect(suggestedTargetDirectory({ ...createEmptyManifest(), name: 'Tool', targetDirectory: '[ProgramFiles64Folder]Mine' })).toBeNull()
    expect(suggestedTargetDirectory({ ...createEmptyManifest(), name: '', manufacturer: '', targetDirectory: '[ProgramFiles64Folder]' })).toBeNull()
  })

  it('treats a per-user bare root as bare too', () => {
    const m = { ...createEmptyManifest(), name: 'Tool', manufacturer: 'Acme', targetDirectory: '[LocalAppDataFolder]Programs' }

    expect(suggestedTargetDirectory(m)).toBe('[LocalAppDataFolder]Programs\\Acme\\Tool')
  })
})

describe('imported (harvest) folders are browsable (ADR 0097)', () => {
  const manifest = {
    ...createEmptyManifest(),
    files: { declared: [], harvest: [{ sourceFolder: 'Downloads', installPath: 'test/Downloads', root: 'installFolder' as const }] },
  }
  const sources = ['Downloads/a.pdf', 'Downloads/sub/b.txt', 'Downloads/sub/deep/c.txt', 'Other/x.txt']

  it('shows what is inside at the folder and at a nested level', () => {
    const top = harvestViewAt(manifest, sources, { root: 'installFolder', prefix: 'test/Downloads' })
    expect(top?.folders).toEqual(['sub'])
    expect(top?.files.map((f) => f.name)).toEqual(['a.pdf'])
    expect(top?.totalFiles).toBe(3)

    const sub = harvestViewAt(manifest, sources, { root: 'installFolder', prefix: 'test/Downloads/sub' })
    expect(sub?.folders).toEqual(['deep'])
    expect(sub?.files.map((f) => f.name)).toEqual(['b.txt'])
  })

  it('is null for an ordinary folder', () => {
    expect(harvestViewAt(manifest, sources, { root: 'installFolder', prefix: 'test' })).toBeNull()
  })

  it('lists the imported folder as a subfolder of its parent, and its inner folders below it', () => {
    expect(subfoldersWithHarvest(manifest, sources, { root: 'installFolder', prefix: 'test' })).toContain('Downloads')
    expect(subfoldersWithHarvest(manifest, sources, { root: 'installFolder', prefix: 'test/Downloads' })).toEqual(['sub'])
  })

  it('counts only files directly in a folder, so a parent and its child do not show the same number', () => {
    const withFile = { ...manifest, files: { ...manifest.files, declared: [{ id: 'f', sourcePath: 'x.txt', installPath: 'test/x.txt', root: 'installFolder' as const }] } }

    expect(itemCountDirectlyAt(withFile, sources, { root: 'installFolder', prefix: 'test' })).toBe(1)
    expect(itemCountDirectlyAt(withFile, sources, { root: 'installFolder', prefix: 'test/Downloads' })).toBe(1)
    expect(itemCountDirectlyAt(withFile, sources, { root: 'installFolder', prefix: 'test/Downloads/sub' })).toBe(1)
  })

  it('still counts an imported folder as non-empty when its files are not loaded', () => {
    expect(itemCountUnderTargetWithHarvest(manifest, [], { root: 'installFolder', prefix: 'test/Downloads' })).toBe(1)
  })
})
