import { ArrowRight, Code2, Download, FileCheck2, FolderTree, Hammer, Laptop2, Lightbulb, Package, ShieldCheck, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ScreenshotGallery, type Screenshot } from '../components/ScreenshotGallery'
import { HeroFlow } from '../components/HeroFlow'
import { MADE_BY_FACTS, WhoMadeThis } from '../components/WhoMadeThis'
import { COMPANY, companyLine } from '../state/company'
import { landingNote } from '../state/helperSigning'
import { geAppSolutionsUrl } from '../state/outbound'
import { HELPER_DOWNLOAD_URL, HELPER_LATEST_VERSION, HELPER_SIZE_LABEL } from '../state/helperLinks'
import { THIRD_PARTY_NOTICES_URL } from '../state/supportReport'
import { CONSIDERING } from './ReleaseNotesPage'

/** The few numbers the page is allowed to state. They are the tested ones from Build Help > How WinRelease is tested; change them together. */
export const LANDING_FACTS = [
  {
    title: 'A real MSI, from the real WiX compiler',
    text: 'Not a wrapper or a stub. WinRelease writes the WiX source and builds a standard Windows Installer package on your own PC.',
  },
  {
    title: 'Your files never leave your computer',
    text: 'Builds run in a small Helper on your PC. The website does not receive your project, your files or your MSI.',
  },
  {
    title: '200 test packages, about 1,800 checks on real installs',
    text: 'Install, repair, upgrade and uninstall on a clean Windows 11 PC, with nothing left behind. All pass.',
  },
  {
    title: 'Bad input is refused',
    text: 'Damaged files and unsafe inputs are refused with a clear message, instead of producing a broken installer.',
  },
  {
    title: 'Real software, wrapped and removed cleanly',
    text: '7-Zip, Git for Windows, GitHub CLI and Notion were packaged and removed again without leftovers.',
  },
  {
    title: 'No account, no cookies, no profile of you',
    text: 'Visits are counted in aggregate only, and not at all if your browser says Do Not Track. See the Privacy page.',
  },
]

// Pairs share a thumbnail shape so each row lines up: General and Registry at 2.15 (both show almost whole), then two taller panels (the taller one is cropped to its top; click for all of it).
export const LANDING_SCREENS: Screenshot[] = [
  { src: '/screens/general.jpg', width: 2016, height: 938, thumbAspect: 2.15, alt: 'The General section of the WinRelease editor', caption: 'General: product name, manufacturer, version, install folder and architecture.' },
  { src: '/screens/registry.jpg', width: 1984, height: 960, thumbAspect: 2.15, alt: 'The Registry section of the WinRelease editor with a few values', caption: 'Registry: keys on the left, their values on the right. Import a .reg file or add entries by hand.' },
  { src: '/screens/files-folders.jpg', width: 1984, height: 1120, thumbAspect: 1.88, alt: 'The Files and Folders section of the WinRelease editor', caption: 'Files & Folders: choose where each file installs, with the 32-bit and 64-bit places marked.' },
  { src: '/screens/appinfo.jpg', width: 1984, height: 1500, thumbAspect: 1.88, alt: 'The App Info and Installed Apps section of the WinRelease editor', caption: 'App Info: what Windows shows in Settings > Apps, the icon, install scope and the installer screens.' },
]

/** Who the free tool is for. Only things the tests cover: files, registry entries, shortcuts and environment variables, with or without a full application. */
export const LANDING_AUDIENCES = [
  {
    icon: Users,
    title: 'IT admins',
    text: 'Roll out registry settings, config files or a small tool to many PCs as one MSI, and keep your own installers for what you deploy.',
  },
  {
    icon: Code2,
    title: 'Developers, including those building with AI coding tools',
    text: 'You made a tool, script or app and need a proper Windows installer for it, without learning WiX first.',
  },
  {
    icon: Package,
    title: 'Anyone with something to distribute',
    text: 'It does not have to be a full application. Shared files, a shortcut, a registry setting or an environment variable can be an MSI too.',
  },
]

const STEPS = [
  {
    icon: Laptop2,
    title: 'Get the Helper',
    text: `One small download (v${HELPER_LATEST_VERSION}, ${HELPER_SIZE_LABEL}). Run it once and it installs for your Windows user, with no administrator rights. It builds on your PC.`,
  },
  {
    icon: FolderTree,
    title: 'Describe your package',
    text: 'Add your files, shortcuts, registry entries and environment variables, and set the name, version and install scope. Or try the sample project.',
  },
  {
    icon: Hammer,
    title: 'Build the MSI',
    text: 'One click builds a real MSI, checks it, and keeps it ready to download. Install it, repair it, remove it, upgrade it.',
  },
]

/** The front page of the free site: what WinRelease is, what it does not do, and a way in. Shown at / in the free (MVP) site only. */
export function LandingPage() {
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand text-xs font-bold text-canvas">W</span>
          <span className="text-sm font-semibold">WinRelease.io</span>
          <span className="rounded border border-brand px-1 text-[10px] font-semibold uppercase tracking-wide text-brand">Beta</span>
        </div>
        <nav className="flex items-center gap-4 text-sm text-muted">
          <Link to="/help" className="hidden hover:text-ink sm:inline">
            Build Help
          </Link>
          <Link to="/release-notes" className="hover:text-ink">
            Release notes
          </Link>
          <Link to="/privacy" className="hidden hover:text-ink sm:inline">
            Privacy
          </Link>
          <Link to="/projects" className="rounded-md border border-subtle px-3 py-1.5 text-ink hover:bg-panel-alt">
            Open the editor
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-16">
        <section className="grid items-center gap-10 py-12 sm:py-16 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-14">
          <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-brand">Free MSI builder for Windows</p>
          <h1 className="mt-3 max-w-4xl text-4xl font-semibold leading-tight sm:text-5xl">Build a basic MSI installer. Free, on your own PC.</h1>
          <p className="mt-5 max-w-3xl text-base text-muted">
            Describe your files, shortcuts and registry entries in the browser. WinRelease builds a standard Windows Installer package with WiX on your own
            computer, so your files never leave it.
          </p>
          <div className="mt-7 hidden flex-wrap items-center gap-3 md:flex">
            <Link to="/projects" className="inline-flex items-center gap-2 rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-canvas hover:bg-brand-hover">
              Open the editor <ArrowRight size={16} />
            </Link>
            <a href={HELPER_DOWNLOAD_URL} className="inline-flex items-center gap-2 rounded-md border border-subtle px-5 py-2.5 text-sm text-ink hover:bg-panel-alt">
              <Download size={16} /> Download the Helper
            </a>
          </div>
          <p className="mt-7 rounded-lg border border-subtle bg-panel p-4 text-sm text-ink md:hidden">
            WinRelease builds installers on a Windows PC. Open this page on your computer to get started.
          </p>
          <p className="mt-4 hidden max-w-3xl text-sm text-muted md:block">
            <span className="text-ink">New here?</span> Open the editor and try the sample project first. You only need the Helper when you build.
          </p>
          <p className="mt-4 max-w-3xl text-sm text-muted">
            Built by{' '}
            <a href={geAppSolutionsUrl('landing-hero')} target="_blank" rel="noreferrer" className="text-brand hover:underline">
              GE App Solutions
            </a>
            . Enterprise Windows packaging experience since {MADE_BY_FACTS.since}: {MADE_BY_FACTS.sectors}.
          </p>
          </div>
          <HeroFlow />
        </section>

        <section aria-label="Before you start" className="pb-2">
          <div className="rounded-lg border border-subtle bg-panel px-4 py-3 text-xs text-muted">
          <p>
            Building also needs the WiX Toolset and the .NET SDK, which you install yourself: the{' '}
            <Link to="/settings#quick-start" className="underline hover:text-ink">
              setup guide
            </Link>{' '}
            walks you through it, and the Helper tells you if something is missing. WiX has its own terms, including a maintenance fee for organisations over US$10,000 in annual
            revenue (see the{' '}
            <Link to="/help#disclaimer" className="underline hover:text-ink">
              Disclaimer
            </Link>
            ).
          </p>
          <p className="mt-2">
            Windows only. Beta, free while in beta. {landingNote()}{' '}
            <Link to="/release-notes" className="underline hover:text-ink">
              release notes
            </Link>
            .
          </p>
          </div>
        </section>

        <section aria-labelledby="who" className="py-4">
          <h2 id="who" className="text-xs font-semibold uppercase tracking-widest text-muted">
            Who is this for?
          </h2>
          <ul className="mt-4 grid gap-4 sm:grid-cols-3">
            {LANDING_AUDIENCES.map((audience) => (
              <li key={audience.title} className="rounded-lg border border-subtle bg-panel p-5">
                <audience.icon size={18} className="text-brand" />
                <h3 className="mt-2 text-sm font-semibold">{audience.title}</h3>
                <p className="mt-1.5 text-sm text-muted">{audience.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="ideas" className="py-8">
          <h2 id="ideas" className="text-xs font-semibold uppercase tracking-widest text-muted">
            What may come
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Ideas we are considering, not promises and not dated. Come back to see what has arrived, or tell us which one you would use.
          </p>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {CONSIDERING.map((idea) => (
              <li key={idea} className="flex items-start gap-2.5 rounded-lg border border-subtle bg-panel p-4 text-sm text-muted">
                <Lightbulb size={16} className="mt-0.5 shrink-0 text-brand" />
                <span>{idea}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm">
            <Link to="/support?topic=idea" className="text-brand hover:underline">
              Tell us which one you would use
            </Link>
          </p>
        </section>

        <section aria-labelledby="how" className="py-8">
          <h2 id="how" className="text-xs font-semibold uppercase tracking-widest text-muted">
            How it works
          </h2>
          <ol className="mt-4 grid gap-4 sm:grid-cols-3">
            {STEPS.map((step, index) => (
              <li key={step.title} className="rounded-lg border border-subtle bg-panel p-5">
                <div className="flex items-center gap-2 text-brand">
                  <step.icon size={18} />
                  <span className="text-xs font-semibold uppercase tracking-wide">Step {index + 1}</span>
                </div>
                <h3 className="mt-2 text-base font-semibold">{step.title}</h3>
                <p className="mt-1.5 text-sm text-muted">{step.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="screens" className="py-8">
          <h2 id="screens" className="text-xs font-semibold uppercase tracking-widest text-muted">
            The editor
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-muted">Real screens from the site, showing the sample project that ships with it. Click any of them to see it full size.</p>
          <div className="mt-4">
            <ScreenshotGallery shots={LANDING_SCREENS} />
          </div>
        </section>

        <section aria-labelledby="facts" className="py-8">
          <h2 id="facts" className="text-xs font-semibold uppercase tracking-widest text-muted">
            What you can rely on
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {LANDING_FACTS.map((fact) => (
              <div key={fact.title} className="rounded-lg border border-subtle bg-panel p-5">
                <ShieldCheck size={16} className="text-brand" />
                <h3 className="mt-2 text-sm font-semibold">{fact.title}</h3>
                <p className="mt-1.5 text-sm text-muted">{fact.text}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm text-muted">
            <Link to="/help#testing" className="text-brand hover:underline">
              How WinRelease is tested
            </Link>
            {' · '}
            <Link to="/release-notes#limitations" className="text-brand hover:underline">
              What it does not do
            </Link>
            {' · '}
            <Link to="/help#inspect" className="text-brand hover:underline">
              Read the source
            </Link>
          </p>
        </section>

        <section className="py-8">
          <div className="flex items-start gap-3 rounded-lg border border-subtle bg-panel p-5">
            <FileCheck2 size={18} className="mt-0.5 shrink-0 text-brand" />
            <p className="text-sm text-muted">
              <span className="text-ink">Made for simple installers.</span> If you need custom actions, selectable features, or enterprise packaging for Intune or
              ConfigMgr, that is what{' '}
              <a href={geAppSolutionsUrl('landing')} target="_blank" rel="noreferrer" className="text-brand hover:underline">
                GE App Solutions
              </a>{' '}
              does by hand.
            </p>
          </div>
        </section>

        <section className="py-4">
          <WhoMadeThis placement="landing" />
        </section>
      </main>

      <footer className="border-t border-subtle px-6 py-6 text-center text-xs text-muted">
        &copy; {new Date().getFullYear()} {COMPANY.name}. All rights reserved. WinRelease may not be copied, resold or redistributed.{' '}
        <Link to="/help#disclaimer" className="underline hover:text-ink">
          Disclaimer
        </Link>
        {' · '}
        <Link to="/privacy" className="underline hover:text-ink">
          Privacy
        </Link>
        {' · '}
        <Link to="/help" className="underline hover:text-ink">
          Build Help
        </Link>
        {' · '}
        <Link to="/support" className="underline hover:text-ink">
          Feedback &amp; Support
        </Link>
        {' · '}
        <Link to="/release-notes" className="underline hover:text-ink">
          Release notes
        </Link>
        {' · '}
        <a href={THIRD_PARTY_NOTICES_URL} target="_blank" rel="noreferrer" className="underline hover:text-ink">
          Third-party notices
        </a>
        <span className="mt-1 block">{companyLine()}</span>
        <span className="mt-1 block">
          Made by{' '}
          <a href="https://www.linkedin.com/in/gelongworth/" target="_blank" rel="noreferrer" className="underline hover:text-ink">
            {MADE_BY_FACTS.name}
          </a>
          .
        </span>
      </footer>
    </div>
  )
}
