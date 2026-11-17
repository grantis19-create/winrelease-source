import { SHORTCUT_LOCATIONS, createEmptyManifest, type RegistryEntry, type WinReleaseManifest } from '../types/manifest'
import { WINRELEASE_ICON_BASE64 } from './sampleIcon'

const ICON_FILE = 'winrelease.ico'

const WELCOME_TEXT = [
  'Welcome! If you can read this file, the installation worked.',
  '',
  'This sample MSI was built with WinRelease, the free MSI builder:',
  'https://winrelease.geappsolutions.com',
  '',
  'Need more than a basic MSI? https://geappsolutions.com',
  '',
  'This sample also shows the two views of a 64-bit package:',
  '  - registry values in the 64-bit view, and in the 32-bit view (under WOW6432Node),',
  '    both under HKEY_LOCAL_MACHINE > SOFTWARE > GE App Solutions > WinRelease Sample, and',
  '  - a second text file, Welcome32.txt, in the 32-bit Program Files folder.',
  '',
  'To remove it all, uninstall "WinRelease Sample" from Settings > Apps.',
  '',
].join('\r\n')

const WELCOME_32_TEXT = [
  'This file was installed into the 32-bit Program Files folder (Program Files (x86)),',
  'from a 64-bit package. WinRelease Sample puts one file in each place so you can see',
  'where a package can install: Program Files for 64-bit programs, Program Files (x86) for 32-bit ones.',
  '',
  'It is removed when you uninstall "WinRelease Sample" from Settings > Apps.',
  '',
].join('\r\n')

/** The sample's registry values: the same two keys in the 64-bit view and, under WOW6432Node, the 32-bit view. */
function sampleRegistry(): RegistryEntry[] {
  const key64 = String.raw`SOFTWARE\GE App Solutions\WinRelease Sample`
  const key32 = String.raw`SOFTWARE\WOW6432Node\GE App Solutions\WinRelease Sample`
  const value = (key: string, name: string, text: string, valueType: RegistryEntry['valueType'] = 'string'): RegistryEntry => ({
    root: 'hklm',
    key,
    name,
    value: text,
    valueType,
  })
  return [
    value(key64, 'View', '64-bit'),
    value(key64, 'Version', '1.0.0'),
    value(key64, 'ShowWelcome', '1', 'integer'),
    value(key32, 'View', '32-bit'),
    value(key32, 'Version', '1.0.0'),
  ]
}

function iconFile(): File {
  const bytes = Uint8Array.from(atob(WINRELEASE_ICON_BASE64), (c) => c.charCodeAt(0))
  return new File([bytes], ICON_FILE, { type: 'image/x-icon' })
}

/**
 * A ready-to-compile starter for a first-time visitor (ADR 0047, revised): a 64-bit package with one text file that says what it is, one Start
 * Menu shortcut to it, and the WinRelease icon on both the shortcut and the Apps list entry. It also shows the 64-bit and 32-bit sides of a
 * 64-bit package: a few registry values in each registry view, and a second text file in the 32-bit Program Files folder. All of it is removed
 * on uninstall, so a tester can install and remove it cleanly. The files are made in the browser - there is nothing to download first.
 */
export function createSampleProject(): { manifest: WinReleaseManifest; files: { path: string; file: File }[] } {
  const manifest: WinReleaseManifest = {
    ...createEmptyManifest(),
    name: 'WinRelease Sample',
    manufacturer: 'GE App Solutions',
    displayVersion: '1.0.0',
    architecture: 'x64',
    targetDirectory: String.raw`[ProgramFiles64Folder]GE App Solutions\WinRelease Sample`,
    appInfo: {
      ...createEmptyManifest().appInfo,
      iconPath: ICON_FILE,
      autoExtractIcon: false,
      // Each link in the Apps list lands on the page that answers it, instead of one long comment with every address in it.
      comments: 'A sample installer built with WinRelease.',
      aboutUrl: 'https://winrelease.geappsolutions.com/',
      supportUrl: 'https://winrelease.geappsolutions.com/help',
      updateUrl: 'https://winrelease.geappsolutions.com/whats-new',
    },
    files: {
      declared: [
        { id: 'SampleText', sourcePath: 'Welcome.txt', installPath: 'Welcome.txt', root: 'installFolder' },
        // The 32-bit side: a file under Program Files (x86), from a 64-bit package.
        { id: 'SampleText32', sourcePath: 'Welcome32.txt', installPath: 'GE App Solutions/WinRelease Sample/Welcome32.txt', root: 'programFilesFolder' },
      ],
      harvest: [],
    },
    shortcuts: [
      {
        name: 'WinRelease Sample',
        targetFileId: 'SampleText',
        location: SHORTCUT_LOCATIONS.programMenuFolder,
        description: 'Opens the sample text installed by WinRelease',
        iconPath: ICON_FILE,
      },
    ],
    registry: sampleRegistry(),
  }

  const files = [
    { path: 'Welcome.txt', file: new File([WELCOME_TEXT], 'Welcome.txt', { type: 'text/plain' }) },
    { path: 'Welcome32.txt', file: new File([WELCOME_32_TEXT], 'Welcome32.txt', { type: 'text/plain' }) },
    { path: ICON_FILE, file: iconFile() },
  ]

  return { manifest, files }
}
