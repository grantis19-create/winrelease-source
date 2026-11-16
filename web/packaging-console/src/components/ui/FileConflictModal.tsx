import { Modal } from './Modal'
import { Button } from './Button'

/**
 * Replaces a plain `window.confirm` for a file-move/drag collision (Files & Folders) with an
 * in-app dialog carrying the exact requested copy - so the user sees the filename and destination
 * folder called out explicitly, not a generic browser confirm.
 */
export function FileConflictModal({
  fileName,
  targetFolderLabel,
  onOverwrite,
  onCancel,
}: {
  fileName: string
  targetFolderLabel: string
  onOverwrite: () => void
  onCancel: () => void
}) {
  return (
    <Modal title="File Conflict" onClose={onCancel}>
      <p className="text-sm text-ink">
        A file named <span className="font-medium">&quot;{fileName}&quot;</span> already exists in{' '}
        <span className="font-medium">{targetFolderLabel}</span>. Do you want to overwrite it or cancel?
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" onClick={onOverwrite}>
          Overwrite
        </Button>
      </div>
    </Modal>
  )
}
