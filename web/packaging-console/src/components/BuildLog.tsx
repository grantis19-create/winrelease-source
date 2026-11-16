import { Check, Copy, Terminal } from 'lucide-react'
import { useState } from 'react'

export type LogLevel = 'error' | 'warning' | 'note' | 'info'

/** Colours a line of the real `wix build` / WinRelease output; nothing is added to or reworded in it. */
export function classifyLogLine(line: string): LogLevel {
  if (/^WinRelease note:/i.test(line)) return 'note'
  if (/\berror\b/i.test(line)) return 'error'
  if (/\bwarning\b/i.test(line)) return 'warning'
  return 'info'
}

const LEVEL_CLASSES: Record<LogLevel, string> = {
  error: 'text-danger',
  warning: 'text-warn',
  note: 'text-brand',
  info: 'text-muted',
}

/** The verbatim build output in a terminal-style box, colour-coded per line, with a Copy button. */
export function BuildLog({ text, maxHeightClass = 'max-h-72' }: { text: string; maxHeightClass?: string }) {
  const [copied, setCopied] = useState(false)
  const lines = text.split(/\r?\n/)

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard access can be refused; the text stays selectable.
    }
  }

  return (
    <div className="overflow-hidden rounded-md border border-subtle bg-canvas">
      <div className="flex items-center justify-between border-b border-subtle px-3 py-1.5 text-[11px] text-muted">
        <span className="flex items-center gap-1.5">
          <Terminal size={12} /> wix build
        </span>
        <button type="button" onClick={copy} className="flex items-center gap-1 hover:text-ink">
          {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className={`${maxHeightClass} overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-xs leading-relaxed`}>
        {lines.map((line, index) => (
          <span key={index} className={`block ${LEVEL_CLASSES[classifyLogLine(line)]}`}>
            {line || ' '}
          </span>
        ))}
      </pre>
    </div>
  )
}
