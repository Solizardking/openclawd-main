import { StrictMode, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'

export const PACKAGED_INVARIANT_MESSAGE =
  'Invariant violation (message stripped in packaged builds; the stack identifies the site)'

export interface ProductionRendererRuntime {
  mount: HTMLElement
}

function invariant(condition: unknown): asserts condition {
  if (!condition) throw new Error(PACKAGED_INVARIANT_MESSAGE)
}

export function acquireProductionRendererRuntime(): ProductionRendererRuntime {
  const mount = document.getElementById('production-root')
  invariant(mount != null)
  return { mount }
}

export function requireProductionRendererMount(mount: HTMLElement | null): HTMLElement {
  invariant(mount != null)
  return mount
}

export function mountProductionRenderer(mount: HTMLElement, renderer: ReactElement): Root {
  const root = createRoot(mount)
  root.render(<StrictMode>{renderer}</StrictMode>)
  return root
}
