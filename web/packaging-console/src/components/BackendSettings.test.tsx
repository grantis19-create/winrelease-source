import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BackendSettings } from './BackendSettings'
import { getBackendConfig, resetResolvedBackend } from '../state/backend'

beforeEach(() => {
  localStorage.clear()
  resetResolvedBackend()
})

describe('BackendSettings', () => {
  it('reports no Helper detected and defaults to auto-detect when nothing is running on the configured port', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('NetworkError')))

    render(<BackendSettings />)

    expect(screen.getByLabelText(/Auto-detect/)).toBeChecked()
    await waitFor(() => expect(screen.getByText(/No Helper detected/i)).toBeInTheDocument())
  })

  it('reports a connected Helper with its version once the probe succeeds', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (String(url).endsWith('/health')) return Promise.resolve(new Response(null, { status: 200 }))
        return Promise.resolve(
          new Response(JSON.stringify({ version: '0.1.0' }), { status: 200, headers: { 'content-type': 'application/json' } }),
        )
      }),
    )

    render(<BackendSettings />)

    await waitFor(() => expect(screen.getByText(/Connected to the WinRelease Helper \(v0\.1\.0\)/i)).toBeInTheDocument())
  })

  it('saves the chosen mode and helper URL to the per-browser config', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('NetworkError')))

    render(<BackendSettings />)

    fireEvent.click(screen.getByLabelText(/Always use the local Helper/))
    fireEvent.change(screen.getByPlaceholderText('http://127.0.0.1:5601'), { target: { value: 'http://127.0.0.1:9999' } })
    fireEvent.click(screen.getByRole('button', { name: /Save Backend Settings/i }))

    expect(getBackendConfig()).toEqual({ mode: 'helper', helperUrl: 'http://127.0.0.1:9999' })
    expect(await screen.findByText('Saved.')).toBeInTheDocument()
  })

  it('hides the helper URL field once "Always use the hosted service" is selected', () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('NetworkError')))

    render(<BackendSettings />)

    fireEvent.click(screen.getByLabelText(/Always use the hosted service/))

    expect(screen.queryByPlaceholderText('http://127.0.0.1:5601')).not.toBeInTheDocument()
  })
})

describe('BackendSettings on the free site', () => {
  it('shows only the Helper address (under Advanced) and a quick-start link - there is no hosted service to choose', async () => {
    vi.resetModules()
    vi.doMock('../mode', () => ({ isMvpMode: () => true }))
    const { BackendSettings: Mvp } = await import('./BackendSettings')
    const { MemoryRouter } = await import('react-router-dom')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('NetworkError')))

    render(
      <MemoryRouter>
        <Mvp />
      </MemoryRouter>,
    )

    expect(screen.queryAllByRole('radio')).toHaveLength(0)
    expect(screen.getByPlaceholderText('http://127.0.0.1:5601')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('link', { name: /quick-start guide/i })).toBeInTheDocument())
    vi.doUnmock('../mode')
  })

  it('offers Start the Helper right in the panel while no Helper is running', async () => {
    vi.resetModules()
    vi.doMock('../mode', () => ({ isMvpMode: () => true }))
    const { BackendSettings: Mvp } = await import('./BackendSettings')
    const { MemoryRouter } = await import('react-router-dom')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('NetworkError')))

    render(
      <MemoryRouter>
        <Mvp />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('button', { name: /Start the Helper/i })).toBeInTheDocument()
    vi.doUnmock('../mode')
  })
})
