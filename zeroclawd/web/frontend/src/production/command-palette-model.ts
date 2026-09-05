import type { FeatureGroup } from '../api/registry'
import type { CommandPaletteCommand } from './command-palette-provider'
import type { CommandPaletteSurface } from './command-palette-search-provider'
import type { CommandPaletteMessage } from './command-palette-message-provider'
import { commandPaletteLinkDisplayUrl, type CommandPaletteLink } from './command-palette-link-provider'

export type CommandPaletteTab = 'all' | 'surfaces' | 'trading' | 'market' | 'governance' | 'compute' | 'ops' | 'actions'

const GROUP_TABS: readonly FeatureGroup[] = ['trading', 'market', 'governance', 'compute', 'ops']

export type CommandPaletteEntry =
  | { kind: 'surface'; surface: CommandPaletteSurface; isHidden?: boolean }
  | { kind: 'command'; command: CommandPaletteCommand }
  | { kind: 'message'; message: CommandPaletteMessage }
  | { kind: 'link'; link: CommandPaletteLink }

export interface CommandPaletteStep {
  commands: readonly CommandPaletteCommand[]
  depth: number
}

const COMBINING_MARKS = new RegExp('\\p{M}+', 'gu')
const LETTER_OR_NUMBER = /[\p{L}\p{N}]/u
const MAX_FUZZY_SPAN_MULTIPLIER = 3

export function normalizePaletteSearch(value: string): string {
  let normalized = ''
  let separated = false
  for (let index = 0; index < value.length; index += 1) {
    const character = value.charAt(index).normalize('NFKD').replace(COMBINING_MARKS, '').toLowerCase()
    for (const unit of character) {
      if (!LETTER_OR_NUMBER.test(unit)) {
        separated = true
        continue
      }
      if (separated && normalized.length > 0) normalized += ' '
      separated = false
      normalized += unit
    }
  }
  return normalized
}

export function paletteSearchTokens(value: string): string[] {
  const normalized = normalizePaletteSearch(value)
  return normalized.length === 0 ? [] : normalized.split(' ')
}

export function fuzzyPaletteScore(value: string, query: string): number | null {
  if (query.length === 0) return 0
  const lowerValue = value.toLowerCase()
  let score = 0
  let queryIndex = 0
  let previousMatch = -2
  let firstMatch = -1
  let lastMatch = -1
  for (let index = 0; index < lowerValue.length && queryIndex < query.length; index += 1) {
    if (lowerValue[index] !== query[queryIndex]) continue
    if (firstMatch < 0) firstMatch = index
    const previousCharacter = value.charAt(index - 1)
    const isBoundary =
      index === 0 || previousCharacter === ' ' || previousCharacter === '-' || previousCharacter === '_' ||
      previousCharacter === '/' || previousCharacter === '.'
    const isCamelBoundary =
      previousCharacter >= 'a' && previousCharacter <= 'z' && value.charAt(index) >= 'A' && value.charAt(index) <= 'Z'
    let characterScore = 1
    if (isBoundary || isCamelBoundary) characterScore += 4
    if (previousMatch === index - 1) characterScore += 3
    score += characterScore
    previousMatch = index
    lastMatch = index
    queryIndex += 1
  }
  if (queryIndex < query.length || lastMatch - firstMatch + 1 > query.length * MAX_FUZZY_SPAN_MULTIPLIER) return null
  return score - firstMatch * 0.1 - lowerValue.length * 0.02
}

function entryLabelAndKeywords(entry: CommandPaletteEntry): { label: string; keywords: readonly string[] } {
  if (entry.kind === 'surface') {
    return {
      label: entry.surface.label,
      keywords: [entry.surface.path, entry.surface.group, ...(entry.surface.description ? [entry.surface.description] : [])],
    }
  }
  if (entry.kind === 'command') return { label: entry.command.label, keywords: entry.command.keywords }
  if (entry.kind === 'message') return { label: entry.message.snippet, keywords: [entry.message.snippet] }
  return { label: commandPaletteLinkDisplayUrl(entry.link.url), keywords: [entry.link.url] }
}

function entryMatchesTab(entry: CommandPaletteEntry, tab: CommandPaletteTab): boolean {
  if (tab === 'all') return true
  if (tab === 'actions') return entry.kind === 'command'
  if (tab === 'surfaces') return entry.kind === 'surface'
  if (entry.kind === 'surface' && GROUP_TABS.includes(entry.surface.group)) {
    return entry.surface.group === tab
  }
  return false
}

function scoreEntry(entry: CommandPaletteEntry, tokens: readonly string[], normalizedQuery: string): number | null {
  const { label, keywords } = entryLabelAndKeywords(entry)
  const normalizedLabel = normalizePaletteSearch(label)
  const candidates = [normalizedLabel, ...keywords.map(normalizePaletteSearch)]
  let score = 0
  for (const token of tokens) {
    let tokenScore: number | null = null
    for (const candidate of candidates) {
      const candidateScore = fuzzyPaletteScore(candidate, token)
      if (candidateScore != null && (tokenScore == null || candidateScore > tokenScore)) tokenScore = candidateScore
    }
    if (tokenScore == null) return null
    score += tokenScore
  }
  return score + (fuzzyPaletteScore(normalizedLabel, normalizedQuery) ?? 0)
}

export function commandPaletteEntries({
  surfaces,
  commands,
  messages = [],
  links = [],
  query,
  tab,
}: {
  surfaces: readonly CommandPaletteSurface[]
  commands: readonly CommandPaletteCommand[]
  messages?: readonly CommandPaletteMessage[]
  links?: readonly CommandPaletteLink[]
  query: string
  tab: CommandPaletteTab
}): CommandPaletteEntry[] {
  const visibleSurfaces = surfaces
    .filter((surface) => !surface.isHidden)
    .map((surface): CommandPaletteEntry => ({ kind: 'surface', surface }))
  const commandEntries = commands.map((command): CommandPaletteEntry => ({ kind: 'command', command }))
  const messageEntries = messages.map((message): CommandPaletteEntry => ({ kind: 'message', message }))
  const linkEntries = links.map((link): CommandPaletteEntry => ({ kind: 'link', link }))
  const base = [...visibleSurfaces, ...linkEntries, ...messageEntries, ...commandEntries].filter((entry) =>
    entryMatchesTab(entry, tab),
  )
  const tokens = paletteSearchTokens(query)
  if (tokens.length === 0) return tab === 'all' ? [...visibleSurfaces, ...commandEntries] : base
  const hiddenSurfaces = surfaces
    .filter((surface) => surface.isHidden)
    .map((surface): CommandPaletteEntry => ({ kind: 'surface', surface, isHidden: true }))
  const normalizedQuery = tokens.join(' ')
  const score = (entries: CommandPaletteEntry[]) =>
    entries
      .map((entry) => ({ entry, score: scoreEntry(entry, tokens, normalizedQuery) }))
      .filter((candidate): candidate is { entry: CommandPaletteEntry; score: number } => candidate.score != null)
  const scored = score(base)
  const scoredHidden = score(hiddenSurfaces.filter((entry) => entryMatchesTab(entry, tab)))
  scored.sort((left, right) => right.score - left.score)
  scoredHidden.sort((left, right) => right.score - left.score)
  return [...scored, ...scoredHidden].map(({ entry }) => entry)
}

export function movePaletteHighlight(current: number, rowCount: number, delta: -1 | 1): number {
  if (rowCount <= 0) return 0
  const bounded = Math.min(Math.max(current, 0), rowCount - 1)
  return Math.min(Math.max(bounded + delta, 0), rowCount - 1)
}

export interface CommandPaletteVirtualWindow {
  start: number
  end: number
}

export function commandPaletteVirtualWindow({
  rowCount,
  rowPitchPx,
  leadingOffsetPx,
  scrollTopPx,
  viewportPx,
  overscanRows,
}: {
  rowCount: number
  rowPitchPx: number
  leadingOffsetPx: number
  scrollTopPx: number
  viewportPx: number
  overscanRows: number
}): CommandPaletteVirtualWindow {
  if (rowCount <= 0) return { start: 0, end: 0 }
  const firstVisible = Math.floor((scrollTopPx - leadingOffsetPx) / rowPitchPx)
  const lastVisible = Math.floor((scrollTopPx + viewportPx) / rowPitchPx)
  const start = Math.min(Math.max(0, firstVisible - overscanRows), Math.max(0, rowCount - 1))
  const end = Math.max(Math.min(rowCount, lastVisible + 1 + overscanRows), start)
  return { start, end }
}

export function commandPaletteScrollTopForRow({
  rowIndex,
  rowPitchPx,
  rowGapPx,
  leadingOffsetPx,
  scrollTopPx,
  viewportPx,
  edgeInsetPx = 0,
}: {
  rowIndex: number
  rowPitchPx: number
  rowGapPx: number
  leadingOffsetPx: number
  scrollTopPx: number
  viewportPx: number
  edgeInsetPx?: number
}): number | null {
  const rowHeightPx = rowPitchPx - rowGapPx
  const rowTopPx = leadingOffsetPx + rowIndex * rowPitchPx
  const rowBottomPx = rowTopPx + rowHeightPx
  if (rowTopPx < scrollTopPx + edgeInsetPx) return Math.max(0, rowTopPx - edgeInsetPx)
  if (rowBottomPx > scrollTopPx + viewportPx - edgeInsetPx) return rowBottomPx - viewportPx + edgeInsetPx
  return null
}

export function paletteShortcutNumber(rowIndex: number, isNested: boolean, isModifierHeld: boolean): number | null {
  if (isNested || !isModifierHeld || rowIndex >= 9 || rowIndex < 0) return null
  return rowIndex + 1
}

export function paletteIndexedShortcutIndex(key: string, isNested: boolean, rowCount: number): number | null {
  if (isNested || !/^[1-9]$/.test(key)) return null
  const index = Number(key) - 1
  return index < rowCount ? index : null
}

export function cyclePaletteTab(
  current: CommandPaletteTab,
  delta: -1 | 1,
  tabs: readonly CommandPaletteTab[] = ['all', 'surfaces', 'trading', 'market', 'governance', 'compute', 'ops', 'actions'],
): CommandPaletteTab {
  const currentIndex = tabs.indexOf(current)
  const nextIndex = (currentIndex + delta + tabs.length) % tabs.length
  return tabs[nextIndex] ?? current
}

export function activateCommandPaletteEntry(
  entry: CommandPaletteEntry,
  onOpenSurface: (agentId: string) => void,
  onOpenMessage?: (message: CommandPaletteMessage) => void,
  onOpenLink?: (url: string) => void,
): void {
  if (entry.kind === 'surface') onOpenSurface(entry.surface.id)
  else if (entry.kind === 'command') entry.command.run()
  else if (entry.kind === 'message') onOpenMessage?.(entry.message)
  else onOpenLink?.(entry.link.url)
}

export function commandPaletteHasChildren(command: CommandPaletteCommand): boolean {
  return command.children != null
}

export function resolveCommandPaletteStep(
  commands: readonly CommandPaletteCommand[],
  trail: readonly string[],
): CommandPaletteStep {
  let current = commands
  let depth = 0
  for (const id of trail) {
    const parent = current.find((command) => command.id === id && commandPaletteHasChildren(command))
    if (parent == null) break
    current = parent.children ?? []
    depth += 1
  }
  return { commands: current, depth }
}

export function enterCommandPaletteStep(
  commands: readonly CommandPaletteCommand[],
  trail: readonly string[],
  commandId: string,
): string[] {
  const { depth } = resolveCommandPaletteStep(commands, trail)
  return [...trail.slice(0, depth), commandId]
}

export function popCommandPaletteStep(commands: readonly CommandPaletteCommand[], trail: readonly string[]): string[] {
  const { depth } = resolveCommandPaletteStep(commands, trail)
  return trail.slice(0, Math.max(0, depth - 1))
}
