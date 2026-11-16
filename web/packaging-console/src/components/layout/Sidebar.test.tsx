import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Sidebar } from './Sidebar'
import { resetResolvedBackend, resolveBackend, setBackendConfig } from '../../state/backend'

beforeEach(() => {
  localStorage.clear()
  resetResolvedBackend()
})

describe('Sidebar backend indicator', () => {
  it('shows nothing while on the hosted backend - no change for anyone not using a Helper', async () => {
    setBackendConfig({ mode: 'hosted', helperUrl: 'http://127.0.0.1:5601' })
    vi.stubGlobal('fetch', vi.fn())

    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.queryByText(/Local Helper/)).not.toBeInTheDocument())
  })

  it('shows nothing on its own, even in helper mode - the Sidebar never probes by itself (ADR 0070), only something with a real reason to (Settings, an actual build/validate call) does', async () => {
    setBackendConfig({ mode: 'helper', helperUrl: 'http://127.0.0.1:5601' })
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.queryByText(/Local Helper/)).not.toBeInTheDocument())
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('shows a quiet confirmation once something else (e.g. Settings, or a real build/validate call) has started a probe and the Helper answers', async () => {
    setBackendConfig({ mode: 'helper', helperUrl: 'http://127.0.0.1:5601' })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ version: '0.1.0' }), { status: 200, headers: { 'content-type': 'application/json' } }),
      ),
    )

    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    )
    void resolveBackend()

    await waitFor(() => expect(screen.getByText('Local Helper v0.1.0')).toBeInTheDocument())
  })
})

describe('Sidebar What\'s new', () => {
  it('shows a dot until the page has been opened, then clears it', async () => {
    const { markNewsSeen } = await import('../../state/whatsNew')
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    )

    expect(screen.getByText('Release notes')).toBeInTheDocument()
    expect(screen.getByRole('status', { name: /New since you last looked/ })).toBeInTheDocument()

    markNewsSeen()
    await waitFor(() => expect(screen.queryByRole('status', { name: /New since you last looked/ })).not.toBeInTheDocument())
  })
})
