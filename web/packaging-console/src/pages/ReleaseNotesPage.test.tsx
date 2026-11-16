import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { HELPER_LATEST_VERSION, HELPER_SHA256 } from '../state/helperLinks'
import { CONSIDERING, KNOWN_LIMITATIONS, ReleaseNotesPage } from './ReleaseNotesPage'

describe('ReleaseNotesPage', () => {
  it('shows the current Helper version, its SHA-256 and the known limitations', () => {
    render(
      <MemoryRouter>
        <ReleaseNotesPage />
      </MemoryRouter>,
    )
    expect(screen.getByText(`Current Helper: v${HELPER_LATEST_VERSION}`)).toBeTruthy()
    expect(screen.getByText(HELPER_SHA256)).toBeTruthy()
    for (const item of KNOWN_LIMITATIONS) expect(screen.getByText(item)).toBeTruthy()
    expect(screen.getAllByText('Ideas we are considering').length).toBeGreaterThan(0)
    for (const item of CONSIDERING) expect(screen.getByText(item)).toBeTruthy()
  })
})
