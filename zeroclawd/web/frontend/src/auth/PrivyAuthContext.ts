import { createContext, useContext } from 'react'

/**
 * Safe guard for whether Privy is configured. Components use this context to
 * short-circuit BEFORE calling any Privy hooks (usePrivy, useLogin, …) which
 * would throw when no PrivyProvider is mounted.
 */
export const PrivyConfiguredContext = createContext<{ configured: boolean }>({ configured: false })

export function usePrivyConfigured(): boolean {
  return useContext(PrivyConfiguredContext).configured
}