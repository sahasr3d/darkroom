import { useEffect, useState } from 'react'

const SHOW_MS = 5000

/**
 * Phones have no room for the status line in the top plate, so the latest message shows briefly
 * over the top of the viewfinder. Screen readers already hear it from the status bar's live region.
 */
export function StatusToast({ message, seq }: { message: string; seq: number }) {
  const [shown, setShown] = useState('')
  useEffect(() => {
    if (!message) return
    setShown(message)
    const id = window.setTimeout(() => setShown(''), SHOW_MS)
    return () => window.clearTimeout(id)
  }, [message, seq])
  return (
    <div className="status-toast md:hidden" data-visible={shown !== ''} aria-hidden="true">
      {shown || message}
    </div>
  )
}
