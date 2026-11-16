import { describe, expect, it } from 'vitest'
import { summariseSources } from './useBuild'
import { createSampleProject } from './sampleProject'

describe('summariseSources', () => {
  it('counts the sample as one file and one icon, so the Build panel matches Files & Folders', () => {
    const { manifest, files } = createSampleProject()

    expect(summariseSources(manifest, files.map((f) => f.path))).toEqual({ files: 1, icons: 1, unused: 0 })
  })

  it('follows the project when it changes: a file removed from the project is unused, a harvested folder counts its files', () => {
    const { manifest, files } = createSampleProject()
    const paths = [...files.map((f) => f.path), 'extra.txt', 'tools/a.dll', 'tools/b.dll']

    const withHarvest = { ...manifest, files: { ...manifest.files, harvest: [{ sourceFolder: 'tools', installPath: 'tools', root: 'installFolder' as const }] } }
    expect(summariseSources(withHarvest, paths)).toEqual({ files: 3, icons: 1, unused: 1 })

    const withoutShortcutIcon = { ...manifest, shortcuts: [{ ...manifest.shortcuts[0], iconPath: undefined }], appInfo: { ...manifest.appInfo, iconPath: undefined } }
    expect(summariseSources(withoutShortcutIcon, files.map((f) => f.path))).toEqual({ files: 1, icons: 0, unused: 1 })
  })
})
