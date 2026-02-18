import type { RagStatus } from '@/types'

const styles: Record<RagStatus, string> = {
  Red: 'bg-red-100 text-red-700 border-red-200',
  Amber: 'bg-amber-100 text-amber-700 border-amber-200',
  Green: 'bg-green-100 text-green-700 border-green-200',
}

const dots: Record<RagStatus, string> = {
  Red: 'bg-red-500',
  Amber: 'bg-amber-500',
  Green: 'bg-green-500',
}

export function RagBadge({ status }: { status: RagStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${styles[status]}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dots[status]}`} />
      {status}
    </span>
  )
}
