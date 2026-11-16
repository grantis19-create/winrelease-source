import { describe, expect, it } from 'vitest'
import { createEmptyManifest } from '../types/manifest'
import {
  declaredFileIds,
  isPristinePlaceholderProject,
  referencedByFor,
} from './manifestDraft'

describe('referencedByFor', () => {
  it('lists the Shortcuts targeting a Declared File', () => {
    const manifest = {
      ...createEmptyManifest(),
      files: { declared: [{ id: 'MainExe', sourcePath: 'a', installPath: 'a', root: 'installFolder' as const }], harvest: [] },
      shortcuts: [
        { name: 'Desktop Shortcut', targetFileId: 'MainExe', location: 'desktopFolder' as const },
        { name: 'Start Menu', targetFileId: 'MainExe', location: 'programMenuFolder' as const },
        { name: 'Unrelated', targetFileId: 'Other', location: 'desktopFolder' as const },
      ],
    }

    expect(referencedByFor(manifest, 'MainExe')).toEqual([
      { name: 'Desktop Shortcut', index: 0 },
      { name: 'Start Menu', index: 1 },
    ])
    expect(referencedByFor(manifest, 'Other')).toEqual([{ name: 'Unrelated', index: 2 }])
    expect(referencedByFor(manifest, 'Nothing')).toEqual([])
  })
})

describe('declaredFileIds', () => {
  it('collects every Declared File id', () => {
    const manifest = {
      ...createEmptyManifest(),
      files: {
        declared: [
          { id: 'A', sourcePath: 'a', installPath: 'a', root: 'installFolder' as const },
          { id: 'B', sourcePath: 'b', installPath: 'b', root: 'installFolder' as const },
        ],
        harvest: [],
      },
    }

    expect(declaredFileIds(manifest)).toEqual(new Set(['A', 'B']))
  })
})

describe('isPristinePlaceholderProject', () => {
  // ProjectsListPage's "New Project" button is the only thing that sets this literal name -
  // createEmptyManifest() itself defaults name to '', so these tests set it explicitly.
  it('is true for an untouched "New Project" with no files/shortcuts/registry entries', () => {
    expect(isPristinePlaceholderProject({ ...createEmptyManifest(), name: 'New Project' })).toBe(true)
  })

  it('is false for a manifest that never had the "New Project" name (e.g. createEmptyManifest\'s own default)', () => {
    expect(isPristinePlaceholderProject(createEmptyManifest())).toBe(false)
  })

  it('is false once the name was changed away from the default', () => {
    expect(isPristinePlaceholderProject({ ...createEmptyManifest(), name: 'Acme App' })).toBe(false)
  })

  it('is false once any file, shortcut, or registry entry exists', () => {
    const withFile = {
      ...createEmptyManifest(),
      name: 'New Project',
      files: { declared: [{ id: 'A', sourcePath: 'a', installPath: 'a', root: 'installFolder' as const }], harvest: [] },
    }
    expect(isPristinePlaceholderProject(withFile)).toBe(false)
  })
})
