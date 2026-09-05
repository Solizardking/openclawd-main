import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import {
  activateCommandPaletteEntry,
  commandPaletteEntries,
  commandPaletteScrollTopForRow,
  commandPaletteVirtualWindow,
  cyclePaletteTab,
  movePaletteHighlight,
  paletteIndexedShortcutIndex,
  paletteShortcutNumber,
  popCommandPaletteStep,
  enterCommandPaletteStep,
  resolveCommandPaletteStep,
  type CommandPaletteEntry,
  type CommandPaletteTab,
} from './command-palette-model'
import { commandPaletteLinkDisplayUrl, type CommandPaletteLink } from './command-palette-link-provider'
import type { CommandPaletteMessage } from './command-palette-message-provider'
import type { CommandPaletteSurface } from './command-palette-search-provider'
import type { CommandPaletteCommand } from './command-palette-provider'

export const PALETTE_ROW_PITCH_PX = 49
export const PALETTE_ROW_GAP_PX = 2
export const PALETTE_LEADING_OFFSET_PX = 8
export const PALETTE_OVERSCAN_ROWS = 6

interface CommandPaletteProps {
  open: boolean
  surfaces: readonly CommandPaletteSurface[]
  commands: readonly CommandPaletteCommand[]
  messages?: readonly CommandPaletteMessage[]
  links?: readonly CommandPaletteLink[]
  onOpenSurface: (agentId: string) => void
  onOpenMessage?: (message: CommandPaletteMessage) => void
  onOpenLink?: (url: string) => void
  onClose: () => void
}

function entryTitle(entry: CommandPaletteEntry): string {
  if (entry.kind === 'surface') return entry.surface.label
  if (entry.kind === 'command') return entry.command.label
  if (entry.kind === 'message') return entry.message.snippet
  return commandPaletteLinkDisplayUrl(entry.link.url)
}

function entryDetail(entry: CommandPaletteEntry): string {
  if (entry.kind === 'surface') return `${entry.surface.group} · ${entry.surface.path}`
  if (entry.kind === 'command') return entry.command.detail ?? ''
  if (entry.kind === 'message') return new Date(entry.message.timestampMs).toLocaleTimeString()
  return 'link'
}

function entryKey(entry: CommandPaletteEntry): string {
  const base = entry.kind === 'command' ? `cmd:${entry.command.id}` : entryTitle(entry)
  if (entry.kind === 'surface' && entry.isHidden) return `${base}:hidden`
  return base
}

export default function CommandPalette({
  open,
  surfaces,
  commands,
  messages = [],
  links = [],
  onOpenSurface,
  onOpenMessage,
  onOpenLink,
  onClose,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<CommandPaletteTab>('all')
  const [highlight, setHighlight] = useState(0)
  const [trail, setTrail] = useState<readonly string[]>([])
  const [modifierHeld, setModifierHeld] = useState(false)
  const listRef = useRef<HTMLDivElement | null>(null)

  const steps = useMemo(() => resolveCommandPaletteStep(commands, trail), [commands, trail])
  const isNested = steps.depth > 0
  const entries = useMemo(
    () => commandPaletteEntries({ surfaces, commands: steps.commands, messages, links, query, tab }),
    [surfaces, steps.commands, messages, links, query, tab],
  )

  useEffect(() => {
    setHighlight(0)
  }, [query, tab])

  useEffect(() => {
    if (!open) {
      setQuery('')
      setTrail([])
      setHighlight(0)
      setModifierHeld(false)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const down = (event: KeyboardEvent) => {
      if (event.key === 'Shift') setModifierHeld(true)
    }
    const up = (event: KeyboardEvent) => {
      if (event.key === 'Shift') setModifierHeld(false)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [open])

  useEffect(() => {
    const list = listRef.current
    if (list == null || entries.length === 0) return
    const scrollTop = commandPaletteScrollTopForRow({
      rowIndex: highlight,
      rowPitchPx: PALETTE_ROW_PITCH_PX,
      rowGapPx: PALETTE_ROW_GAP_PX,
      leadingOffsetPx: PALETTE_LEADING_OFFSET_PX,
      scrollTopPx: list.scrollTop,
      viewportPx: list.clientHeight,
    })
    if (scrollTop != null) list.scrollTop = scrollTop
  }, [highlight, entries.length])

  if (!open) return null

  const activate = (entry: CommandPaletteEntry) => {
    activateCommandPaletteEntry(entry, onOpenSurface, onOpenMessage, onOpenLink)
    onClose()
  }

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlight((current) => movePaletteHighlight(current, entries.length, event.key === 'ArrowDown' ? 1 : -1))
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const entry = entries[highlight]
      if (entry != null) activate(entry)
      return
    }
    if (event.key === 'Tab') {
      event.preventDefault()
      setTab((current) => cyclePaletteTab(current, event.shiftKey ? -1 : 1))
      return
    }
    if (event.key === 'Backspace' && query.length === 0 && isNested) {
      event.preventDefault()
      setTrail((current) => popCommandPaletteStep(commands, current))
      return
    }
    const shortcutIndex = paletteIndexedShortcutIndex(event.key, isNested, Math.min(entries.length, 9))
    if (shortcutIndex != null && modifierHeld) {
      event.preventDefault()
      const entry = entries[shortcutIndex]
      if (entry != null) activate(entry)
    }
  }

  const viewportPx = Math.min(entries.length, 10) * PALETTE_ROW_PITCH_PX + PALETTE_LEADING_OFFSET_PX
  const window0 = commandPaletteVirtualWindow({
    rowCount: entries.length,
    rowPitchPx: PALETTE_ROW_PITCH_PX,
    leadingOffsetPx: PALETTE_LEADING_OFFSET_PX,
    scrollTopPx: listRef.current?.scrollTop ?? 0,
    viewportPx,
    overscanRows: PALETTE_OVERSCAN_ROWS,
  })

  return (
    <div className="palette-backdrop" onMouseDown={onClose}>
      <div className="palette" role="dialog" aria-label="Command palette" onKeyDown={handleKeyDown}>
        <input
          className="palette-input"
          autoFocus
          value={query}
          placeholder="Search surfaces, actions, events…"
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="palette-tabs" role="tablist">
          {(['all', 'surfaces', 'trading', 'market', 'governance', 'compute', 'ops', 'actions'] as const).map((name) => (
            <button key={name} className={name === tab ? 'palette-tab palette-tab--active' : 'palette-tab'} onClick={() => setTab(name)}>
              {name}
            </button>
          ))}
        </div>
        <div className="palette-list" ref={listRef} style={{ maxHeight: viewportPx }} role="listbox">
          {entries.length === 0 && <div className="palette-empty">No matches</div>}
          {entries.slice(window0.start, window0.end).map((entry, offset) => {
            const index = window0.start + offset
            const shortcut = paletteShortcutNumber(index, isNested, modifierHeld)
            return (
              <div
                key={entryKey(entry)}
                role="option"
                aria-selected={index === highlight}
                className={index === highlight ? 'palette-row palette-row--active' : 'palette-row'}
                style={{ height: PALETTE_ROW_PITCH_PX - PALETTE_ROW_GAP_PX }}
                onMouseMove={() => setHighlight(index)}
                onClick={() => activate(entry)}
              >
                <span className={`palette-kind palette-kind--${entry.kind}`}>{entry.kind}</span>
                <span className="palette-title">{entryTitle(entry)}</span>
                <span className="palette-detail">{entryDetail(entry)}</span>
                {shortcut != null && <kbd className="palette-shortcut">⌘{shortcut}</kbd>}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
