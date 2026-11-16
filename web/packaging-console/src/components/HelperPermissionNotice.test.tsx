import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HelperPermissionNotice } from './HelperPermissionNotice'
import { resetResolvedBackend, resolveBackend, setBackendConfig } from '../state/backend'

beforeEach(() => {
  localStorage.clear()
  resetResolvedBackend()
})

describe('HelperPermissionNotice', () => {
  it('never probes on its own - stays hidden if nothing else has started one', () => {
    setBackendConfig({ mode: 'auto', helperUrl: 'http://127.0.0.1:5601' })
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    render(<HelperPermissionNotice />)

    expect(screen.queryByText(/access other apps and services on this device/i)).not.toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('shows once something else (Settings, or a real build/validate call) has started a probe that is still in flight, so it is on screen before the browser prompt can appear', () => {
    setBackendConfig({ mode: 'auto', helperUrl: 'http://127.0.0.1:5601' })
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {}))) // never resolves - simulates "still checking"
    void resolveBackend()

    render(<HelperPermissionNotice />)

    expect(screen.getByText(/access other apps and services on this device/i)).toBeInTheDocument()
  })

  it('hides itself once that probe resolves', async () => {
    setBackendConfig({ mode: 'auto', helperUrl: 'http://127.0.0.1:5601' })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('NetworkError')))
    void resolveBackend()

    render(<HelperPermissionNotice />)

    await waitFor(() => expect(screen.queryByText(/access other apps and services/i)).not.toBeInTheDocument())
  })

  it('never shows in hosted mode, even if something calls resolveBackend() - that mode never touches the local network', async () => {
    setBackendConfig({ mode: 'hosted', helperUrl: 'http://127.0.0.1:5601' })
    vi.stubGlobal('fetch', vi.fn())
    void resolveBackend()

    render(<HelperPermissionNotice />)

    await waitFor(() => expect(screen.queryByText(/access other apps and services/i)).not.toBeInTheDocument())
  })

  it('stays dismissed after the user closes it, even across a fresh mount', () => {
    setBackendConfig({ mode: 'auto', helperUrl: 'http://127.0.0.1:5601' })
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    void resolveBackend()

    const { unmount } = render(<HelperPermissionNotice />)
    fireEvent.click(screen.getByLabelText('Dismiss'))
    expect(screen.queryByText(/access other apps and services/i)).not.toBeInTheDocument()
    unmount()

    render(<HelperPermissionNotice />)
    expect(screen.queryByText(/access other apps and services/i)).not.toBeInTheDocument()
  })
})
