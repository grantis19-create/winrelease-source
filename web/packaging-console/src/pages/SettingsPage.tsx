import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getAccount, setAccountStorage } from '../api/accounts'
import { getCurrentAccountId } from '../api/currentAccount'
import { apiErrorMessage } from '../state/errorMessage'
import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useBackendStatus } from '../state/backend'
import { isMvpMode } from '../mode'
import { AppLayout } from '../components/layout/AppLayout'
import { BackendSettings } from '../components/BackendSettings'
import { AboutHelperPanel, HelperDownloadPanel, HelperSetupPanel, HelperTroubleshootingPanel, MoreThanBasicPanel } from '../components/HelperHelp'
import { StorageSettings } from '../components/StorageSettings'
import { ThemeSettings } from '../components/ThemeSettings'

export function SettingsPage() {
  const mvp = isMvpMode()
  const accountId = getCurrentAccountId()!
  const queryClient = useQueryClient()
  const status = useBackendStatus()
  const { hash } = useLocation()

  // A link like /settings#troubleshooting opens that section and scrolls to it; with no Helper running, the setup sections are open so the way
  // forward is on screen without hunting for it.
  const noHelper = mvp && status !== null && !status.isHelper
  const open = (id: string) => hash === `#${id}`
  useEffect(() => {
    if (hash) setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' }), 100)
  }, [hash])

  // MVP mode has no server-side Account/storage to configure (docs/roadmap/free-compiler-mvp.md) -
  // only Backend applies there. `enabled: !mvp` keeps this query from ever hitting the
  // never-mapped /api/accounts route in that mode.
  const { data: account, isLoading } = useQuery({
    queryKey: ['account', accountId],
    queryFn: () => getAccount(accountId),
    enabled: !mvp,
  })

  const saveStorage = useMutation({
    mutationFn: (storage: NonNullable<Parameters<typeof setAccountStorage>[1]>) => setAccountStorage(accountId, storage),
    onSuccess: (updated) => queryClient.setQueryData(['account', accountId], updated),
  })

  return (
    <AppLayout>
      <h1 className="text-lg font-semibold text-ink">Settings</h1>

      <BackendSettings />

      <ThemeSettings />

      {/* The same help the top-bar Helper & Tools menu links to, folded under the connection settings so it is findable from here too. */}
      {mvp && (
        <>
          <HelperDownloadPanel defaultCollapsed forceExpanded={noHelper || open('download')} />
          <HelperSetupPanel defaultCollapsed forceExpanded={noHelper || open('quick-start')} />
          <AboutHelperPanel defaultCollapsed forceExpanded={open('about')} />
          <HelperTroubleshootingPanel defaultCollapsed forceExpanded={open('troubleshooting')} />
          <MoreThanBasicPanel defaultCollapsed />
        </>
      )}

      {!mvp && isLoading && <p className="text-sm text-muted">Loading…</p>}
      {!mvp && account && (
        <StorageSettings
          current={account.storage}
          allowInherit={false}
          saving={saveStorage.isPending}
          saved={saveStorage.isSuccess}
          error={apiErrorMessage(saveStorage.error)}
          onSave={(storage) => storage && saveStorage.mutate(storage)}
        />
      )}
    </AppLayout>
  )
}
