export interface NewsEntry {
  /** Stable id, newest first in NEWS. The "seen" marker is the id of the newest entry the person has opened. */
  id: string
  date: string
  title: string
  items: string[]
}

/**
 * What changed, in plain words, newest first. Add an entry at the top with every deploy that changes what people see or what the Helper does;
 * the sidebar's "new" dot shows until the page has been opened since. Only say what is true of the released site and Helper.
 */
export const NEWS: NewsEntry[] = [
  {
    id: '2026-11-17-helper-0.1.15',
    date: '17 November 2026',
    title: 'Helper v0.1.15: shortcuts to programs already on the PC; a new Start here in Build Help',
    items: [
      'A shortcut to a program that is already on the PC now works when you type its full path (for example C:\\Windows\\System32\\notepad.exe) in the Custom target. Before, the package built and installed but made no shortcut. (Helper v0.1.15.)',
      'A shortcut target Windows cannot use, such as a bare file name or a relative path, is now refused with a message that says what to use instead, instead of building a package that silently makes nothing. (Helper v0.1.15.)',
      'Build Help starts with a new Start here section for anyone moving from copying files to building an installer: what an installer does, what WinRelease is and is not for, a worked first package, how to install the result on other PCs, and how upgrades work.',
      'A Product Code you set by hand now shows a Pinned tag and a warning, with a Back to automatic button, because a new version with the same Product Code is refused by Windows instead of upgrading.',
      'The screenshots on the front page have an Enlarge button and a pop-out with a Close button.',
    ],
  },
  {
    id: '2026-11-16-company-details',
    date: '16 November 2026',
    title: 'Company details, and the WiX fee wording',
    items: [
      'The site now states who runs it: GE App Solutions Limited, registered in England and Wales, company number 16317660, with its registered office. It is on the front page footer, the Privacy page and the Disclaimer.',
      'The Disclaimer and the setup guide now say it the way WiX does: organisations with more than US$10,000 in annual revenue are required to sponsor the WiX project.',
    ],
  },
  {
    id: '2026-11-16-registry-layout',
    date: '16 November 2026',
    title: 'Registry: laid out like regedit, and the Custom URL Scheme button is gone',
    items: [
      'The registry tree now starts with Computer, lists the hives in regedit’s order, shows HKEY_CURRENT_CONFIG greyed (Windows Installer cannot write there), and has an address-bar path above it.',
      'The Custom URL Scheme button was removed: it wrote a typed name straight into HKEY_CLASSES_ROOT, and other packaging tools do not offer it as a preset. Projects that already have such entries keep working, and you can still create the keys by hand in the tree.',
    ],
  },
  {
    id: '2026-11-16-registry-32bit',
    date: '16 November 2026',
    title: 'Registry: the 32-bit part is now visible, and imports are stricter',
    items: [
      'In a 64-bit package the registry tree now shows WOW6432Node under HKEY_LOCAL_MACHINE\SOFTWARE, greyed until something is in it, with a 32-bit tag. Right-click it and choose Add Entry Here to write a 32-bit entry by hand. Nothing is staged under the current user, because Windows shares that part between 32-bit and 64-bit programs.',
      'A .reg import now warns about values Windows Installer cannot write (a QWORD is kept as binary, and says so; before, it was dropped), a doubled WOW6432Node, a value listed twice, and a path into one user’s profile. The warnings are advice: you can still create anything by hand.',
      'A WOW6432Node typed inside another is flagged in the tree. The build removes exactly one WOW6432Node and never adds one, so it cannot grow into WOW6432Node\WOW6432Node by itself.',
    ],
  },
  {
    id: '2026-11-16-source-and-feedback',
    date: '16 November 2026',
    title: 'Source open to inspection, and feedback on GitHub',
    items: [
      'The source code of the Helper and of this website is now published for inspection and security review. It is for reading, building and checking, not open source: you may not redistribute it or make a product from it. Build Help has an Open to inspection section, and the Helper section in Settings points to it.',
      'Feedback & Support now goes to a public issue tracker on GitHub instead of email. Pick a topic, open the form, and optionally copy a block of details to paste in (read it first: issues are public). Security problems go through GitHub’s private report form.',
      'The Privacy page was updated to match.',
    ],
  },
  {
    id: '2026-11-16-front-page-and-privacy',
    date: '16 November 2026',
    title: 'A front page, release notes, a Privacy page and colour themes',
    items: [
      'The site now opens on a front page: what WinRelease is, how it works, what it has been tested against and what it does not do, with real screens of the editor you can click to enlarge. The editor is one click away (Open the editor), and the WinRelease name at the top of the sidebar takes you back.',
      'What’s new is now Release notes: the current Helper download with its date, size and SHA-256, a list of known limitations, ideas we are considering (no dates, no promises) with a link to tell us which would help, and every change below.',
      'New Privacy page, linked at the bottom of the sidebar: what stays in your browser, what the Helper does (nothing leaves your PC), and what the hosting services see.',
      'The site now counts visits in totals (pages, countries, where visitors came from) with Cloudflare Web Analytics, so we can see whether WinRelease is being used. It sets no cookies and follows no individuals, it is not loaded at all if your browser sends Do Not Track or Global Privacy Control, and nothing from your projects, files or MSIs is sent to it. The Privacy page and the Disclaimer say so.',
      'Settings has a new Theme panel: Orange (the usual look), Green, Blue and Mono. Your choice is remembered in this browser.',
      'A short Who made this note, on the front page, Release notes and Feedback & Support.',
    ],
  },
  {
    id: '2026-11-12-helper-0.1.14',
    date: '12 November 2026',
    title: 'Helper v0.1.14: clearer errors, backslash paths, setup guide fixes',
    items: [
      'If WiX is not installed, a build now says so in plain words and shows the two commands to fix it, instead of failing with no message. (Helper v0.1.14.)',
      'A file whose install path was typed with a backslash (for example bin\\app.exe) now builds; before, WiX refused it. (Helper v0.1.14.)',
      'Setup guide: the .NET command now works on older Windows 11 images, with a hint for the winget "Failed when opening source(s)" error.',
      'New in Build Help: How WinRelease is tested. 200 test packages, about 1,800 checks on real installs on a clean Windows 11 PC, hostile inputs refused, and real software (7-Zip, Git, GitHub CLI and more) wrapped and removed cleanly.',
      'Disclaimer: WinRelease is for simple, lightweight MSIs and must not be used to build or spread malware. The WiX fee note now states the US$10,000 revenue threshold.',
    ],
  },
  {
    id: '2026-10-30-helper-0.1.13',
    date: '30 October 2026',
    title: 'Helper v0.1.13: the missing installer-screens add-on, explained',
    items: [
      'On a fresh PC, WiX is installed without the add-on the installer screens need, so a build failed with a raw WiX error. The Helper now says so in plain words with the exact fix, instead of “Unprocessable Entity”. (Helper v0.1.13.)',
      'Settings now shows whether that add-on is found, next to the .NET SDK and WiX checks, and turns green once you add it. (Helper v0.1.13.)',
      'Setup guide, step 2: the one command that adds it (it includes your own acceptance of the WiX terms), with a plain note about the WiX fee for organisations that earn revenue. You can also switch off Installer Screens in App Info to build without it.',
    ],
  },
  {
    id: '2026-10-30-helper-0.1.12',
    date: '30 October 2026',
    title: 'Helper v0.1.12: finds WiX installed after the Helper',
    items: [
      'The Helper now finds the WiX compiler even when you installed it after the Helper was already running, and looks again when you press Re-check connection. Before, it kept saying “WiX compiler not found” until you quit and restarted it, and sometimes even then. (Helper v0.1.12.)',
      'The Helper’s messages say “your own computer” instead of “this PC”. Turning off the credit line in App Info now also holds for product names in scripts like Japanese or emoji. (Helper v0.1.12.)',
      'Setup guide: a fix for the “No NuGet sources are defined or enabled” error on a fresh PC, and a reminder to use a normal terminal, not an administrator one.',
    ],
  },
  {
    id: '2026-10-30-kept-downloads',
    date: '30 October 2026',
    title: 'Your built MSI is kept, and flagged when it goes stale',
    items: [
      'The MSI you build is now kept in this browser for each project, so its Download button is still there after you leave the project or reload. Building again replaces it.',
      'If you change the project after building, the Download button turns amber and says “out of date”, and Build Output explains why, so you do not download an MSI that is missing your latest change.',
      'Fixed: the sample project installed into one folder named “WinRelease SamplesWinRelease Sample” instead of WinRelease Samples > WinRelease Sample.',
    ],
  },
  {
    id: '2026-10-30-build-output',
    date: '30 October 2026',
    title: 'A clearer Build Output',
    items: [
      'Build Output now says how many files and icon files the build uses, and updates as you change the project. It warns about attached files the project does not use.',
      'Every successful build now shows a build log: what was built and its size, then the compiler’s own output, or a plain note that it reported no warnings or errors.',
      'The result row shows the MSI’s size.',
    ],
  },
  {
    id: '2026-10-30-helper-0.1.11',
    date: '30 October 2026',
    title: 'Helper v0.1.11: popups in the WinRelease look; a better sample project',
    items: [
      'The Helper’s popups (already running, removed, port in use) now match this site: dark with orange, and the WinRelease icon, so they are easy to recognise. (Helper v0.1.11.)',
      'The Helper’s file properties now show the GE App Solutions copyright. (Helper v0.1.11.)',
      'The sample project is now a small 64-bit package: one text file that confirms the install worked, a Start Menu shortcut to it, and the WinRelease icon on the shortcut and in the Apps list. Each link in the Apps list opens its own page (help, about, what’s new).',
      'On the Projects page, Try a sample project is now the main button.',
    ],
  },
  {
    id: '2026-10-29-helper-0.1.10',
    date: '29 October 2026',
    title: 'Helper v0.1.10: non-Latin names in file details, Disclaimer, clearer help',
    items: [
      'Product names and manufacturers in Japanese, Chinese, Russian and other languages now show correctly in the MSI file’s Properties > Details tab. Before, they came out as unreadable characters there. (Helper v0.1.10.)',
      'The MSI’s Comments there now keep Windows Installer’s standard sentence and add “Created with WinRelease” and the version that built it, which enterprise QA sheets ask for. (Helper v0.1.10.)',
      'Build Help has a Disclaimer, and its Registry, App Info and Helper wording was made clearer.',
    ],
  },
  {
    id: '2026-10-29-helper-0.1.9',
    date: '29 October 2026',
    title: 'Helper v0.1.9: small icons, icon checks, rename variables',
    items: [
      'Icons: when an .exe or .dll is the icon source, only its icon goes into the MSI, as a small .ico, instead of the whole file (a 578 KB program added 578 KB; now about 50 KB). (Helper v0.1.9.)',
      'Icons: a file that is not an icon is now refused with a plain message that names the file, instead of building an MSI with a blank icon. (Helper v0.1.9.)',
      'Auto-extract skips a program that has no icon and uses the next one that does. (Helper v0.1.9.)',
      'The MSI’s file details (and the Add/Remove Programs comments, if you left them empty) now say it was packaged with WinRelease and point to winrelease.geappsolutions.com. You see it in the MSI file’s Properties > Details tab. Nothing shows while installing, and App Info has a tick box to leave it out. (Helper v0.1.9.)',
      'Environment variables: right-click a variable and choose Rename (or press F2, or double-click the name).',
    ],
  },
  {
    id: '2026-10-29-helper-0.1.8',
    date: '29 October 2026',
    title: 'Helper v0.1.8: only ever talks to your own computer; sharper 32-bit registry rules',
    items: [
      'The Helper now only accepts connections from your own PC. It will not start at all if it is told to use a network address, so Windows Firewall no longer shows an “Allow access?” prompt for it. (Helper v0.1.8.)',
      'Registry: regedit shows the 32-bit part of the registry as a WOW6432Node key. A key under it is now installed as a 32-bit entry only in the places where Windows really redirects 32-bit programs (HKEY_LOCAL_MACHINE\\SOFTWARE and a few Classes keys). Anywhere else it is written exactly as you typed it, and the grid marks it “as typed”. (Helper v0.1.8.)',
      'Registry: in a 32-bit package, a key and the same key under WOW6432Node are one and the same place. Listing both now shows a clear message asking you to keep one, instead of a build failure. WOW6432Node keys also show the “32-bit” tag in 32-bit packages.',
      'The banner that says checks and builds run in the Helper now keeps looking for it by itself, and has a Start the Helper button. A Helper you start after the page opened is picked up without pressing Check again.',
    ],
  },
  {
    id: '2026-10-29',
    date: '29 October 2026',
    title: 'Registry import, built-in properties, a Helper that installs itself',
    items: [
      'Registry: a .reg file now imports as it is, including keys with square brackets in their names (Active Setup templates). Keys under WOW6432Node install as 32-bit entries, so there is no x86/x64 question. (Needs Helper v0.1.6 or newer.)',
      'Registry: keys on the left, values on the right, key names ignore capitals, and the editor warns about a [Name] that nothing in the package sets.',
      'Properties: a read-only “Set by WinRelease” list shows what every MSI already contains, such as ALLUSERS, and which setting controls each.',
      'Helper v0.1.7 installs itself for your Windows user, so updates replace it in place and you can delete the download. It can be uninstalled from its tray menu or Settings > Apps, and Start with Windows now follows it.',
      'Files & Folders: the file list fits a laptop-width window without sideways scrolling.',
      'Feedback & Support: you can now tell us what you like, too.',
      'Build Help and the Helper help were updated to match.',
    ],
  },
  {
    id: '2026-10-28',
    date: '28 October 2026',
    title: 'A calmer editor, tougher Helper, any language',
    items: [
      'Build MSI is now the main button, and the editor is shorter: Environment Variables, Properties and the manifest JSON sit together under Advanced.',
      'When the Helper is not running, Build MSI says so and tells you how to start it, instead of showing a blank error.',
      'The first-run steps now start with getting the Helper.',
      'Helper v0.1.5: half the download (47 MB), and it only answers programs on your own PC.',
      'Product names, folders and files in any language (Chinese, Greek, Cyrillic, emoji) now build into an MSI. “Disable Modify” no longer fails a build that has the installer screens on.',
      'A security review of the site and the Helper, with fixes.',
    ],
  },
]

const SEEN_KEY = 'winrelease:whats-new-seen'
const SEEN_EVENT = 'winrelease:whats-new-seen'

export const LATEST_NEWS_ID = NEWS[0].id

export function hasUnseenNews(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) !== LATEST_NEWS_ID
  } catch {
    return false // With storage blocked, a dot that can never be cleared would only nag.
  }
}

/** Called when the What's new page is opened: remembers (in this browser only) that the newest entry has been seen, and tells the sidebar. */
export function markNewsSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, LATEST_NEWS_ID)
  } catch {
    // Best-effort only.
  }
  window.dispatchEvent(new Event(SEEN_EVENT))
}

/** Subscribes to "seen" changes (this tab, via the custom event; other tabs, via the storage event). Returns the unsubscribe function. */
export function onNewsSeenChange(listener: () => void): () => void {
  window.addEventListener(SEEN_EVENT, listener)
  window.addEventListener('storage', listener)
  return () => {
    window.removeEventListener(SEEN_EVENT, listener)
    window.removeEventListener('storage', listener)
  }
}
