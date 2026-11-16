/** Suggests a DeclaredFile.Id from an imported file's path, e.g. "bin/App.exe" -> "fil_App_exe". Purely a starting point - the field stays free-text and editable. */
export function sanitizeToFileId(path: string): string {
  const baseName = path.split(/[/\\]/).pop() ?? path
  const sanitized = baseName.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  return `fil_${sanitized || 'file'}`
}
