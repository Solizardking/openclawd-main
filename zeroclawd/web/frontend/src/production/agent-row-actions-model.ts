export const AGENT_ROW_ACTIONS_LABEL = 'Agent actions'

export interface AgentRowAction {
  id: 'pin-agent' | 'unpin-agent' | 'hide-from-sidebar' | 'copy-endpoint-path' | 'mark-read' | 'mark-unread'
  label: 'Pin' | 'Unpin' | 'Hide from sidebar' | 'Copy endpoint path' | 'Mark as Read' | 'Mark as Unread'
}

const PIN_AGENT_ACTION: AgentRowAction = { id: 'pin-agent', label: 'Pin' }
const UNPIN_AGENT_ACTION: AgentRowAction = { id: 'unpin-agent', label: 'Unpin' }
const HIDE_FROM_SIDEBAR_ACTION: AgentRowAction = { id: 'hide-from-sidebar', label: 'Hide from sidebar' }
const COPY_ENDPOINT_PATH_ACTION: AgentRowAction = { id: 'copy-endpoint-path', label: 'Copy endpoint path' }
const MARK_READ_ACTION: AgentRowAction = { id: 'mark-read', label: 'Mark as Read' }
const MARK_UNREAD_ACTION: AgentRowAction = { id: 'mark-unread', label: 'Mark as Unread' }

export function agentRowActions({
  isHidden,
  isPinned = false,
  hasUnread = false,
  includeCopy = true,
  includeMarkUnread = false,
  includePin = false,
}: {
  isHidden: boolean
  isPinned?: boolean
  hasUnread?: boolean
  includeCopy?: boolean
  includeMarkUnread?: boolean
  includePin?: boolean
}): readonly AgentRowAction[] {
  if (isHidden) return []
  return [
    ...(includePin ? [isPinned ? UNPIN_AGENT_ACTION : PIN_AGENT_ACTION] : []),
    ...(includeMarkUnread ? [hasUnread ? MARK_READ_ACTION : MARK_UNREAD_ACTION] : []),
    ...(includeCopy ? [COPY_ENDPOINT_PATH_ACTION] : []),
    HIDE_FROM_SIDEBAR_ACTION,
  ]
}

export function isHideFromSidebarAction(action: AgentRowAction): boolean {
  return action.id === 'hide-from-sidebar'
}

export function isTogglePinAction(action: AgentRowAction): boolean {
  return action.id === 'pin-agent' || action.id === 'unpin-agent'
}

export function togglePinValue(action: AgentRowAction): boolean {
  return action.id === 'pin-agent'
}

export function isCopyEndpointPathAction(action: AgentRowAction): boolean {
  return action.id === 'copy-endpoint-path'
}

export function isMarkAgentUnreadAction(action: AgentRowAction): boolean {
  return action.id === 'mark-read' || action.id === 'mark-unread'
}

export function markAgentUnreadValue(action: AgentRowAction): boolean {
  return action.id === 'mark-unread'
}
