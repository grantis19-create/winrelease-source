import { zip } from 'fflate'

/** Zips a map of path -> File entirely client-side (no server round-trip needed to produce the sources zip - see BuildPanel/ADR 0033's "high-speed ingestion" goal). */
export async function buildZip(entries: Map<string, File>): Promise<Blob> {
  const files: Record<string, Uint8Array> = {}
  for (const [path, file] of entries) {
    files[path] = new Uint8Array(await file.arrayBuffer())
  }

  const zipped = await new Promise<Uint8Array>((resolve, reject) => {
    zip(files, (err, data) => (err ? reject(err) : resolve(data)))
  })

  return new Blob([zipped as BlobPart], { type: 'application/zip' })
}
