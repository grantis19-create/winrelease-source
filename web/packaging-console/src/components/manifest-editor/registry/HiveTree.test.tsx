import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createEmptyManifest } from '../../../types/manifest'
import { HiveTree } from './HiveTree'

const noop = () => {}

function renderTree(architecture: 'x64' | 'x86', registry: { root: 'hklm' | 'hkcu'; key: string }[] = []) {
  const manifest = {
    ...createEmptyManifest(),
    architecture,
    registry: registry.map((e) => ({ ...e, name: 'V', value: '1', valueType: 'string' as const })),
  }
  return render(<HiveTree manifest={manifest} activeTarget={{ root: 'hklm', keyPrefix: '' }} onSelectTarget={noop} pendingKeys={{}} onContextMenu={noop} />)
}

/** Opens a branch: the chevron is the first span inside the node's button. */
function expand(label: string, index = 0) {
  const button = screen.getAllByText(label)[index].closest('button')!
  fireEvent.click(button.querySelector('span')!)
}

describe('HiveTree 32-bit staging', () => {
  it('stages a greyed SOFTWARE and WOW6432Node under HKLM in a 64-bit package, with a 32-bit tag', () => {
    renderTree('x64')
    expand('SOFTWARE')
    const node = screen.getByText('WOW6432Node').closest('button')!
    expect(node.className).toContain('opacity-60')
    expect(node.textContent).toContain('32-bit')
  })

  it('stages nothing in a 32-bit package', () => {
    renderTree('x86')
    expect(screen.queryByText('SOFTWARE')).toBeNull()
    expect(screen.queryByText('WOW6432Node')).toBeNull()
  })

  it('stages nothing under the current user', () => {
    renderTree('x64')
    const hkcu = screen.getByText('HKEY_CURRENT_USER').closest('button')!
    expect(hkcu.querySelector('svg.lucide-chevron-right')).toBeNull()
    expect(hkcu.querySelector('svg.lucide-chevron-down')).toBeNull()
  })

  it('shows a real WOW6432Node normally once it holds a value, and flags one nested inside another', () => {
    renderTree('x64', [
      { root: 'hklm', key: 'SOFTWARE\\WOW6432Node\\Acme' },
      { root: 'hklm', key: 'SOFTWARE\\WOW6432Node\\WOW6432Node\\Bad' },
    ])
    expand('SOFTWARE')
    const node = screen.getAllByText('WOW6432Node')[0].closest('button')!
    expect(node.className).not.toContain('opacity-60')
    expand('WOW6432Node')
    expect(document.querySelector('[title^="A WOW6432Node inside a WOW6432Node"]')).not.toBeNull()
  })
})
