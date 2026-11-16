import { describe, expect, it } from 'vitest'
import { fromDataTransfer } from './directoryImport'

function fileEntry(name: string, file: File): FileSystemEntry {
  return {
    isFile: true,
    isDirectory: false,
    name,
    file: (resolve: (f: File) => void) => resolve(file),
  } as unknown as FileSystemEntry
}

function dirEntry(name: string, children: FileSystemEntry[]): FileSystemEntry {
  return {
    isFile: false,
    isDirectory: true,
    name,
    createReader: () => ({ readEntries: (resolve: (entries: FileSystemEntry[]) => void) => resolve(children) }),
  } as unknown as FileSystemEntry
}

function dataTransferWith(entries: FileSystemEntry[]): DataTransfer {
  return { items: entries.map((entry) => ({ webkitGetAsEntry: () => entry })) } as unknown as DataTransfer
}

describe('fromDataTransfer', () => {
  it('walks a dropped folder and reconstructs relative paths', async () => {
    const appExe = new File(['exe'], 'App.exe')
    const readme = new File(['readme'], 'README.txt')

    const dataTransfer = dataTransferWith([dirEntry('MyApp', [fileEntry('App.exe', appExe), fileEntry('README.txt', readme)])])

    const result = await fromDataTransfer(dataTransfer)

    expect(result).toEqual([
      { file: appExe, relativePath: 'MyApp/App.exe' },
      { file: readme, relativePath: 'MyApp/README.txt' },
    ])
  })

  it('walks nested subfolders', async () => {
    const lib = new File(['lib'], 'lib.dll')
    const dataTransfer = dataTransferWith([dirEntry('MyApp', [dirEntry('bin', [fileEntry('lib.dll', lib)])])])

    const result = await fromDataTransfer(dataTransfer)

    expect(result).toEqual([{ file: lib, relativePath: 'MyApp/bin/lib.dll' }])
  })

  it('handles a bare dropped file with no enclosing folder', async () => {
    const app = new File(['exe'], 'App.exe')
    const dataTransfer = dataTransferWith([fileEntry('App.exe', app)])

    const result = await fromDataTransfer(dataTransfer)

    expect(result).toEqual([{ file: app, relativePath: 'App.exe' }])
  })
})
