import { useState, type FormEvent } from 'react'
import { Modal } from './ui/Modal'
import { Button } from './ui/Button'
import { Field, TextInput } from './ui/Field'

export interface NewProjectInput {
  name: string
  manufacturer: string
  version: string
}

/** Asks for the three things every MSI needs before the project opens, so the editor never starts on a blank "New Project". */
export function NewProjectModal({
  onCreate,
  onClose,
  creating,
}: {
  onCreate: (input: NewProjectInput) => void
  onClose: () => void
  creating: boolean
}) {
  const [name, setName] = useState('')
  const [manufacturer, setManufacturer] = useState('')
  const [version, setVersion] = useState('1.0.0')
  const canCreate = name.trim() !== '' && manufacturer.trim() !== '' && !creating

  function submit(e: FormEvent) {
    e.preventDefault()
    if (canCreate) onCreate({ name, manufacturer, version })
  }

  return (
    <Modal title="New project" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Field label="Application name" hint="The product's own name, as it will appear in Add/Remove Programs. Put the version in the field below, not here.">
          <TextInput autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Acme Reader" />
        </Field>
        <Field label="Manufacturer" hint="Your company or your own name - shown as the publisher.">
          <TextInput value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} placeholder="e.g. Acme Corp" />
        </Field>
        <Field label="Version">
          <TextInput value={version} onChange={(e) => setVersion(e.target.value)} placeholder="1.0.0" />
        </Field>
        <div className="mt-1 flex justify-end gap-2">
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={!canCreate}>
            {creating ? 'Creating…' : 'Create project'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
