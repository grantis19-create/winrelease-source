import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { requestDevToken } from '../api/devAuth'
import { setToken } from '../api/authToken'
import { createAccount, getAccount } from '../api/accounts'
import { getCurrentAccountId, setCurrentAccountId } from '../api/currentAccount'
import { ApiError } from '../api/client'
import { Button } from '../components/ui/Button'
import { Field, TextInput } from '../components/ui/Field'

/** True only if a cached Account ID both exists and still resolves server-side - the local flat-JSON store (ADR 0014) can lose an Account (e.g. a data-directory reset) out from under a browser that still remembers its old ID, which otherwise silently breaks every Project action with no path back to a working state. */
async function cachedAccountStillExists(): Promise<boolean> {
  const id = getCurrentAccountId()
  if (!id) return false

  try {
    await getAccount(id)
    return true
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return false
    throw e
  }
}

export function LoginPage() {
  const navigate = useNavigate()
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function submit() {
    setSubmitting(true)
    setError(null)
    try {
      const { token } = await requestDevToken(displayName || 'Local Developer')
      setToken(token)

      if (!(await cachedAccountStillExists())) {
        const account = await createAccount(`${displayName || 'Local Developer'}'s Account`)
        setCurrentAccountId(account.id)
      }

      navigate('/projects')
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 404
          ? 'Dev login is unavailable - the API is not running in Development mode.'
          : 'Could not sign in - is WinRelease.API running?',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm rounded-lg border border-subtle bg-panel p-6">
        <div className="mb-6 flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand text-sm font-bold text-canvas">
            W
          </span>
          <span className="text-base font-semibold text-ink">Packaging Console</span>
        </div>

        <p className="mb-4 text-xs text-muted">
          Dev-mode sign-in only (ADR 0032) - mints a token against WinRelease.API's local test signing key. Real
          Entra ID login lands once a tenant exists to validate it against.
        </p>

        <div className="flex flex-col gap-4">
          <Field label="Display Name">
            <TextInput
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Local Developer"
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
          </Field>
          {error && <p className="text-xs text-danger">{error}</p>}
          <Button variant="primary" onClick={submit} disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </div>
      </div>
    </div>
  )
}
