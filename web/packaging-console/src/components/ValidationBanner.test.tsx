import { act, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ValidationBanner } from './ValidationBanner'
import { createEmptyManifest } from '../types/manifest'
import * as manifestApi from '../api/manifest'
import * as backend from '../state/backend'

describe('ValidationBanner', () => {
  it('shows a success state once POST /api/manifest/parse reports the manifest is valid', async () => {
    vi.spyOn(manifestApi, 'validateManifest').mockResolvedValue({ ok: true, manifest: createEmptyManifest() })

    render(<ValidationBanner manifest={createEmptyManifest()} />)

    await waitFor(() => expect(screen.getByText(/manifest is valid/i)).toBeInTheDocument())
  })

  it('lists field errors from a failed validation', async () => {
    vi.spyOn(manifestApi, 'validateManifest').mockResolvedValue({
      ok: false,
      errors: { shortcuts: ["Shortcut 'Desktop Shortcut' targets file 'old-icon', which is not declared in files.declared."] },
    })

    render(<ValidationBanner manifest={createEmptyManifest()} />)

    await waitFor(() => expect(screen.getByText(/1 validation issue/i)).toBeInTheDocument())
    expect(screen.getByText(/not declared in files\.declared/i)).toBeInTheDocument()
  })

  it('shows the field\'s on-screen label, not the raw manifest/JSON property name', async () => {
    vi.spyOn(manifestApi, 'validateManifest').mockResolvedValue({
      ok: false,
      errors: {
        name: ['name is required.'],
        targetDirectory: ["targetDirectory '' must start with a recognized WiX folder token."],
      },
    })

    render(<ValidationBanner manifest={createEmptyManifest()} />)

    await waitFor(() => expect(screen.getByText(/2 validation issues/i)).toBeInTheDocument())
    expect(screen.getByText(/^Product Name:/)).toBeInTheDocument()
    expect(screen.getByText(/^Install Directory:/)).toBeInTheDocument()
    expect(screen.queryByText(/^name:/)).not.toBeInTheDocument()
    expect(screen.queryByText(/^targetDirectory:/)).not.toBeInTheDocument()
  })

  it('points to the Helper calmly, without an error code, when the site has no backend', async () => {
    vi.spyOn(manifestApi, 'validateManifest').mockResolvedValue({ ok: false, failure: '404', helperNeeded: true })

    render(<MemoryRouter><ValidationBanner manifest={createEmptyManifest()} /></MemoryRouter>)

    await waitFor(() => expect(screen.getByRole('link', { name: /get the helper/i })).toHaveAttribute('href', '/settings#quick-start'))
    expect(screen.getByRole('button', { name: /start the helper/i })).toBeInTheDocument()
    expect(screen.queryByText(/404/)).not.toBeInTheDocument()
    expect(screen.queryByText(/couldn't be checked/i)).not.toBeInTheDocument()
  })

  it('still reports a real check failure with its status', async () => {
    vi.spyOn(manifestApi, 'validateManifest').mockResolvedValue({ ok: false, failure: '500 Server error' })

    render(<MemoryRouter><ValidationBanner manifest={createEmptyManifest()} /></MemoryRouter>)

    await waitFor(() => expect(screen.getByText(/couldn't be checked right now \(500 Server error\)/i)).toBeInTheDocument())
  })

  describe('when the Helper is started after the page first looked for it', () => {
    afterEach(() => vi.useRealTimers())

    it('notices it by itself and validates again, without pressing Check again', async () => {
      const validate = vi
        .spyOn(manifestApi, 'validateManifest')
        .mockResolvedValueOnce({ ok: false, failure: '404', helperNeeded: true })
        .mockResolvedValue({ ok: true, manifest: createEmptyManifest() })
      vi.spyOn(backend, 'resolveBackend').mockResolvedValue({ baseUrl: 'http://127.0.0.1:5601', isHelper: true })

      vi.useFakeTimers({ shouldAdvanceTime: true })
      render(<MemoryRouter><ValidationBanner manifest={createEmptyManifest()} /></MemoryRouter>)
      await waitFor(() => expect(screen.getByText(/run in the free WinRelease Helper/i)).toBeInTheDocument())

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5500)
      })

      await waitFor(() => expect(screen.getByText(/manifest is valid/i)).toBeInTheDocument())
      expect(validate).toHaveBeenCalledTimes(2)
    })

    it('keeps the banner while no Helper answers', async () => {
      vi.spyOn(manifestApi, 'validateManifest').mockResolvedValue({ ok: false, failure: '404', helperNeeded: true })
      vi.spyOn(backend, 'resolveBackend').mockResolvedValue({ baseUrl: '', isHelper: false })

      vi.useFakeTimers({ shouldAdvanceTime: true })
      render(<MemoryRouter><ValidationBanner manifest={createEmptyManifest()} /></MemoryRouter>)
      await waitFor(() => expect(screen.getByText(/run in the free WinRelease Helper/i)).toBeInTheDocument())

      await act(async () => {
        await vi.advanceTimersByTimeAsync(11000)
      })

      expect(screen.getByText(/run in the free WinRelease Helper/i)).toBeInTheDocument()
      expect(screen.queryByText(/manifest is valid/i)).not.toBeInTheDocument()
    })
  })
})
