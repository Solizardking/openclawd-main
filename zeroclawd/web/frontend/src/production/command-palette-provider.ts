export interface CommandPaletteCommand {
  id: string
  label: string
  icon?: string
  keywords: readonly string[]
  detail?: string
  isActive?: boolean
  children?: readonly CommandPaletteCommand[]
  run(): void
}
