import { describe, expect, it } from 'vitest'
import { bundleFileName, createProjectBundle, filesFromSourcesZip, manifestWithHeader, readProjectBundle, stripManifestHeader } from './projectBundle'
import { createEmptyManifest } from '../types/manifest'

describe('project bundle', () => {
  it('round-trips the manifest and every added file', async () => {
    const manifest = { ...createEmptyManifest(), name: 'Round Trip', manufacturer: 'Acme' }
    const files = new Map<string, File>([
      ['app.exe', new File(['MZ-binary'], 'app.exe')],
      ['data/config.ini', new File(['[a]\nb=1'], 'config.ini')],
    ])

    const blob = await createProjectBundle(manifest, files)
    const opened = await readProjectBundle(new File([blob], 'x.winrelease.zip'))

    expect(opened.manifest.name).toBe('Round Trip')
    expect(opened.files.map((f) => f.path).sort()).toEqual(['app.exe', 'data/config.ini'])
    expect(await opened.files.find((f) => f.path === 'data/config.ini')!.file.text()).toBe('[a]\nb=1')
  })

  it('normalizes Windows-style paths inside the bundle', async () => {
    const blob = await createProjectBundle(createEmptyManifest(), new Map([['sub\\x.txt', new File(['x'], 'x.txt')]]))

    expect((await readProjectBundle(new File([blob], 'b.zip'))).files[0].path).toBe('sub/x.txt')
  })

  it('says plainly when the file is not a bundle', async () => {
    await expect(readProjectBundle(new File(['not a zip'], 'nope.zip'))).rejects.toThrow(/isn't a valid zip/)
  })

  it('rejects a zip without the WinRelease marker, even if it has a winrelease.json', async () => {
    const { zipSync, strToU8 } = await import('fflate')
    const plain = zipSync({ 'winrelease.json': strToU8(JSON.stringify(createEmptyManifest())) })

    await expect(readProjectBundle(new File([plain as BlobPart], 'plain.zip'))).rejects.toThrow(/wasn't made by WinRelease/)
  })

  it('rejects a marker from a newer format version', async () => {
    const { zipSync, strToU8 } = await import('fflate')
    const future = zipSync({
      'winrelease-project.json': strToU8(JSON.stringify({ format: 'winrelease-project', formatVersion: 99 })),
      'winrelease.json': strToU8('{}'),
    })

    await expect(readProjectBundle(new File([future as BlobPart], 'f.zip'))).rejects.toThrow(/newer version/)
  })

  it('says plainly when a marked zip has no winrelease.json', async () => {
    const { zipSync, strToU8 } = await import('fflate')
    const broken = zipSync({ 'winrelease-project.json': strToU8(JSON.stringify({ format: 'winrelease-project', formatVersion: 1 })) })

    await expect(readProjectBundle(new File([broken as BlobPart], 'b.zip'))).rejects.toThrow(/isn't a WinRelease project/)
  })
})

describe('filesFromSourcesZip', () => {
  it('lists the files in an attached sources zip, skipping folders', async () => {
    const { zipSync, strToU8 } = await import('fflate')
    const archive = zipSync({ 'a.txt': strToU8('a'), 'dir/b.txt': strToU8('b'), 'empty/': new Uint8Array() })

    const files = await filesFromSourcesZip(new File([archive as BlobPart], 's.zip'))

    expect([...files.keys()].sort()).toEqual(['a.txt', 'dir/b.txt'])
  })
})

describe('bundleFileName', () => {
  it('makes a Windows-safe name', () => {
    expect(bundleFileName('My App 2.0')).toBe('My-App-2.0.winrelease.zip')
    expect(bundleFileName('R&D: Tools/Suite?')).toBe('R&D-ToolsSuite.winrelease.zip')
    expect(bundleFileName('  ')).toBe('project.winrelease.zip')
  })
})

describe('exported winrelease.json header', () => {
  it('round-trips: the header is added on export and removed on open', () => {
    const exported = JSON.parse(JSON.stringify(manifestWithHeader({ ...createEmptyManifest(), name: 'X' })))

    expect(exported['$winrelease'].createdBy).toBe('WinRelease')
    const opened = stripManifestHeader(exported, 'winrelease.json')
    expect(opened['$winrelease']).toBeUndefined()
    expect(opened.name).toBe('X')
  })

  it('accepts a hand-written manifest with no header', () => {
    expect(stripManifestHeader({ name: 'Hand written' }, 'm.json').name).toBe('Hand written')
  })

  it('refuses a header from another format or a newer version', () => {
    expect(() => stripManifestHeader({ $winrelease: { format: 'something-else' } }, 'm.json')).toThrow(/isn't WinRelease's/)
    expect(() => stripManifestHeader({ $winrelease: { format: 'winrelease-manifest', formatVersion: 99 } }, 'm.json')).toThrow(/newer version/)
  })
})
