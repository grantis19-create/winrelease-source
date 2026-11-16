import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { WhoMadeThis } from './WhoMadeThis'

describe('WhoMadeThis', () => {
  it('names GE App Solutions and links to its site, tagged with where the link was', () => {
    render(<WhoMadeThis placement="landing" />)
    const href = new URL(screen.getByRole('link', { name: 'GE App Solutions' }).getAttribute('href')!)
    expect(href.origin).toBe('https://geappsolutions.com')
    expect(href.searchParams.get('utm_campaign')).toBe('landing-maker')
    expect(screen.getByText(/since 2002/)).toBeTruthy()
    expect(screen.getByText('Grant Longworth')).toBeTruthy()
  })
})
