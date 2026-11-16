import { AlertTriangle, BookOpen, CheckCircle2, Cog, Database, FolderTree, Hammer, Info, KeyRound, Link2, ListChecks, Scale, ShieldCheck, SlidersHorizontal, Tag, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AppLayout } from '../components/layout/AppLayout'
import { Panel } from '../components/ui/Panel'
import { analyticsEnabled } from '../state/analytics'
import { disclaimerSigningLine } from '../state/helperSigning'
import { SECURITY_REPORT_URL, SOURCE_REPO_URL } from '../state/supportReport'

/**
 * "How to build an MSI" - a walkthrough for someone who has never made one, in the order the editor's sections appear. Every rule here is a
 * rule the editor, the validation or the build actually applies; keep it that way (a help page that is wrong is worse than none).
 */

type Step = { id: string; icon: LucideIcon; title: string; summary: string; doThis: string[]; rules: string[] }

const STEPS: Step[] = [
  {
    id: 'general',
    icon: Info,
    title: 'General',
    summary: 'Who the product is, and where it installs.',
    doThis: [
      'Product Name and Manufacturer are what people see in Settings > Apps, so write them the way you want them to read.',
      'Product Version is the version of this release, like 1.0.0.',
      'Install Directory is the folder the program goes into. The folder button beside it picks a standard place for you.',
      'Upgrade Code is made for you. Leave it alone.',
    ],
    rules: [
      'Name and Manufacturer are required, up to 255 characters each.',
      'Use a version like 1.0.0 (major.minor.build: the first two up to 255, the last up to 65535). Other shapes build, but Windows may complain and upgrades can misbehave.',
      'Never change the Upgrade Code once you have shipped. It is how Windows knows a new version replaces the old one. Changing it makes the two installs sit side by side.',
      'Raise the version for every release you give to people.',
      'Program Files needs administrator rights to install into. For an install that does not need admin, use a folder under the user’s profile (for example LocalAppData\\Programs) and choose Per-user in App Info.',
    ],
  },
  {
    id: 'app-info',
    icon: Tag,
    title: 'App Info & Installed Apps',
    summary: 'How the product appears in Settings > Apps, and who it installs for.',
    doThis: [
      'Pick the Install Scope: for everyone on the PC (needs admin) or just for the person installing.',
      'Add an icon, support link or help link if you want them shown in the Apps list. The icon can be an .ico file, or a program (.exe or .dll) that has an icon inside: only that icon goes into the MSI.',
      'The MSI’s file details say it was created with WinRelease. Nothing is shown while installing; untick “Say the MSI was packaged with WinRelease” if you want it left out.',
      'Installer Screens is on by default: double-clicking the MSI shows Welcome, Install folder, Ready and Finish pages. Turn it off for a plain progress bar.',
    ],
    rules: [
      'Per-machine installs write to every user’s PC and need administrator rights. Per-user installs do not, but must install somewhere the user can write.',
      'Silent installs (/qn) never show the screens, whatever the setting.',
      'The Windows Settings behaviour switches (disable Modify, Repair, Remove) only change what the Apps list offers; they do not stop an administrator removing it another way.',
    ],
  },
  {
    id: 'files',
    icon: FolderTree,
    title: 'Files & Folders',
    summary: 'What gets installed, and where.',
    doThis: [
      'Pick a folder on the left, then Add Files, or Import Directory to bring in a whole folder. You can also drag files and folders in.',
      'The Install Directory folder (named after the last part of the path in General) is where your program normally goes. Folders above it only spell out the path.',
      'Right-click a folder for New Folder, Rename and Delete. Click a file to select it; Ctrl-click to select several, then Delete Selected.',
      'Imported folders are folders like any other: open them in the tree to see their files.',
    ],
    rules: [
      'Everything inside an imported folder is added exactly as it is when you build. To change what is included, change the folder and import it again.',
      'The files are read from your PC when you build. If you reopen a saved project later, add the files again so the build can find them.',
      'Two files cannot install to the same place. Adding one that already exists asks whether to replace it.',
      'A folder name cannot be blank or contain / or \\.',
      'Very long paths can fail on some Windows setups; keep folder names short.',
    ],
  },
  {
    id: 'shortcuts',
    icon: Link2,
    title: 'Shortcuts',
    summary: 'Start Menu and Desktop shortcuts to the program.',
    doThis: [
      'In Files & Folders, right-click your .exe and choose Create Shortcut, or use Add Shortcut here.',
      'Choose where it goes (Start Menu, Desktop) and give it a name people will recognise.',
    ],
    rules: [
      'A shortcut points at a file you are installing, so add the file first.',
      'The Used by column in Files & Folders shows which shortcuts point at a file, so you can see before you remove it.',
    ],
  },
  {
    id: 'registry',
    icon: Database,
    title: 'Registry',
    summary: 'Settings the installer writes to the Windows registry.',
    doThis: [
      'Keys are on the left (right-click for New Key) and their values on the right. Add Entry for a value, or Import .reg File to bring in an existing export, as it is.',
      'Use Run on Startup for a program that should start at sign-in.',
    ],
    rules: [
      'HKEY_LOCAL_MACHINE needs administrator rights. In a per-user install, use HKEY_CURRENT_USER instead.',
      'The same value cannot be listed twice. Keep one.',
      'Only add what your program needs.',
      'A .reg file imports exactly as it is. There is no 32-bit or 64-bit question to answer.',
      'regedit shows the 32-bit part of the registry as a WOW6432Node key. In a 64-bit package, a key such as HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\YourApp is installed into that 32-bit part and carries a “32-bit” tag in the grid. In a 32-bit package every key goes to the 32-bit part anyway.',
      'Windows only redirects a few places (HKEY_LOCAL_MACHINE\\SOFTWARE and some Classes keys). A WOW6432Node key anywhere else is written exactly as you typed it and tagged “as typed”.',
      'In a 32-bit package, a key and the same key under WOW6432Node are one and the same, so list only one of them.',
      'To write a 32-bit entry by hand in a 64-bit package, use the greyed WOW6432Node under HKEY_LOCAL_MACHINE\\SOFTWARE: right-click it and choose Add Entry Here (or New Key first). It turns normal once it holds a value. Nothing is staged under the current user, because Windows shares that part between 32-bit and 64-bit programs.',
      'Do not type WOW6432Node twice (WOW6432Node\\WOW6432Node): Windows adds one more when it redirects, so you would end up with a doubled node. The editor flags it and a .reg import warns, but it is kept as you wrote it.',
      'A .reg import is checked and warns about values Windows Installer cannot write (such as QWORD), a doubled WOW6432Node, a value listed twice, and a path into one user’s profile. You can still create anything by hand: the warnings are advice, not a block.',
      'Windows Installer fills in anything in square brackets when it installs: [ProductName] and [INSTALLFOLDER] work, but a name nothing sets, like [PackageName], becomes empty. The editor warns you; add the property under Advanced > Properties, or type the real text.',
      'Key names ignore capitals, as in Windows: SOFTWARE and Software are one key.',
    ],
  },
  {
    id: 'environment',
    icon: KeyRound,
    title: 'Environment Variables',
    summary: 'Variables (such as PATH additions) set at install time.',
    doThis: ['Environment Variables sits inside Advanced, at the bottom of the editor. New Variable, then choose whether it is a system-wide or a per-user variable, and whether it is set, created only if missing, or removed. PATH-style values can be added to the start or the end.'],
    rules: [
      'System-wide variables need administrator rights to install.',
      'Programs that are already running do not see a new variable until they are restarted.',
    ],
  },
  {
    id: 'properties',
    icon: SlidersHorizontal,
    title: 'Properties',
    summary: 'Advanced Windows Installer switches.',
    doThis: [
      'Properties sits inside Advanced, at the bottom of the editor. Most projects need none: leave it alone unless you know the property you want; each switch has a short description.',
      'The Set by WinRelease list at the top is read-only. It shows what every MSI already contains (ALLUSERS, name, version, codes, Installed Apps settings) and which setting controls each, so nothing in Orca is a surprise.',
      'Example: LIMITUI=1 shows a reduced install window.',
    ],
    rules: [
      'ALLUSERS comes from Install Scope in App Info (per-machine writes ALLUSERS=1; per-user leaves it out) and cannot be set here, so the two cannot disagree.',
      'Pick from the list rather than typing a name: each entry in it has a short description of what it does.',
    ],
  },
  {
    id: 'build',
    icon: Hammer,
    title: 'Build the MSI',
    summary: 'Turn the project into an installer file.',
    doThis: [
      'Make sure the Helper is running (the dot in Helper & Tools is green) and that Settings shows WiX found.',
      'Check the green “Manifest is valid” bar at the top, then press Build MSI.',
      'The build log shows below; the finished .msi downloads from the result list.',
    ],
    rules: [
      'A build cannot start while something it needs is missing: no files added, or files the project names that are not attached.',
      'Pressing Build again replaces the previous result rather than stacking copies.',
      'If a build fails, the log names the file or setting at fault. Use Feedback & Support to send it to us.',
    ],
  },
]

const CHECKLIST = [
  'Install it on a clean Windows virtual machine, not your own PC, and check the program starts.',
  'Look for it in Settings > Apps, and uninstall it: the files and shortcuts should go.',
  'Build a second version with a higher version number and install it over the first: it should upgrade, not install twice.',
  'If it must install without admin rights, test it signed in as an ordinary user.',
  'Sign the MSI before you give it to anyone outside your team (Windows warns about unsigned installers).',
]

const GLOSSARY: [string, string][] = [
  ['MSI', 'A Windows installer file. Double-click it to install, or run it from a script for a silent install.'],
  ['Upgrade Code', 'A fixed ID for your product across all its versions. It lets a new version replace the old one.'],
  ['Product Version', 'The version of this release. Raise it every time you ship.'],
  ['Per-user / per-machine', 'Per-user installs for one person and need no admin rights. Per-machine installs for everyone on the PC and need an administrator.'],
  ['Harvest / imported folder', 'A whole folder added to the installer in one go, with everything inside it.'],
  ['WiX', 'Microsoft’s free tool that turns the project into the MSI. The Helper runs it on your PC.'],
]

export function HelpPage() {
  return (
    <AppLayout>
      <h1 className="text-lg font-semibold text-ink">How to build an MSI</h1>
      <p className="max-w-3xl text-sm text-muted">
        A walkthrough for your first installer. Work down the editor sections in this order; each one says what to do and the rules that matter. New to
        this? Press <strong className="text-ink">New Project</strong> on the Projects page and follow along.
      </p>

      <nav aria-label="On this page" className="flex flex-wrap gap-2 text-xs">
        <a href="#before" className="rounded-md border border-subtle px-2 py-1 text-muted hover:border-brand hover:text-brand">
          Before you start
        </a>
        {STEPS.map((step) => (
          <a key={step.id} href={`#${step.id}`} className="rounded-md border border-subtle px-2 py-1 text-muted hover:border-brand hover:text-brand">
            {step.title}
          </a>
        ))}
        <a href="#checklist" className="rounded-md border border-subtle px-2 py-1 text-muted hover:border-brand hover:text-brand">
          Before you ship
        </a>
        <a href="#glossary" className="rounded-md border border-subtle px-2 py-1 text-muted hover:border-brand hover:text-brand">
          Words used
        </a>
      </nav>

      <Panel id="before" icon={Cog} title="Before you start">
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink">
          <li>
            Run the Helper: it builds the MSI on your own PC. See <Link to="/settings#quick-start" className="text-brand hover:underline">Settings</Link> for the
            download and the two-command setup.
          </li>
          <li>Gather the files you want to install in one folder, ready to import.</li>
          <li>Decide who it installs for: everyone on the PC (needs admin) or just the person installing.</li>
        </ul>
      </Panel>

      {STEPS.map((step, index) => (
        <Panel key={step.id} id={step.id} icon={step.icon} title={`${index + 1}. ${step.title}`} description={step.summary}>
          <div className="grid gap-4 md:grid-cols-2">
            <Block heading="Do this" icon={<CheckCircle2 size={13} className="text-ok" />} items={step.doThis} />
            <Block heading="Rules to know" icon={<AlertTriangle size={13} className="text-warn" />} items={step.rules} />
          </div>
        </Panel>
      ))}

      <Panel id="checklist" icon={ListChecks} title="Before you ship">
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-ink">
          {CHECKLIST.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      </Panel>

      <Panel id="glossary" icon={BookOpen} title="Words used">
        <dl className="space-y-2 text-sm">
          {GLOSSARY.map(([term, meaning]) => (
            <div key={term}>
              <dt className="font-medium text-ink">{term}</dt>
              <dd className="text-muted">{meaning}</dd>
            </div>
          ))}
        </dl>
      </Panel>

      <Panel id="inspect" icon={ShieldCheck} title="Open to inspection">
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink">
          <li>
            The Helper runs on your PC, so you should be able to see what it does. Its source code and this website&apos;s source are published for inspection and security
            review:{' '}
            <a className="text-brand hover:underline" href={SOURCE_REPO_URL} target="_blank" rel="noreferrer">
              {SOURCE_REPO_URL.replace('https://', '')}
            </a>
            .
          </li>
          <li>
            It listens only on your own computer, installs for your Windows user only, and makes no internet connections of its own. Each release has a SHA-256 you can check:
            the repository&apos;s VERIFY page shows how.
          </li>
          <li>The source is for reading, building and checking. It is not open source: you may not redistribute it or make a product from it (see the LICENSE there).</li>
          <li>
            Found something that does not match? Report it{' '}
            <a className="text-brand hover:underline" href={SECURITY_REPORT_URL} target="_blank" rel="noreferrer">
              privately through GitHub
            </a>
            , not in a public issue.
          </li>
        </ul>
      </Panel>

      <Panel id="testing" icon={CheckCircle2} title="How WinRelease is tested">
        <p className="mb-2 text-sm text-muted">
          Every release is checked by building real packages and installing them on a clean Windows 11 PC, not just by reading the code. The latest run:
        </p>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink">
          {TESTING.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </Panel>

      <Panel id="disclaimer" icon={Scale} title="Disclaimer">
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink">
          {DISCLAIMER.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </Panel>

      <p className="text-xs text-muted">
        Stuck, or something here is wrong?{' '}
        <Link to="/support" className="text-brand hover:underline">
          Feedback &amp; Support
        </Link>
        .
      </p>
    </AppLayout>
  )
}

/** What the test runs covered. Numbers are from the runs in tests/uat (runs/INDEX.md, docs/roadmap/vm-test-plan.md); update them when the runs change, and never claim more than was run. */
const TESTING = [
  '200 test packages built with the real WinRelease build and the real WiX compiler: every kind of file, folder, shortcut, registry entry, COM class, environment variable, property, version and install scope, plus 54 hostile or broken inputs (zip bombs, path tricks, damaged files) that are all refused safely.',
  'Every package passes Microsoft’s own installer validation (ICE) and an administrative extract before it is installed.',
  'About 1,800 checks on real installs: install, check the files, registry, shortcuts, COM and environment variables, repair, uninstall and confirm nothing is left behind, upgrade, and refuse a downgrade. All pass.',
  'Real software wrapped, installed and removed cleanly: 7-Zip, Git for Windows, GitHub CLI, Inno Setup and Notion.',
  'The installer screens a person sees: the UAC prompt, the refusal for a standard user, a silent install that shows no window, and the Repair and Remove pages.',
  'The Helper: first run, update over the previous version, start with Windows, uninstall, no Windows Firewall prompt, and it only listens on your own computer.',
  'Hard cases: 32-bit and 64-bit content in a 64-bit package, real COM and ODBC registration, long and non-Latin names, a forced failure that rolls back cleanly, and a per-user install and removal by a standard user.',
  'The site end to end in Edge and Chrome against the live site (Firefox was confirmed by hand).',
  'Every product bug found along the way was fixed; what is left on the list is cosmetic.',
]

/** Plain-words terms of use. Draft: have it read by whoever advises GE App Solutions before the product is advertised. */
const DISCLAIMER = [
  '© GE App Solutions. All rights reserved. You may use WinRelease free of charge to build your own MSIs; you may not copy it, resell it or offer it as your own. The MSIs you build are yours.',
  'WinRelease is free and provided “as is”, with no warranty of any kind. GE App Solutions is not liable for loss or damage caused by using it or by any MSI it builds.',
  'WinRelease is for simple, lightweight MSIs for software you are entitled to deploy. You must not use it to build or spread malware, to hide unwanted software, or to package software you have no right to distribute. GE App Solutions does not see, review or sign the MSIs you build and is not responsible for what they contain or how they are used.',
  'Test every MSI before you deploy it: install, upgrade, repair and uninstall it on a test PC first. WinRelease builds what you describe. It does not check that your software works, that you may redistribute it, or that it is safe to deploy.',
  'Your projects are saved in your browser, and builds run on your own PC through the Helper. The website does not upload your project or files. Clearing your browser data removes your projects, so use Export to keep a copy. Only what you choose to post to the public feedback tracker leaves your PC.',
  analyticsEnabled()
    ? 'The website is a static page: it has no accounts and sets no cookies. It counts visits in aggregate with Cloudflare Web Analytics (see Privacy), and like any web host, Netlify can see that a page was requested. Feedback & Support goes to a public tracker on GitHub, and nothing is sent from the site itself.'
    : 'The website is a static page: it has no accounts, sets no cookies and runs no analytics. Like any web host, Netlify can see that a page was requested. Feedback & Support goes to a public tracker on GitHub, and nothing is sent from the site itself.',
  'The Helper builds on your PC and makes no internet connections of its own: it sends nothing anywhere, and only answers the pages of this website open in your browser.',
  'WinRelease uses the WiX Toolset to build MSIs. WiX is installed separately by you and comes with its own terms: WiX v7 requires organisations with more than US$10,000 in annual revenue (as its maintenance fee terms define it) to sponsor the WiX project, a small monthly fee, and accepting its terms is your agreement to that (see docs.firegiant.com/wix/osmf). That fee is between you and the WiX project.',
  'WinRelease is not affiliated with, endorsed by or sponsored by WiX, FireGiant or Microsoft. Windows, Windows Installer and Intune are trademarks of Microsoft.',
  'WinRelease is in beta. It is free while in beta, and GE App Solutions may change, limit or withdraw it at any time, so keep your own copy of anything you rely on (Export saves a project file).',
  disclaimerSigningLine(),
  'Need more than a basic MSI, or a package reviewed for a business? Talk to GE App Solutions (geappsolutions.com).',
]

function Block({ heading, icon, items }: { heading: string; icon: ReactNode; items: string[] }) {
  return (
    <div>
      <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
        {icon} {heading}
      </h3>
      <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  )
}
