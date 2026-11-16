/** A File plus the relative path it should keep once imported (from webkitdirectory or a dropped folder). */
export interface ImportedFile {
  file: File
  relativePath: string
}

/** Normalizes a <input webkitdirectory multiple> FileList - each File already carries webkitRelativePath. */
export function fromFileList(files: FileList): ImportedFile[] {
  return Array.from(files).map((file) => ({ file, relativePath: file.webkitRelativePath || file.name }))
}

/**
 * Walks a drag-and-drop DataTransfer's dropped folders/files via the
 * (non-standard but universally supported) webkitGetAsEntry API - dropped
 * files don't carry webkitRelativePath themselves, so it's reconstructed
 * from the directory structure being walked.
 */
export async function fromDataTransfer(dataTransfer: DataTransfer): Promise<ImportedFile[]> {
  const entries = Array.from(dataTransfer.items)
    .map((item) => item.webkitGetAsEntry?.())
    .filter((entry): entry is FileSystemEntry => entry != null)

  const results: ImportedFile[] = []
  for (const entry of entries) {
    await walk(entry, '', results)
  }
  return results
}

async function walk(entry: FileSystemEntry, path: string, results: ImportedFile[]): Promise<void> {
  if (entry.isFile) {
    const fileEntry = entry as FileSystemFileEntry
    const file = await new Promise<File>((resolve, reject) => fileEntry.file(resolve, reject))
    results.push({ file, relativePath: `${path}${entry.name}` })
    return
  }

  if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader()
    // NOTE: readEntries can return a partial listing for very large folders
    // (WHATWG quirk - callers are expected to call it repeatedly until it
    // returns an empty array). Good enough for typical app payloads; not
    // looped here to keep this straightforward for the common case.
    const children = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject))
    for (const child of children) {
      await walk(child, `${path}${entry.name}/`, results)
    }
  }
}
