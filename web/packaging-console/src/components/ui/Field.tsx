import { Info } from 'lucide-react'
import { useLayoutEffect, useRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react'

/**
 * A small "(i)" icon that reveals `text` on hover - the compact-density alternative to a permanent
 * inline helper line below a field. CSS-only (group-hover), no JS state, no dependency beyond the
 * icon already used everywhere else in this codebase.
 */
export function InfoTooltip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex shrink-0 normal-case tracking-normal">
      <Info size={11} className="cursor-help text-muted/60 hover:text-brand" />
      <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 w-56 -translate-x-1/2 rounded-md border border-subtle bg-panel px-2.5 py-1.5 text-[11px] font-normal leading-snug text-ink opacity-0 shadow-xl transition-opacity group-hover:opacity-100">
        {text}
      </span>
    </span>
  )
}

export function Field({ label, children, className, hint }: { label: ReactNode; children: ReactNode; className?: string; hint?: string }) {
  return (
    <label className={`flex flex-col gap-1 ${className ?? ''}`}>
      <span className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted">
        {label}
        {hint && <InfoTooltip text={hint} />}
      </span>
      {children}
    </label>
  )
}

/**
 * Chrome (and others) will offer to fill - or offer to *save* - a plain text field with a saved
 * name/address/phone/ID number purely from its placeholder/label text: "Manufacturer", "Contact
 * Person", "Support Telephone", even an icon file path sitting near those fields in the same form,
 * all read like a real address-book/ID form to that heuristic even though nothing here is ever
 * meant to be autofilled. The literal value `autoComplete="off"` is NOT enough on its own - Chrome
 * has deliberately ignored it for address/payment/ID-like fields for years, precisely because sites
 * were misusing it to break legitimate autofill, so it only works there as a no-op. `"new-password"`
 * is the widely-used, actually-effective workaround: Chrome treats it as "a value being freshly
 * created," never something to suggest or offer to save, for any input type - not just passwords.
 * Applied by default on every TextInput project-wide; a caller that genuinely wants real
 * autocomplete (none do today) can still pass its own value.
 */
export const NO_AUTOFILL = 'new-password'

export function TextInput({ autoComplete, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      autoComplete={autoComplete ?? NO_AUTOFILL}
      {...props}
      className={`rounded-md border border-subtle bg-panel-alt px-2.5 py-1.5 text-sm text-ink outline-none focus:border-brand disabled:opacity-60 ${props.className ?? ''}`}
    />
  )
}

/**
 * A single-logical-line text field that grows *vertically* (wraps and expands its own height)
 * instead of scrolling horizontally once its content is wider than the box - for a field like
 * Target Directory where the full value needs to stay visible at a glance, not just reachable by
 * scrolling within a fixed-height input. Enter is suppressed (this still represents one string
 * value, not multiple lines) and a paste/programmatic value containing newlines is expected to
 * already be stripped by the caller's onChange.
 */
export function AutoGrowTextArea({ className, onKeyDown, autoComplete, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  })

  return (
    <textarea
      autoComplete={autoComplete ?? NO_AUTOFILL}
      {...props}
      ref={ref}
      rows={1}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.preventDefault()
        onKeyDown?.(e)
      }}
      className={`resize-none overflow-hidden rounded-md border border-subtle bg-panel-alt px-2.5 py-1.5 text-sm text-ink outline-none focus:border-brand disabled:opacity-60 ${className ?? ''}`}
    />
  )
}
