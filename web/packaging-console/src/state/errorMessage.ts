import { ApiError } from '../api/client'

/** Pulls a user-facing message out of a thrown ApiError - prefers the first field-specific validation message (e.g. ADR 0034's "storage" connectivity-check failure), falling back to the response's title/status text. */
export function apiErrorMessage(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null
  const firstFieldError = error.errors && Object.values(error.errors)[0]?.[0]
  return firstFieldError ?? error.message
}
