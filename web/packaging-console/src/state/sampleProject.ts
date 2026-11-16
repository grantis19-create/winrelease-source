import { SHORTCUT_LOCATIONS, createEmptyManifest, type WinReleaseManifest } from '../types/manifest'
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
  'To remove it, uninstall "WinRelease Sample" from Settings > Apps.',
  '',
].join('\r\n')

function iconFile(): File {
  const bytes = Uint8Array.from(atob(WINRELEASE_ICON_BASE64), (c) => c.charCodeAt(0))
  return new File([bytes], ICON_FILE, { type: 'image/x-icon' })
}

/**
 * A ready-to-compile starter for a first-time visitor (ADR 0047, revised): a 64-bit package with one text file that says what it is, one Start
 * Menu shortcut to it, and the WinRelease icon on both the shortcut and the Apps list entry. Nothing is written to the registry, so a tester can
 * install and remove it cleanly. The files are made in the browser - there is nothing to download first.
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
      declared: [{ id: 'SampleText', sourcePath: 'Welcome.txt', installPath: 'Welcome.txt', root: 'installFolder' }],
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
    registry: [],
  }

  const files = [
    { path: 'Welcome.txt', file: new File([WELCOME_TEXT], 'Welcome.txt', { type: 'text/plain' }) },
    { path: ICON_FILE, file: iconFile() },
  ]

  return { manifest, files }
}
