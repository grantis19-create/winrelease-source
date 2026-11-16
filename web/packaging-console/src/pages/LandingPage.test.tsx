import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { HELPER_DOWNLOAD_URL } from '../state/helperLinks'
import { LANDING_FACTS, LandingPage } from './LandingPage'

describe('LandingPage', () => {
  it('offers the editor and the Helper download, and states the tested facts', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    )
    expect(screen.getAllByRole('link', { name: /Open the editor/ })[0].getAttribute('href')).toBe('/projects')
    expect(screen.getByRole('link', { name: /Download the Helper/ }).getAttribute('href')).toBe(HELPER_DOWNLOAD_URL)
    for (const fact of LANDING_FACTS) expect(screen.getByText(fact.title)).toBeTruthy()
    expect(screen.getByText('Grant Longworth')).toBeTruthy()
  })
})
