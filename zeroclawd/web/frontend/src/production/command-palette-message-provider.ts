export interface CommandPaletteMessage {
  id: string
  snippet: string
  timestampMs: number
}

export interface StatusEventLog {
  messages(): readonly CommandPaletteMessage[]
  record(kind: string, detail: string): void
}

export function createStatusEventLog(limit = 200): StatusEventLog {
  let seq = 0
  let entries: CommandPaletteMessage[] = []
  return {
    messages: () => entries,
    record(kind, detail) {
      seq += 1
      entries = [{ id: `evt-${seq}`, snippet: `${kind}: ${detail}`, timestampMs: Date.now() }, ...entries].slice(0, limit)
    },
  }
}
