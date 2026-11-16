// Persists staged source Files in IndexedDB (ADR 0047) so a reload keeps the project's files, not
// just its manifest. Raw IndexedDB, no dependency. Best-effort: every function resolves instead
// of throwing (private mode, quota, or no IndexedDB just means files stay session-only).

const DB_NAME = 'winrelease.mvp.staged-files'
const STORE = 'files'

interface StoredFile {
  key: string
  projectId: string
  path: string
  blob: Blob
  name: string
  type: string
  lastModified: number
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(STORE, { keyPath: 'key' })
      store.createIndex('projectId', 'projectId')
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

/** Returns false if the files could not be persisted (e.g. storage quota exceeded). */
export async function saveStagedFiles(projectId: string, entries: { path: string; file: File }[]): Promise<boolean> {
  try {
    const db = await open()
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    for (const { path, file } of entries) {
      const row: StoredFile = {
        key: `${projectId}\u0000${path}`,
        projectId,
        path,
        blob: file,
        name: file.name,
        type: file.type,
        lastModified: file.lastModified,
      }
      store.put(row)
    }
    await done(tx)
    db.close()
    return true
  } catch {
    return false
  }
}

export async function loadStagedFiles(projectId: string): Promise<Map<string, File>> {
  const result = new Map<string, File>()
  try {
    const db = await open()
    const tx = db.transaction(STORE, 'readonly')
    const request = tx.objectStore(STORE).index('projectId').getAll(projectId)
    await done(tx)
    for (const row of request.result as StoredFile[]) {
      result.set(row.path, new File([row.blob], row.name, { type: row.type, lastModified: row.lastModified }))
    }
    db.close()
  } catch {
    // Best-effort - an unreadable store just means nothing to restore.
  }
  return result
}

export async function clearStagedFiles(projectId: string): Promise<void> {
  try {
    const db = await open()
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const request = store.index('projectId').getAllKeys(projectId)
    request.onsuccess = () => {
      for (const key of request.result) store.delete(key)
    }
    await done(tx)
    db.close()
  } catch {
    // Best-effort.
  }
}
