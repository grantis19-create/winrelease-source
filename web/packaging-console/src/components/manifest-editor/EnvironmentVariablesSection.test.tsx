import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EnvironmentVariablesSection } from './EnvironmentVariablesSection'
import { createEmptyManifest } from '../../types/manifest'

function withVariables(...names: string[]) {
  return {
    ...createEmptyManifest(),
    environmentVariables: names.map((name) => ({ name, value: 'v', action: 'set' as const, part: 'all' as const, system: true, permanent: false, separator: ';' })),
  }
}

function openPanel() {
  const header = screen.getByText('Environment Variables')
  fireEvent.click(header)
}

describe('EnvironmentVariablesSection rename', () => {
  // The panel remembers whether it was left open, so each test starts from the default (collapsed).
  beforeEach(() => localStorage.clear())

  it('right-click > Rename edits the name in place and keeps the new name on Enter', () => {
    const onChange = vi.fn()
    render(<EnvironmentVariablesSection manifest={withVariables('FOO', 'BAR')} onChange={onChange} />)
    openPanel()

    fireEvent.contextMenu(screen.getByText('BAR'))
    fireEvent.click(screen.getByText('Rename'))
    const input = screen.getByLabelText('Variable name')
    fireEvent.change(input, { target: { value: 'BAZ' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0][0].environmentVariables.map((v: { name: string }) => v.name)).toEqual(['FOO', 'BAZ'])
  })

  it('Escape leaves the name as it was', () => {
    const onChange = vi.fn()
    render(<EnvironmentVariablesSection manifest={withVariables('FOO')} onChange={onChange} />)
    openPanel()

    fireEvent.contextMenu(screen.getByText('FOO'))
    fireEvent.click(screen.getByText('Rename'))
    const input = screen.getByLabelText('Variable name')
    fireEvent.change(input, { target: { value: 'CHANGED' } })
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(onChange).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('Variable name')).toBeNull()
  })
})
