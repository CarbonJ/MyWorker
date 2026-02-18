// Screen 2: Project Detail
// Three-pane layout: top (summary), bottom-left (tasks), right (work log)

import { useParams } from 'react-router-dom'

export default function ProjectDetail() {
  const { id } = useParams()

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-4">Project Detail #{id}</h1>
      <p className="text-muted-foreground">Three-pane layout — coming soon.</p>
    </div>
  )
}
