import { X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

export interface Screenshot {
  src: string
  alt: string
  caption: string
  /** The image's real pixel size, so the page reserves the right space before it loads. */
  width: number
  height: number
  /** Width over height of the thumbnail box. Pair screens with the same value so each row lines up; the full image is in the lightbox. */
  thumbAspect: number
}

/** Thumbnails that open full size in a lightbox: click, or Enter, to enlarge; Esc, the close button or a click outside to close. */
export function ScreenshotGallery({ shots }: { shots: Screenshot[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (openIndex === null) return
    closeRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenIndex(null)
      else if (event.key === 'ArrowRight') setOpenIndex((i) => (i === null ? i : (i + 1) % shots.length))
      else if (event.key === 'ArrowLeft') setOpenIndex((i) => (i === null ? i : (i - 1 + shots.length) % shots.length))
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      openerRef.current?.focus()
    }
  }, [openIndex === null, shots.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const current = openIndex === null ? null : shots[openIndex]

  const close = () => setOpenIndex(null)

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        {shots.map((shot, index) => (
          <figure key={shot.src} className="relative flex flex-col overflow-hidden rounded-lg border border-subtle bg-panel">
            {/* The image itself is clickable for the mouse; the labelled Enlarge button is the one keyboard and screen-reader users reach. */}
            <button
              type="button"
              tabIndex={-1}
              aria-hidden="true"
              className="block w-full cursor-zoom-in p-2"
              onClick={(event) => {
                openerRef.current = event.currentTarget
                setOpenIndex(index)
              }}
            >
              <span className="block overflow-hidden rounded-md border border-subtle" style={{ aspectRatio: String(shot.thumbAspect) }}>
                <img src={shot.src} alt={shot.alt} width={shot.width} height={shot.height} loading="lazy" className="h-full w-full object-cover object-top" />
              </span>
            </button>
            <button
              type="button"
              aria-label={`Enlarge: ${shot.alt}`}
              className="absolute right-3.5 top-3.5 rounded-full border border-subtle bg-panel/85 px-3 py-1.5 text-xs font-semibold text-ink backdrop-blur hover:border-brand hover:bg-brand hover:text-canvas"
              onClick={(event) => {
                openerRef.current = event.currentTarget
                setOpenIndex(index)
              }}
            >
              Enlarge
            </button>
            <figcaption className="px-4 py-2 text-xs text-muted">{shot.caption} Click to enlarge.</figcaption>
          </figure>
        ))}
      </div>

      {current && (
        <div role="dialog" aria-modal="true" aria-label={current.alt} className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={close}>
          <div
            className="flex max-h-[94vh] max-w-[96vw] flex-col overflow-hidden rounded-xl border border-subtle bg-panel shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-4 border-b border-subtle px-4 py-2.5 text-sm text-muted">
              <span>
                {current.caption} <span className="text-xs">(Left and right arrow keys move between screens.)</span>
              </span>
              <button
                ref={closeRef}
                type="button"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-subtle bg-panel-alt px-3 py-1.5 text-xs font-semibold text-ink hover:border-brand hover:bg-brand hover:text-canvas"
                onClick={close}
              >
                <X size={14} aria-hidden="true" /> Close
              </button>
            </div>
            {/* The whole screen at its real size (or the window width if narrower), scrolling inside the panel. */}
            <div className="min-h-0 overflow-auto">
              <img src={current.src} alt={current.alt} className="block h-auto max-w-none" style={{ width: `min(${current.width}px, calc(94vw - 24px))` }} />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
