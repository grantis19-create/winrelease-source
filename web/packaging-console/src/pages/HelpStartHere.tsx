import { ListChecks, RefreshCw, Rocket, Target, Terminal } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Panel } from '../components/ui/Panel'
import { geAppSolutionsUrl } from '../state/outbound'

/**
 * "Start here" for someone who has deployed loose files and never built an installer: why an MSI, what WinRelease is and is not for, one worked
 * example, how to install the result on other PCs, and how upgrades work. Plain words, no rules lists (the editor walkthrough below has those).
 * Every command and result here was run against a real build and a real install (docs/roadmap/help-start-here-draft.md has the notes); keep it that way.
 */

const SILENT_COMMANDS = String.raw`msiexec /i "C:\path\AcmeNotes.msi" /qn /norestart /l*v "C:\path\install.log"
msiexec /x "C:\path\AcmeNotes.msi" /qn /norestart
msiexec /fomus "C:\path\AcmeNotes.msi" /qn /norestart`

function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  )
}

export function StartHerePanels() {
  return (
    <>
      <Panel id="start" icon={Rocket} title="Start here: what an installer does for you" description="For anyone who copies files to deploy and wants to move to a proper installer.">
        <div className="flex max-w-3xl flex-col gap-3 text-sm text-ink">
          <p>
            <strong>Copying files works, until it does not.</strong> A folder of loose files is easy to hand over. But when you need to remove it, update it or check it, you
            are on your own: who has which version, what got left behind, what did the update overwrite?
          </p>
          <p>
            An MSI is a Windows installer file. Windows itself runs it and keeps a record of what it put where. That gives you:
          </p>
          <Bullets
            items={[
              <>
                <strong>Clean removal.</strong> Uninstall takes out what the installer put in: files, shortcuts and registry values.
              </>,
              <>
                <strong>Upgrades.</strong> A newer version replaces the old one, instead of sitting beside it.
              </>,
              <>
                <strong>Repair.</strong> Windows can put back files that were deleted by mistake.
              </>,
              <>
                <strong>A normal entry in Settings &gt; Apps</strong>, with your name, version and publisher.
              </>,
              <>
                <strong>Silent installs</strong> for scripts and deployment tools, with no questions asked (see “Installing it on other PCs” below).
              </>,
            ]}
          />
          <p className="text-muted">
            You describe the result you want: which files go where, which shortcuts, which registry values. WinRelease builds the MSI from that description.
          </p>
        </div>
      </Panel>

      <Panel id="scope" icon={Target} title="What WinRelease is for, and not for">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Good for</h3>
            <Bullets
              items={[
                'Getting a program, a set of files or a tool from a folder to an installed, removable, upgradable package.',
                'Packages that do only part of the job. You do not need a program to install: a package can deliver just registry values, just environment variables (for example a PATH entry), just shortcuts (to a web address, or to a program already on the PC) or just a set of files such as templates or settings.',
                'Installs for one user that need no administrator rights, and installs for everyone on the PC.',
              ]}
            />
          </div>
          <div>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Not for</h3>
            <Bullets
              items={[
                'Custom install logic: code or scripts that run during install, Windows services, merge modules and patches.',
                'Letting the person installing choose which parts to install.',
                'Opening other formats. WinRelease opens only its own project files, not WiX source or other installers.',
                <>
                  Packages for Intune or Configuration Manager. The MSI it makes can be deployed by those tools like any other MSI, but WinRelease does not produce their packages. See{' '}
                  <Link to="/release-notes#limitations" className="text-brand hover:underline">
                    What it does not do
                  </Link>
                  .
                </>,
              ]}
            />
          </div>
        </div>
        <p className="mt-3 text-sm text-muted">
          Need more than this? That is what{' '}
          <a href={geAppSolutionsUrl('help-scope')} target="_blank" rel="noreferrer" className="text-brand hover:underline">
            GE App Solutions
          </a>{' '}
          does by hand.
        </p>
      </Panel>

      <Panel id="first" icon={ListChecks} title="Your first package, step by step" description="A worked example from a folder of files to an installed, upgraded and removed app.">
        <div className="flex max-w-3xl flex-col gap-3 text-sm text-ink">
          <p>
            You have a small tool: <code className="font-mono">acmenotes.exe</code>, a <code className="font-mono">config.ini</code> and a{' '}
            <code className="font-mono">templates</code> folder, all in one folder on your PC. You want an installer that puts them in Program Files, adds a Start Menu
            shortcut and can be removed cleanly.
          </p>
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              <strong>Start the Helper</strong> (the dot in Helper &amp; Tools is green) and press <strong>New Project</strong> on the Projects page.
            </li>
            <li>
              <strong>General.</strong> Product Name <code className="font-mono">Acme Notes</code>, Manufacturer <code className="font-mono">Acme Ltd</code>, Product Version{' '}
              <code className="font-mono">1.0.0</code>. Leave the Install Directory as suggested, or use the folder button to pick Program Files. Leave the Upgrade Code alone.
            </li>
            <li>
              <strong>Files &amp; Folders.</strong> In the tree, select the Install Directory folder (it is named after the end of the path in General). Press{' '}
              <strong>Import Directory</strong> and choose your folder, or drag it in. Your files and the <code className="font-mono">templates</code> folder now sit under it.
            </li>
            <li>
              <strong>Shortcuts.</strong> Right-click <code className="font-mono">acmenotes.exe</code> in Files &amp; Folders and choose <strong>Create Shortcut</strong>. Pick Start Menu
              and name it <code className="font-mono">Acme Notes</code>.
            </li>
            <li>
              <strong>Build.</strong> Check the green “Manifest is valid” bar at the top and press <strong>Build MSI</strong>. When it finishes, download the .msi.
            </li>
            <li>
              <strong>Try it on a spare PC or a virtual machine, not your own.</strong> Double-click the MSI and install it. Look for Acme Notes in Settings &gt; Apps and start it from the
              Start Menu. Then uninstall it and check that the files and the shortcut are gone.
            </li>
            <li>
              <strong>Make version 1.1.</strong> Change the Product Version to <code className="font-mono">1.1.0</code>, build again, and install the new MSI over the old one. It should
              replace it, not install a second copy. That is how you check upgrades work before anyone else relies on them.
            </li>
          </ol>
          <p>
            <strong>Keep your users’ own settings out of the files you ship.</strong> A normal repair brings back a file that was deleted but leaves one the user has changed alone, and an
            upgrade replaces every file the new version ships, edited or not. Let your program create its settings file the first time it runs, in the user’s own profile folder,
            not in the installer.
          </p>
        </div>
      </Panel>
    </>
  )
}

/** Shown after the editor walkthrough: how to install the result elsewhere, and how upgrades work. Both start collapsed. */
export function GoingFurtherPanels() {
  return (
    <>
      <Panel id="deploy" icon={Terminal} title="Going further: installing it on other PCs" defaultCollapsed>
        <div className="flex max-w-3xl flex-col gap-3 text-sm text-ink">
          <p>An MSI can be double-clicked, or run from a script or a deployment tool with no windows at all. These are standard Windows Installer commands: install, remove and repair.</p>
          <pre className="overflow-x-auto rounded-md border border-subtle bg-canvas p-3 font-mono text-xs text-ink">{SILENT_COMMANDS}</pre>
          <Bullets
            items={[
              <>
                <code className="font-mono">/i</code> installs, <code className="font-mono">/x</code> removes and <code className="font-mono">/fomus</code> repairs. <code className="font-mono">/qn</code> means no
                windows, <code className="font-mono">/norestart</code> stops it restarting the PC, and <code className="font-mono">/l*v</code> writes a detailed log.
              </>,
              'Run an install for everyone on the PC from an elevated (administrator) prompt. An install for one user needs no elevation.',
              <>
                The exit code says what happened: <code className="font-mono">0</code> success, <code className="font-mono">3010</code> success but a restart is needed,{' '}
                <code className="font-mono">1605</code> nothing to remove, <code className="font-mono">1638</code> another version is already installed, and{' '}
                <code className="font-mono">1603</code> a fatal error. For 1603 the log says why: search it for <code className="font-mono">return value 3</code>.
              </>,
              'Installing the same MSI over itself is safe.',
              'Deployment tools such as Intune, Configuration Manager or Group Policy software installation can use the same MSI. Test the install and the uninstall with the commands above first.',
            ]}
          />
        </div>
      </Panel>

      <Panel id="upgrades" icon={RefreshCw} title="Going further: how upgrades work, and one trap" defaultCollapsed>
        <div className="flex max-w-3xl flex-col gap-3 text-sm text-ink">
          <p>Every build makes a major upgrade: each version replaces the one before. Windows tells versions apart with four identifiers, and WinRelease handles them for you.</p>
          <Bullets
            items={[
              <>
                <strong>Upgrade Code</strong> (General): the same for every version of the product. Set once, and never change it after you ship.
              </>,
              <>
                <strong>Product Version</strong>: raise it for every release.
              </>,
              <>
                <strong>Product Code</strong>: different for every build. Left alone, WinRelease makes a new random one each time you build, the way WiX does, and that is what lets a new
                version, or a rebuild of the same version, replace the old one.
              </>,
              <>
                <strong>Package Code</strong>: a fresh one for every build, made for you. There is nothing to set.
              </>,
            ]}
          />
          <p>
            <strong>The trap:</strong> if you set the Product Code by hand (the wand button or a pasted value), it stays the same for every version. A new version with the same Product Code is{' '}
            <strong>refused</strong> by Windows (“another version of this product is already installed”) instead of upgrading. The editor shows a Pinned tag and a warning when this is the case. Use{' '}
            <strong>Back to automatic</strong> unless you know you need a fixed code.
          </p>
        </div>
      </Panel>
    </>
  )
}
