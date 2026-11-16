import { beforeEach, describe, expect, it } from 'vitest'
import { createEmptyManifest } from '../types/manifest'
import { createLocalProject, deleteLocalProject, getLocalProject, listLocalProjects, updateLocalProject } from './localProjects'

beforeEach(() => localStorage.clear())

describe('localProjects', () => {
  it('starts empty', () => {
    expect(listLocalProjects()).toEqual([])
  })

  it('creates a project that survives a re-read, with its own id', () => {
    const a = createLocalProject({ ...createEmptyManifest(), name: 'A' })
    const b = createLocalProject({ ...createEmptyManifest(), name: 'B' })

    expect(a.id).not.toBe(b.id)
    expect(listLocalProjects().map((p) => p.manifest.name)).toEqual(['A', 'B'])
    expect(getLocalProject(a.id).manifest.name).toBe('A')
  })

  it('updates only the targeted project', () => {
    const a = createLocalProject({ ...createEmptyManifest(), name: 'A' })
    const b = createLocalProject({ ...createEmptyManifest(), name: 'B' })

    const updated = updateLocalProject(a.id, { ...a.manifest, name: 'A2' })

    expect(updated.manifest.name).toBe('A2')
    expect(getLocalProject(a.id).manifest.name).toBe('A2')
    expect(getLocalProject(b.id).manifest.name).toBe('B')
  })

  it('deletes only the targeted project', () => {
    const a = createLocalProject({ ...createEmptyManifest(), name: 'A' })
    const b = createLocalProject({ ...createEmptyManifest(), name: 'B' })

    deleteLocalProject(a.id)

    expect(listLocalProjects().map((p) => p.id)).toEqual([b.id])
  })

  it('throws a 404 ApiError for a project that is not in this browser', () => {
    expect(() => getLocalProject('nope')).toThrowError(/no longer exists/)
    expect(() => updateLocalProject('nope', createEmptyManifest())).toThrowError(/no longer exists/)
  })

  it('treats corrupted storage as an empty list instead of crashing', () => {
    localStorage.setItem('winrelease.mvp.projects', '{not json')
    expect(listLocalProjects()).toEqual([])
  })
})
