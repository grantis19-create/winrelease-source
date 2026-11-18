/**
 * The last MSI built for each project, kept in this browser (IndexedDB, like the attached files) so the Download button is still there after leaving
 * the project or reloading. One row per project: a new build replaces the old one. Best-effort throughout - a blocked or full store just means the
 * download is not remembered, never that a build fails.
 */
const DB_NAME = 'winrelease-builds'
const STORE = 'msi'

export interface StoredBuild {
  projectId: string
  fileName: string
  blob: Blob
  builtAt: number
  fingerprint: string
  sourceFiles: number
  /** The compiler's output for that build, so its log is still there when the MSI is brought back. */
  standardOutput?: string
  standardError?: string
  /** The ProductCode inside that MSI (ADR 0120). */
  productCode?: string
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'projectId' })
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

export async function saveBuiltMsi(build: StoredBuild): Promise<boolean> {
  try {
    const db = await open()
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(build)
    await done(tx)
    db.close()
    return true
  } catch {
    return false
  }
}

export async function loadBuiltMsi(projectId: string): Promise<StoredBuild | null> {
  try {
    const db = await open()
    const tx = db.transaction(STORE, 'readonly')
    const request = tx.objectStore(STORE).get(projectId)
    await done(tx)
    db.close()
    return (request.result as StoredBuild | undefined) ?? null
  } catch {
    return null
  }
}

export async function deleteBuiltMsi(projectId: string): Promise<void> {
  try {
    const db = await open()
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(projectId)
    await done(tx)
    db.close()
  } catch {
    // Nothing to forget.
  }
}
