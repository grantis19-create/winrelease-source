import { Check, Copy } from 'lucide-react'
import { useState } from 'react'

/** A one-line command in a monospace box with a Copy button. */
export function CopyCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(command)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard access can be refused; the command stays selectable.
    }
  }

  return (
    <div className="mt-1.5 flex items-center justify-between gap-3 rounded-md border border-subtle bg-canvas px-3 py-1.5">
      <code className="select-all overflow-x-auto whitespace-nowrap font-mono text-xs text-ink">{command}</code>
      <button type="button" onClick={copy} className="flex shrink-0 items-center gap-1 text-[11px] text-muted hover:text-ink">
        {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}
