import { ArrowRight, Download, FileCheck2, FolderTree, Hammer, Laptop2, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ScreenshotGallery, type Screenshot } from '../components/ScreenshotGallery'
import { WhoMadeThis } from '../components/WhoMadeThis'
import { HELPER_DOWNLOAD_URL, HELPER_LATEST_VERSION, HELPER_SIZE_LABEL } from '../state/helperLinks'

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
    title: 'Hostile input is refused',
    text: 'Zip bombs, path tricks and damaged files (54 of them) are all refused safely, instead of producing a broken installer.',
  },
  {
    title: 'Real software, wrapped and removed cleanly',
    text: '7-Zip, Git for Windows, GitHub CLI, Inno Setup and Notion were packaged and removed again without leftovers.',
  },
  {
    title: 'No account, no cookies, no profile of you',
    text: 'Visits are counted in aggregate only, and not at all if your browser says Do Not Track. See the Privacy page.',
  },
]

// Pairs share a thumbnail shape so each row lines up: two wide strips, then two taller panels (the taller one is cropped to its top; click for all of it).
export const LANDING_SCREENS: Screenshot[] = [
  { src: '/screens/general.jpg', width: 1984, height: 688, thumbAspect: 2.8, alt: 'The General section of the WinRelease editor', caption: 'General: product name, manufacturer, version, install folder and architecture.' },
  { src: '/screens/registry.jpg', width: 1984, height: 720, thumbAspect: 2.8, alt: 'The Registry section of the WinRelease editor with a few values', caption: 'Registry: keys on the left, their values on the right. Import a .reg file or add entries by hand.' },
  { src: '/screens/files-folders.jpg', width: 1984, height: 1056, thumbAspect: 1.88, alt: 'The Files and Folders section of the WinRelease editor', caption: 'Files & Folders: choose where each file installs, with the 32-bit and 64-bit places marked.' },
  { src: '/screens/appinfo.jpg', width: 1984, height: 1500, thumbAspect: 1.88, alt: 'The App Info and Installed Apps section of the WinRelease editor', caption: 'App Info: what Windows shows in Settings > Apps, the icon, install scope and the installer screens.' },
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
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand text-xs font-bold text-canvas">W</span>
          <span className="text-sm font-semibold">WinRelease.io</span>
          <span className="rounded border border-brand px-1 text-[10px] font-semibold uppercase tracking-wide text-brand">Beta</span>
        </div>
        <nav className="flex items-center gap-4 text-sm text-muted">
          <Link to="/release-notes" className="hover:text-ink">
            Release notes
          </Link>
          <Link to="/privacy" className="hover:text-ink">
            Privacy
          </Link>
          <Link to="/projects" className="rounded-md border border-subtle px-3 py-1.5 text-ink hover:bg-panel-alt">
            Open the editor
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-5xl px-6 pb-16">
        <section className="py-12 sm:py-16">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand">Free MSI builder for Windows</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold leading-tight sm:text-5xl">Build a basic MSI installer. Free, on your own PC.</h1>
          <p className="mt-5 max-w-2xl text-base text-muted">
            Describe your files, shortcuts and registry entries in the browser. WinRelease builds a standard Windows Installer package with WiX on your own
            computer, so your files never leave it. Made for the simple installer you keep needing and do not want to hand-write.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link to="/projects" className="inline-flex items-center gap-2 rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-canvas hover:bg-brand-hover">
              Open the editor <ArrowRight size={16} />
            </Link>
            <a href={HELPER_DOWNLOAD_URL} className="inline-flex items-center gap-2 rounded-md border border-subtle px-5 py-2.5 text-sm text-ink hover:bg-panel-alt">
              <Download size={16} /> Download the Helper
            </a>
          </div>
          <p className="mt-3 text-xs text-muted">
            Windows only. Beta, free while in beta. The Helper is an unsigned pre-release; its SHA-256 is on the{' '}
            <Link to="/release-notes" className="underline hover:text-ink">
              release notes
            </Link>
            .
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
              <span className="text-ink">Made for simple installers.</span> If you need custom actions, features, upgrades, signing, or enterprise packaging for Intune or
              ConfigMgr, that is what{' '}
              <a href="https://geappsolutions.com/" target="_blank" rel="noreferrer" className="text-brand hover:underline">
                GE App Solutions
              </a>{' '}
              does by hand.
            </p>
          </div>
        </section>

        <section className="py-4">
          <WhoMadeThis />
        </section>
      </main>

      <footer className="border-t border-subtle px-6 py-6 text-center text-xs text-muted">
        &copy; {new Date().getFullYear()} GE App Solutions. All rights reserved. WinRelease may not be copied, resold or redistributed.{' '}
        <Link to="/help#disclaimer" className="underline hover:text-ink">
          Disclaimer
        </Link>
        {' · '}
        <Link to="/privacy" className="underline hover:text-ink">
          Privacy
        </Link>
      </footer>
    </div>
  )
}
