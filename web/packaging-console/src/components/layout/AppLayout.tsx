import type { ReactNode } from 'react'
import { HelperPermissionNotice } from '../HelperPermissionNotice'
import { HelperMenu } from './HelperMenu'
import { Sidebar } from './Sidebar'

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen bg-canvas text-ink">
      <Sidebar />
      <main className="flex-1 overflow-auto px-8 py-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-5">
          <HelperMenu />
          <HelperPermissionNotice />
          {children}
          <p className="pb-2 text-xs text-muted">
            WinRelease makes basic MSI installers, free. Need more than a basic MSI?{' '}
            <a href="https://geappsolutions.com/" target="_blank" rel="noreferrer" className="text-brand hover:underline">
              Talk to GE App Solutions
            </a>
            .
          </p>
        </div>
      </main>
    </div>
  )
}
