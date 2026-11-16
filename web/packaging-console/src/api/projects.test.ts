import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEmptyManifest } from '../types/manifest'
import { getCurrentAccountId } from './currentAccount'
import { createProject, deleteProject, getProject, listProjects, updateProject } from './projects'

beforeEach(() => localStorage.clear())
afterEach(() => vi.unstubAllEnvs())

describe('projects API in MVP mode', () => {
  it('uses a fixed local account and never touches the network', async () => {
    vi.stubEnv('MODE', 'mvp')
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    expect(getCurrentAccountId()).toBe('local')

    const created = await createProject('local', { ...createEmptyManifest(), name: 'Mvp' })
    expect((await listProjects('local')).map((p) => p.id)).toEqual([created.id])
    expect((await getProject(created.id)).manifest.name).toBe('Mvp')
    expect((await updateProject(created.id, { ...created.manifest, name: 'Mvp2' })).manifest.name).toBe('Mvp2')
    await deleteProject(created.id)
    expect(await listProjects('local')).toEqual([])

    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('still talks to the API outside MVP mode', async () => {
    vi.stubEnv('MODE', 'test')
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } }),
    )

    await listProjects('acct-1')

    expect(fetchSpy).toHaveBeenCalledOnce()
    expect(String(fetchSpy.mock.calls[0][0])).toBe('/api/projects?accountId=acct-1')
    fetchSpy.mockRestore()
  })
})
