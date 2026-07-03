import type { RagStatus } from '@/types'
import { pillClass, dotOnPillClass, RAG_COLOR } from '@/lib/colors'

export function RagBadge({ status }: { status: RagStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${pillClass(RAG_COLOR[status])}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dotOnPillClass(RAG_COLOR[status])}`} />
      {status}
    </span>
  )
}
