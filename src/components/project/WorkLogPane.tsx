/**
 * WorkLogPane — right pane of ProjectDetail.
 *
 * Shows the chronological list of work log entries (newest first) and
 * an inline form to add new entries.
 */

import type { WorkLogEntry } from '@/types'
import { WorkLogEntryForm } from '@/components/WorkLogEntry'
import { MarkdownContent } from '@/components/MarkdownContent'

interface Props {
  projectId: number
  workLog: WorkLogEntry[]
  onSaved: () => void
}

export function WorkLogPane({ projectId, workLog, onSaved }: Props) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
        <h2 className="text-sm font-semibold">Work Log</h2>
        <span className="text-xs text-muted-foreground">{workLog.length} entries</span>
      </div>

      <div className="px-4 py-3 border-b bg-muted/30 shrink-0">
        <WorkLogEntryForm projectId={projectId} onSaved={onSaved} />
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-border">
        {workLog.length === 0 && (
          <p className="px-4 py-6 text-sm text-muted-foreground text-center">No entries yet.</p>
        )}
        {workLog.map(entry => (
          <div key={entry.id} className="px-4 py-3">
            <p className="text-xs text-muted-foreground mb-1">
              {new Date(entry.createdAt + 'Z').toLocaleString()}
            </p>
            <MarkdownContent>{entry.note}</MarkdownContent>
          </div>
        ))}
      </div>
    </div>
  )
}
