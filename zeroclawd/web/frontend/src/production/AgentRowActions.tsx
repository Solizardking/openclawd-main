import { useEffect, useRef, useState } from 'react'
import {
  AGENT_ROW_ACTIONS_LABEL,
  agentRowActions,
  isCopyEndpointPathAction,
  isHideFromSidebarAction,
  isMarkAgentUnreadAction,
  isTogglePinAction,
  markAgentUnreadValue,
  togglePinValue,
  type AgentRowAction,
} from './agent-row-actions-model'

interface AgentRowActionsProps {
  agentId: string
  agentLabel: string
  endpointPath: string
  isPinned: boolean
  isHidden: boolean
  hasUnread: boolean
  includeMarkUnread?: boolean
  onTogglePin: (agentId: string, pinned: boolean) => void
  onHide: (agentId: string) => void
  onMarkUnread: (agentId: string, unread: boolean) => void
}

export default function AgentRowActions({
  agentId,
  agentLabel,
  endpointPath,
  isPinned,
  isHidden,
  hasUnread,
  includeMarkUnread = false,
  onTogglePin,
  onHide,
  onMarkUnread,
}: AgentRowActionsProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => {
      if (rootRef.current != null && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  if (isHidden) return null

  const actions: readonly AgentRowAction[] = agentRowActions({
    isHidden,
    isPinned,
    hasUnread,
    includePin: true,
    includeMarkUnread,
    includeCopy: true,
  })

  const run = (action: AgentRowAction) => {
    setOpen(false)
    if (isTogglePinAction(action)) onTogglePin(agentId, togglePinValue(action))
    else if (isHideFromSidebarAction(action)) onHide(agentId)
    else if (isMarkAgentUnreadAction(action)) onMarkUnread(agentId, markAgentUnreadValue(action))
    else if (isCopyEndpointPathAction(action)) void navigator.clipboard?.writeText(endpointPath)
  }

  return (
    <div className="row-actions" ref={rootRef}>
      <button
        className="row-actions-trigger"
        aria-label={`${AGENT_ROW_ACTIONS_LABEL} for ${agentLabel}`}
        onClick={() => setOpen((current) => !current)}
      >
        ⋯
      </button>
      {open && (
        <div className="row-actions-menu" role="menu">
          {actions.map((action) => (
            <button key={action.id} role="menuitem" className="row-actions-item" onClick={() => run(action)}>
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
