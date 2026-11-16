import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { BuildPanel } from './BuildPanel'
import type { BuildState } from '../state/useBuild'

function state(overrides: Partial<BuildState>): BuildState {
  return {
    manualZip: null, setManualZip: vi.fn(), running: null, error: null, helperNeeded: false, log: null, results: [], hasStagedFiles: true,
    stagedCount: 2, sourceSummary: { files: 1, icons: 1, unused: 0 }, fingerprint: 'now', canRun: true, needsFiles: true, missingSources: [], blockedReason: null, run: vi.fn(),
    ...overrides,
  } as BuildState
}

function show(build: BuildState) {
  localStorage.clear()
  render(<MemoryRouter><BuildPanel build={build} /></MemoryRouter>)
  fireEvent.click(screen.getByText('Build Output')) // the panel starts collapsed
}

describe('BuildPanel', () => {
  it('says what the sources really are, not how many files are attached', () => {
    show(state({}))

    expect(screen.getByText(/from Files & Folders/)).toHaveTextContent('Using 1 file from Files & Folders and 1 icon file as sources.')
  })

  it('warns about attached files the project does not use', () => {
    show(state({ sourceSummary: { files: 1, icons: 0, unused: 2 } }))

    expect(screen.getByText(/will be ignored/)).toHaveTextContent('2 other attached files are not used by this project')
  })

  it('shows a build log after a successful build even when the compiler said nothing', () => {
    show(state({
      log: { standardOutput: '', standardError: '' },
      results: [{ kind: 'msi', url: 'blob:x', fileName: 'Sample-1.0.0.msi', builtAt: new Date(), bytes: 172032, sourceFiles: 2, fingerprint: 'now' }],
    }))

    expect(screen.getByText('Build log')).toBeInTheDocument()
    expect(screen.getByText(/Built Sample-1\.0\.0\.msi \(168 KB\) from 2 source files/)).toBeInTheDocument()
    expect(screen.getByText('wix build reported no warnings or errors.')).toBeInTheDocument()
  })

  it('keeps the compiler output verbatim after the summary line', () => {
    show(state({
      log: { standardOutput: 'WinRelease note: check the version', standardError: '' },
      results: [{ kind: 'msi', url: 'blob:x', fileName: 'Sample-1.0.0.msi', builtAt: new Date(), bytes: 2048, sourceFiles: 1, fingerprint: 'now' }],
    }))

    expect(screen.getByText('WinRelease note: check the version')).toBeInTheDocument()
    expect(screen.queryByText('wix build reported no warnings or errors.')).toBeNull()
  })

  it('warns when the MSI was built before the latest changes, and not when it is current', () => {
    const result = { kind: 'msi' as const, url: 'blob:x', fileName: 'Sample-1.0.0.msi', builtAt: new Date(), bytes: 2048, sourceFiles: 1 }
    show(state({ log: { standardOutput: '', standardError: '' }, results: [{ ...result, fingerprint: 'older' }] }))

    expect(screen.getByText(/built before your latest changes/)).toBeInTheDocument()
    expect(screen.getByText(/out of date/)).toBeInTheDocument()
  })

  it('shows no warning for a current build', () => {
    show(state({ log: { standardOutput: '', standardError: '' }, results: [{ kind: 'msi', url: 'blob:x', fileName: 'S.msi', builtAt: new Date(), bytes: 2048, sourceFiles: 1, fingerprint: 'now' }] }))

    expect(screen.queryByText(/built before your latest changes/)).toBeNull()
  })
})
