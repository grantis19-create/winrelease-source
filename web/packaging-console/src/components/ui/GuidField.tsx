import { useEffect, useState, type ReactNode } from 'react'
import { isGuid, normalizeGuid } from '../../state/guid'
import { Field, TextInput } from './Field'

/**
 * A GUID text field that is always shown UPPERCASE. Typing/pasting is free-form; the value is only
 * committed (normalised: trimmed, braces stripped, uppercased) when it is a well-formed GUID - on
 * blur or Enter - otherwise it snaps back to the last good value, so a half-typed GUID never reaches
 * the manifest.
 */
export function GuidField({
  label,
  hint,
  value,
  badge,
  actions,
  placeholder,
  onCommit,
}: {
  label: ReactNode
  hint?: string
  value: string
  badge?: ReactNode
  actions?: ReactNode
  /** Shown while the field is empty (for a code that is not stored, e.g. one made fresh for every build). */
  placeholder?: string
  onCommit: (guid: string) => void
}) {
  const [text, setText] = useState(value)

  // Follow outside changes (regenerate, reset, a different version's derived code).
  useEffect(() => setText(value), [value])

  const invalid = text !== '' && !isGuid(text)

  function commit() {
    if (isGuid(text)) {
      const next = normalizeGuid(text)
      setText(next)
      if (next !== value) onCommit(next)
    } else {
      setText(value)
    }
  }

  return (
    <Field
      label={
        <span className="flex items-center gap-1.5">
          {label}
          {badge}
        </span>
      }
      hint={hint}
    >
      <div className="relative">
        <TextInput
          value={text}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value.toUpperCase())}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commit()
            }
          }}
          spellCheck={false}
          aria-invalid={invalid}
          className={`w-full py-1 pr-14 font-mono text-sm uppercase ${invalid ? 'ring-1 ring-danger/60' : ''}`}
        />
        <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-1.5">{actions}</div>
      </div>
    </Field>
  )
}
