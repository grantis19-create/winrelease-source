/**
 * A short fingerprint of everything a build is made from: the project's settings and the attached files (name, size, last modified). Compared with
 * the fingerprint saved with a built MSI, it says whether the project has changed since that MSI was built, so a stale download can be flagged.
 */
export function projectFingerprint(manifest: unknown, sourceFiles: Map<string, File>, manualZip: File | null = null): string {
  const files = [...sourceFiles.entries()]
    .map(([path, file]) => `${path}\u0000${file.size}\u0000${file.lastModified}`)
    .sort()
  const zip = manualZip ? `${manualZip.name}\u0000${manualZip.size}\u0000${manualZip.lastModified}` : ''
  return hash(`${JSON.stringify(manifest)}\u0001${files.join('\u0002')}\u0001${zip}`)
}

/** cyrb53: a small, fast, well-spread string hash (not cryptographic - it only has to notice a change). */
function hash(text: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ code, 2654435761)
    h2 = Math.imul(h2 ^ code, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16)
}
