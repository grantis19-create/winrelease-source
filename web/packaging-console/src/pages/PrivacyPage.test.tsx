import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { PrivacyPage } from './PrivacyPage'

describe('PrivacyPage', () => {
  it('renders the main sections', () => {
    render(
      <MemoryRouter>
        <PrivacyPage />
      </MemoryRouter>,
    )
    expect(screen.getByText('What we do not collect')).toBeTruthy()
    expect(screen.getByText('What stays in your browser')).toBeTruthy()
    expect(screen.getByText('The Helper on your computer')).toBeTruthy()
  })
})

describe('PrivacyPage without a token', () => {
  it('says no visitors are counted in a build with analytics off', () => {
    render(
      <MemoryRouter>
        <PrivacyPage />
      </MemoryRouter>,
    )
    expect(screen.getByText(/No visitor analytics/)).toBeTruthy()
    expect(screen.queryByText('Counting visits')).toBeNull()
  })
})

describe('PrivacyPage with a token', () => {
  it('describes the visit counting in a build that has analytics on', async () => {
    vi.stubEnv('VITE_CF_BEACON_TOKEN', 'abc')
    vi.resetModules()
    const { PrivacyPage: Page } = await import('./PrivacyPage')
    render(
      <MemoryRouter>
        <Page />
      </MemoryRouter>,
    )
    expect(screen.getByText('Counting visits')).toBeTruthy()
    expect(screen.queryByText(/No visitor analytics/)).toBeNull()
    vi.unstubAllEnvs()
  })
})
