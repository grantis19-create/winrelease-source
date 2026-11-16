import { AlertTriangle } from 'lucide-react'

/** Consistent inline error styling for a failed mutation - every useMutation in the app should surface its error through this, not fail silently (see ADR 0034's "it just flicked" bug). */
export function InlineError({ message }: { message: string | null | undefined }) {
  if (!message) return null

  return (
    <div className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
      <AlertTriangle size={14} className="mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  )
}
