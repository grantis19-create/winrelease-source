import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { HELPER_DOWNLOAD_URL } from '../state/helperLinks'
import { LANDING_AUDIENCES, LANDING_FACTS, LandingPage } from './LandingPage'

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
    expect(screen.getByText('Who is this for?')).toBeTruthy()
    for (const audience of LANDING_AUDIENCES) expect(screen.getByText(audience.title)).toBeTruthy()
    expect(screen.getByText('What may come')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Tell us which one you would use/ }).getAttribute('href')).toBe('/support?topic=idea')
    // The maker is named in the "Who made this" box and in the footer.
    expect(screen.getAllByText('Grant Longworth').length).toBe(2)
  })
})
