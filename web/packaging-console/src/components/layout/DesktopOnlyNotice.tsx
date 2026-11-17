import { Laptop2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

/** Below this width the editor cannot work (fixed sidebar, wide grids), and the Helper only runs on Windows PCs anyway. */
const DESKTOP_MIN_WIDTH = 1024
const QUERY = `(min-width: ${DESKTOP_MIN_WIDTH}px)`

/** True on a desktop-sized window. Defaults to true where matchMedia is missing (tests, very old browsers) so nothing is ever hidden by mistake. */
export function useIsDesktopWidth(): boolean {
  const supported = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  const [desktop, setDesktop] = useState(() => (supported ? window.matchMedia(QUERY).matches : true))
  useEffect(() => {
    if (!supported) return
    const mql = window.matchMedia(QUERY)
    const onChange = () => setDesktop(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [supported])
  return desktop
}

/** Shown in place of the editor and the other app pages on a phone or a very narrow window. */
export function DesktopOnlyNotice() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-6 text-ink">
      <div className="max-w-md rounded-lg border border-subtle bg-panel p-6 text-center">
        <Laptop2 size={28} className="mx-auto text-brand" />
        <h1 className="mt-3 text-lg font-semibold">WinRelease needs a computer</h1>
        <p className="mt-2 text-sm text-muted">
          WinRelease builds installers with a Helper that runs on a Windows PC, so it cannot build an MSI on a phone or tablet. Open this page on your Windows computer.
        </p>
        <p className="mt-2 text-xs text-muted">On a computer and seeing this? Make the browser window wider (at least {DESKTOP_MIN_WIDTH} pixels).</p>
        <Link to="/" className="mt-4 inline-block rounded-md border border-subtle px-4 py-2 text-sm hover:bg-panel-alt">
          Back to the front page
        </Link>
      </div>
    </div>
  )
}
