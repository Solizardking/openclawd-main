import { useEffect, useRef, useState } from 'react'

interface AgentNameEditorProps {
  agentId: string
  currentLabel: string
  savedLabel?: string
  onCommit: (agentId: string, label: string) => void
  onCancel: () => void
}

export default function AgentNameEditor({ agentId, currentLabel, savedLabel, onCommit, onCancel }: AgentNameEditorProps) {
  const [draft, setDraft] = useState(savedLabel ?? currentLabel)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const commit = () => {
    const trimmed = draft.trim()
    if (trimmed.length === 0 || trimmed === currentLabel) onCancel()
    else onCommit(agentId, trimmed)
  }

  return (
    <form
      className="name-editor"
      onSubmit={(event) => {
        event.preventDefault()
        commit()
      }}
    >
      <input
        ref={inputRef}
        className="name-editor-input"
        value={draft}
        maxLength={48}
        aria-label={`Rename ${currentLabel}`}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation()
            onCancel()
          }
        }}
        onBlur={commit}
      />
    </form>
  )
}
