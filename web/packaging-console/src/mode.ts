/**
 * The free MSI compiler MVP (docs/roadmap/free-compiler-mvp.md) is the same Console built with
 * `vite build --mode mvp` (npm run build:mvp). In that mode there's no login, projects live in the
 * browser's localStorage instead of the API, and the sections with no MVP backend (Intune, storage,
 * WXS import) are hidden. A function rather than a constant so tests can stub the mode.
 */
export function isMvpMode(): boolean {
  return import.meta.env.MODE === 'mvp'
}
