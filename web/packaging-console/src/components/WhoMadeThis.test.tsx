import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { WhoMadeThis } from './WhoMadeThis'

describe('WhoMadeThis', () => {
  it('names GE App Solutions and links to its site', () => {
    render(<WhoMadeThis />)
    expect(screen.getByRole('link', { name: 'GE App Solutions' }).getAttribute('href')).toBe('https://geappsolutions.com/')
    expect(screen.getByText(/since 2002/)).toBeTruthy()
    expect(screen.getByText('Grant Longworth')).toBeTruthy()
  })
})
