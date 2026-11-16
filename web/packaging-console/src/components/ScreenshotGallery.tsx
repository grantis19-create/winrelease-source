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

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        {shots.map((shot, index) => (
          <figure key={shot.src} className="flex flex-col overflow-hidden rounded-lg border border-subtle bg-panel">
            <button
              type="button"
              className="block w-full cursor-zoom-in p-2"
              aria-label={`Enlarge: ${shot.alt}`}
              onClick={(event) => {
                openerRef.current = event.currentTarget
                setOpenIndex(index)
              }}
            >
              <span className="block overflow-hidden rounded-md border border-subtle" style={{ aspectRatio: String(shot.thumbAspect) }}>
                <img src={shot.src} alt={shot.alt} width={shot.width} height={shot.height} loading="lazy" className="h-full w-full object-cover object-top" />
              </span>
            </button>
            <figcaption className="px-4 py-2 text-xs text-muted">{shot.caption} Click to enlarge.</figcaption>
          </figure>
        ))}
      </div>

      {current && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={current.alt}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/85 p-4"
          onClick={() => setOpenIndex(null)}
        >
          <button
            ref={closeRef}
            type="button"
            aria-label="Close"
            className="absolute right-4 top-4 rounded-md border border-subtle bg-panel p-2 text-ink hover:bg-panel-alt"
            onClick={() => setOpenIndex(null)}
          >
            <X size={18} />
          </button>
          <img src={current.src} alt={current.alt} className="max-h-[85vh] max-w-full rounded-lg border-2 border-brand object-contain shadow-2xl" onClick={(e) => e.stopPropagation()} />
          <p className="max-w-3xl text-center text-sm text-ink" onClick={(e) => e.stopPropagation()}>
            {current.caption} <span className="text-muted">(Left and right arrow keys move between screens.)</span>
          </p>
        </div>
      )}
    </>
  )
}
