import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { GoingFurtherPanels, StartHerePanels } from './HelpStartHere'

function renderPanels() {
  return render(
    <MemoryRouter>
      <StartHerePanels />
      <GoingFurtherPanels />
    </MemoryRouter>,
  )
}

describe('Help: Start here', () => {
  it('has the five start-here panels, each reachable by the anchors the Help nav links to', () => {
    const { container } = renderPanels()
    for (const id of ['start', 'scope', 'first', 'deploy', 'upgrades']) {
      expect(container.querySelector(`#${id}`), id).not.toBeNull()
    }
  })

  it('says a package can be just shortcuts, registry values or environment variables, and what it is not for', () => {
    renderPanels()
    expect(screen.getByText(/just registry values, just environment variables/)).toBeTruthy()
    expect(screen.getByText(/Windows services, merge modules and patches/)).toBeTruthy()
  })

  it('gives the silent install, remove and repair commands', () => {
    const { container } = renderPanels()
    // The "Going further" panels start collapsed, so open this one first.
    fireEvent.click(screen.getByText(/Going further: installing it on other PCs/))
    const commands = container.querySelector('pre')?.textContent ?? ''
    expect(commands).toContain('msiexec /i')
    expect(commands).toContain('/x')
    expect(commands).toContain('/fomus')
    expect(commands).toContain('/l*v')
  })

  it('explains the pinned Product Code trap in the same words as the editor warning', () => {
    renderPanels()
    fireEvent.click(screen.getByText(/Going further: how upgrades work/))
    expect(screen.getByText(/another version of this product is already installed/, { exact: false })).toBeTruthy()
    expect(screen.getByText('Back to automatic')).toBeTruthy()
  })
})
