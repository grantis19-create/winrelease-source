import { Download, FileJson } from 'lucide-react'
import { Panel } from './ui/Panel'
import { Button } from './ui/Button'
import { manifestWithHeader } from '../state/projectBundle'
import type { WinReleaseManifest } from '../types/manifest'

function exportManifest(manifest: WinReleaseManifest) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(manifestWithHeader(manifest), null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'winrelease.json'
  link.click()
  URL.revokeObjectURL(url)
}

export function JsonPreviewPanel({ manifest }: { manifest: WinReleaseManifest }) {
  return (
    <Panel icon={FileJson} title="Manifest JSON" defaultCollapsed description="Live view of winrelease.json for this draft.">
      <div className="mb-2 flex justify-end">
        <Button onClick={() => exportManifest(manifest)} title="Download this project as winrelease.json - reopen it later with Open > Open an exported project">
          <Download size={14} /> Export winrelease.json
        </Button>
      </div>
      <pre className="max-h-96 overflow-auto rounded-md bg-panel-alt p-3 text-xs text-muted">
        {JSON.stringify(manifest, null, 2)}
      </pre>
    </Panel>
  )
}
