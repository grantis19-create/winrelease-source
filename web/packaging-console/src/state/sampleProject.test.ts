import { describe, expect, it } from 'vitest'
import { createSampleProject } from './sampleProject'

describe('createSampleProject', () => {
  it('names the app and publisher, and has a staged file behind every declared file', () => {
    const { manifest, files } = createSampleProject()

    expect(manifest.name.trim()).not.toBe('')
    expect(manifest.manufacturer.trim()).not.toBe('')
    const staged = files.map((f) => f.path)
    for (const declared of manifest.files.declared) expect(staged).toContain(declared.sourcePath)
  })

  it('is a 64-bit package: one text file, one shortcut to it, and nothing in the registry', () => {
    const { manifest } = createSampleProject()

    expect(manifest.architecture).toBe('x64')
    // Publisher folder, then product folder, joined by a real backslash (a lost backslash once made them one folder).
    expect(manifest.manufacturer).toBe('GE App Solutions')
    expect(manifest.targetDirectory).toBe(String.raw`[ProgramFiles64Folder]GE App Solutions\WinRelease Sample`)
    expect(manifest.targetDirectory.split('\\')).toHaveLength(2)
    expect(manifest.files.declared).toHaveLength(1)
    expect(manifest.registry).toHaveLength(0)
    expect(manifest.shortcuts).toHaveLength(1)
    expect(manifest.files.declared.map((f) => f.id)).toContain(manifest.shortcuts[0].targetFileId)
  })

  it('carries the WinRelease icon for both the shortcut and the Apps list, as a real .ico', async () => {
    const { manifest, files } = createSampleProject()

    expect(manifest.shortcuts[0].iconPath).toBe('winrelease.ico')
    expect(manifest.appInfo.iconPath).toBe('winrelease.ico')
    expect(manifest.appInfo.autoExtractIcon).toBe(false)
    const icon = files.find((f) => f.path === 'winrelease.ico')!
    const head = new Uint8Array(await icon.file.arrayBuffer()).slice(0, 4)
    expect([...head]).toEqual([0, 0, 1, 0])
    expect(icon.file.size).toBeLessThan(20_000)
  })

  it('points each Apps-list link at the page that answers it, with a short comment', () => {
    const { appInfo } = createSampleProject().manifest

    expect(appInfo.aboutUrl).toBe('https://winrelease.geappsolutions.com/')
    expect(appInfo.supportUrl).toBe('https://winrelease.geappsolutions.com/help')
    expect(appInfo.updateUrl).toBe('https://winrelease.geappsolutions.com/whats-new')
    expect(appInfo.comments).not.toContain('http')
  })

  it('has file contents that say the install worked and point to WinRelease', async () => {
    const text = await createSampleProject().files.find((f) => f.path === 'Welcome.txt')!.file.text()

    expect(text).toContain('installation worked')
    expect(text).toContain('winrelease.geappsolutions.com')
  })
})
