import { Check, Webhook as WebhookIcon } from 'lucide-react'
import { useState } from 'react'
import { Panel } from './ui/Panel'
import { Button } from './ui/Button'
import { Field, TextInput } from './ui/Field'
import { InlineError } from './ui/InlineError'
import type { WebhookConfigView } from '../types/domain'

/**
 * Configures the webhook WinRelease posts a generic JSON notification to when a build finishes
 * (ADR 0078) - same Account-default/Project-override shape and "ping the URL before saving" UX as
 * StorageSettings (ADR 0003/0034), deliberately much simpler: one URL field, no provider choice.
 */
export function WebhookSettings({
  current,
  allowInherit,
  onSave,
  onClear,
  saving,
  error,
  saved,
}: {
  current: WebhookConfigView | null
  /** True for a Project's webhook override, where "no URL entered" means "inherit the Account's webhook" (ADR 0078). */
  allowInherit: boolean
  onSave: (webhook: WebhookConfigView) => void
  /** Clears the override back to inheriting (Project) or removes the webhook entirely (Account). Omitted when there's nothing to clear. */
  onClear?: () => void
  saving: boolean
  /** A user-facing message from the last save attempt - e.g. the endpoint rejecting the test ping. */
  error?: string | null
  /** True right after a successful save, until the next edit/save attempt. */
  saved?: boolean
}) {
  const [url, setUrl] = useState(current?.url ?? '')

  function submit() {
    if (url.trim().length === 0) return
    onSave({ url: url.trim() })
  }

  return (
    <Panel
      icon={WebhookIcon}
      title="Build Notifications"
      description="Post a build result (project, version, success/failure) to a webhook URL - a Slack/Teams Incoming Webhook or any endpoint that accepts a JSON POST."
    >
      <div className="flex flex-col gap-4">
        <Field label="Webhook URL" hint={allowInherit ? 'Leave blank to inherit the Account default - see Settings.' : undefined}>
          <TextInput value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://hooks.slack.com/services/..." />
        </Field>

        <div className="flex items-center gap-3">
          <Button variant="primary" onClick={submit} disabled={saving || url.trim().length === 0}>
            {saving ? 'Saving…' : 'Save Webhook'}
          </Button>
          {(current || url.trim().length > 0) && onClear && (
            <Button
              onClick={() => {
                setUrl('')
                onClear()
              }}
              disabled={saving}
            >
              {allowInherit ? 'Clear Override' : 'Remove Webhook'}
            </Button>
          )}
          {saved && !error && (
            <span className="flex items-center gap-1 text-xs text-ok">
              <Check size={14} /> Saved - test ping accepted.
            </span>
          )}
        </div>

        <InlineError message={error} />
      </div>
    </Panel>
  )
}
