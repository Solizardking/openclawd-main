export interface CommandPaletteLink {
  url: string
}

const HIDDEN_URL_SUFFIX = /\/(tree|blob)\/[^/]+$/

export function commandPaletteLinkDisplayUrl(url: string): string {
  try {
    const parsed = new URL(url)
    const path = parsed.pathname.replace(HIDDEN_URL_SUFFIX, '')
    return `${parsed.host}${path}`.replace(/\/$/, '')
  } catch {
    return url
  }
}
