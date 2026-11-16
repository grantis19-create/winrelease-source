import { AppWindow, Image as ImageIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Modal } from '../ui/Modal'

/**
 * Object-URL lifecycle for one candidate's thumbnail - created only when the picker modal is open
 * and the blob is actually staged (a candidate declared but not currently uploaded, e.g. after a
 * reload that didn't restore it, renders with no preview rather than erroring), revoked on unmount
 * or when the file changes so a long picker session doesn't leak blob URLs.
 */
function useObjectUrl(file: File | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!file) {
      setUrl(null)
      return
    }
    const objectUrl = URL.createObjectURL(file)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [file])

  return url
}

/**
 * One candidate's thumbnail: a real preview for a `.ico` whose blob is staged (browsers render .ico
 * natively via `<img>`, no parsing needed), a generic "app window" glyph for a `.exe` (its icon is a
 * PE resource - extracting the actual image needs a full resource-directory walk, real parser work
 * not worth it for a thumbnail), and a plain image placeholder for anything else (an .ico with no
 * staged blob, e.g. a path pasted by hand rather than uploaded this session).
 */
export function CandidateThumbnail({ sourcePath, file }: { sourcePath: string; file: File | undefined }) {
  const isIco = /\.ico$/i.test(sourcePath)
  const objectUrl = useObjectUrl(isIco ? file : undefined)

  if (objectUrl) {
    return <img src={objectUrl} alt="" className="h-8 w-8 object-contain" />
  }
  if (/\.exe$/i.test(sourcePath)) {
    return <AppWindow size={24} className="text-muted" />
  }
  return <ImageIcon size={24} className="text-muted/50" />
}

/**
 * A visual grid of this project's icon-capable declared files (.ico previewed for real, .exe shown
 * generically - see CandidateThumbnail) to pick from, instead of a plain filename dropdown. Opened
 * from a Browse button next to an Icon Path field; "sourceFiles" is the session-local staged-blob
 * map (FilesSection/BuildPanel's own `sourceFiles`) - every candidate lists regardless of whether
 * it's in there (adding a file to Files & Folders is all that's needed to make it pickable here),
 * but one with no entry gets a "Not loaded" flag since the real build will fail on it until it's
 * re-added (same condition BuildPanel's own "N item(s) have no file attached" warning checks).
 */
export function IconPickerModal({
  candidates,
  sourceFiles,
  onClose,
  onChoose,
}: {
  candidates: string[]
  sourceFiles: Map<string, File>
  onClose: () => void
  onChoose: (sourcePath: string) => void
}) {
  return (
    <Modal title="Choose an Icon" onClose={onClose}>
      {candidates.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted">
          No .ico or .exe files added yet - add one in Files &amp; Folders first.
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {candidates.map((sourcePath) => {
            const notLoaded = !sourceFiles.has(sourcePath)
            return (
              <button
                key={sourcePath}
                type="button"
                onClick={() => {
                  onChoose(sourcePath)
                  onClose()
                }}
                title={notLoaded ? `${sourcePath} - not currently loaded in this browser; re-add it in Files & Folders before building, or the build will fail` : sourcePath}
                className="flex flex-col items-center gap-1.5 rounded-md border border-subtle bg-panel-alt p-2.5 text-center hover:border-brand"
              >
                <CandidateThumbnail sourcePath={sourcePath} file={sourceFiles.get(sourcePath)} />
                <span className={`line-clamp-2 w-full break-all text-[10px] ${notLoaded ? 'text-warn' : 'text-muted'}`}>{sourcePath.split('/').pop()}</span>
                {notLoaded && <span className="text-[9px] text-warn">Not loaded</span>}
              </button>
            )
          })}
        </div>
      )}
    </Modal>
  )
}
