import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DATA_DROP_EVENT, getPendingDataDrop, acceptDataDrop, restoreFolderCopy, SNAPSHOT_FOLDER } from '@/db'

const LATER_TOAST = 'data-drop-paused'

/**
 * Shown when the mass-loss guard (db/index.ts) pauses folder saves because a
 * change would remove many records. The folder file still holds the last good
 * save, so either choice is safe: keep the change (the replaced file is kept as
 * a copy) or bring the folder copy back into this browser.
 */
export function DataDropDialog() {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [later, setLater] = useState(false)
  const drop = getPendingDataDrop()

  useEffect(() => {
    const handler = () => {
      if (!getPendingDataDrop()) return
      if (!later) setOpen(true)
    }
    window.addEventListener(DATA_DROP_EVENT, handler)
    return () => window.removeEventListener(DATA_DROP_EVENT, handler)
  }, [later])

  const decideLater = () => {
    setOpen(false)
    setLater(true)
    toast.warning('Saving to your storage folder is paused: a change would remove many records. Your work is kept in this browser.', {
      id: LATER_TOAST, duration: Infinity, closeButton: true,
      action: { label: 'Review', onClick: () => { setLater(false); setOpen(true) } },
    })
  }

  const run = async (fn: () => Promise<void>, done: string) => {
    setBusy(true)
    try {
      await fn()
      toast.dismiss(LATER_TOAST)
      toast.success(done)
      setOpen(false)
      setLater(false)
    } catch (err) {
      toast.error(`That didn't work: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(false)
    }
  }

  if (!drop) return null
  return (
    <Dialog open={open} onOpenChange={v => { if (!v && !busy) decideLater() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-600" /> Many records would be removed
          </DialogTitle>
          <DialogDescription>
            Since the last save, {drop.lost} record{drop.lost === 1 ? '' : 's'} have gone missing from this browser
            without going to the Trash. To be safe, saving to your storage folder is paused — the folder file still
            holds the last good copy.
          </DialogDescription>
        </DialogHeader>

        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground text-left">
              <th className="font-medium py-1">What</th>
              <th className="font-medium py-1 text-right">Last save</th>
              <th className="font-medium py-1 text-right">Now</th>
            </tr>
          </thead>
          <tbody>
            {drop.tables.map(t => (
              <tr key={t.key} className="border-t">
                <td className="py-1">{t.label}</td>
                <td className="py-1 text-right tabular-nums">{t.before}</td>
                <td className="py-1 text-right tabular-nums text-red-700 dark:text-red-400">{t.after}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="text-xs text-muted-foreground space-y-1">
          <p><span className="font-medium text-foreground">Restore folder copy</span> brings back the last good save and undoes the changes since.</p>
          <p>
            <span className="font-medium text-foreground">Keep the change</span> saves as it is now; the file it replaces is
            kept in <span className="font-mono">{SNAPSHOT_FOLDER}</span> as <span className="font-mono">myworker-before-drop-…json</span>.
          </p>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={decideLater} disabled={busy}>Decide later</Button>
          <Button variant="outline" onClick={() => run(acceptDataDrop, 'Saved. The previous file was kept in the snapshots folder.')} disabled={busy}>
            Keep the change
          </Button>
          <Button onClick={() => run(restoreFolderCopy, 'Restored the last good save from your storage folder.')} disabled={busy}>
            Restore folder copy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
