import { UserRound } from 'lucide-react'
import { geAppSolutionsUrl } from '../state/outbound'
import { Panel } from './ui/Panel'

/** Facts here come from geappsolutions.com (the owner's own site); keep the two in step and never claim more than that site does. */
export const MADE_BY_FACTS = {
  name: 'Grant Longworth',
  since: 2002,
  sectors: 'energy, government, broadcasting, finance and the NHS',
}

/** Who is behind WinRelease, for the pages where a visitor decides whether to trust it. */
export function WhoMadeThis({ placement }: { placement: string }) {
  return (
    <Panel icon={UserRound} title="Who made this">
      <div className="max-w-3xl space-y-2 text-sm text-muted">
        <p className="text-base font-semibold text-ink">{MADE_BY_FACTS.name}</p>
        <p>
          WinRelease is made by{' '}
          <a className="text-brand hover:underline" href={geAppSolutionsUrl(`${placement}-maker`)} target="_blank" rel="noreferrer">
            GE App Solutions
          </a>
          ; I am a Windows application packager. I have packaged Windows applications for enterprises since {MADE_BY_FACTS.since}, across {MADE_BY_FACTS.sectors}.
        </p>
        <p>
          WinRelease is the simple end of that work, built so the basic MSI is quick and free. For the hard installers (no silent switch, custom actions,
          licensing, prerequisite chains) and for packages for Intune or ConfigMgr, that is what GE App Solutions does by hand. You can also find me on{' '}
          <a className="text-brand hover:underline" href="https://www.linkedin.com/in/gelongworth/" target="_blank" rel="noreferrer">
            LinkedIn
          </a>
          .
        </p>
      </div>
    </Panel>
  )
}
