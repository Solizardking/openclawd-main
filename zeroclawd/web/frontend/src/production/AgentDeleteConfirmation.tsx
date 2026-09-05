import { useEffect, useRef } from 'react'

interface AgentDeleteConfirmationProps {
  agentId: string
  agentLabel: string
  endpointPath: string
  isPinned: boolean
  onConfirm: (agentId: string) => void
  onCancel: () => void
}

export default function AgentDeleteConfirmation({
  agentId,
  agentLabel,
  endpointPath,
  isPinned,
  onConfirm,
  onCancel,
}: AgentDeleteConfirmationProps) {
  const confirmRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    confirmRef.current?.focus()
  }, [])

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', close)
    return () => document.removeEventListener('keydown', close)
  }, [onCancel])

  return (
    <div className="confirm-backdrop" onMouseDown={onCancel}>
      <div className="confirm" role="alertdialog" aria-label={`Hide ${agentLabel}`}>
        <h3 className="confirm-title">Hide “{agentLabel}”?</h3>
        <p className="confirm-body">
          This removes <code>{endpointPath}</code> from the production sidebar. The backend keeps serving it — you can restore it
          from the command palette at any time.
        </p>
        {isPinned && <p className="confirm-body">It will also be unpinned.</p>}
        <div className="confirm-actions">
          <button className="btn btn--ghost" onClick={onCancel}>
            Cancel
          </button>
          <button ref={confirmRef} className="btn btn--danger" onClick={() => onConfirm(agentId)}>
            Hide surface
          </button>
        </div>
      </div>
    </div>
  )
}
