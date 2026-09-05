import { useCallback } from 'react'
import { useLogin, usePrivy, useLogout, type User } from '@privy-io/react-auth'
import { usePrivyConfigured } from './PrivyAuthContext'

export interface PrivyAuthState {
  /** True once Privy has finished hydrating the session (always true when unconfigured). */
  ready: boolean
  /** True when the user is authenticated. */
  authenticated: boolean
  /** Privy user object (null when unauthenticated or unconfigured). */
  user: User | null
  /** Open the Privy pre-built login modal. */
  login: () => void
  /** Sign out of the current Privy session. */
  logout: () => Promise<void>
  /** Get the current Privy access token (auto-refreshes if near expiry). */
  getAccessToken: () => Promise<string | null>
  /** True when Privy is not configured (VITE_PRIVY_APP_ID missing) — app runs open. */
  unconfigured: boolean
}

/** No-op fallbacks used when Privy is not configured. */
function noop() {}
async function noopAsync(): Promise<void> {}

const UNCONFIGURED_STATE: Omit<PrivyAuthState, 'login' | 'logout' | 'getAccessToken'> = {
  ready: true,
  authenticated: false,
  user: null,
  unconfigured: true,
}

/**
 * Thin hook over Privy's React SDK tuned for the Clawd Bot portal.
 *
 * When `VITE_PRIVY_APP_ID` is not set the hook reports `unconfigured: true`
 * and the app behaves as before (no auth gate) so local/dev stays usable.
 * Critical: this hook must NOT call any Privy hooks unless `usePrivyConfigured`
 * is true — otherwise React throws when no PrivyProvider is mounted.
 */
export function usePrivyAuth(): PrivyAuthState {
  const configured = usePrivyConfigured()

  const getAccessToken = useCallback(async (): Promise<string | null> => {
    return null
  }, [])

  const logout = useCallback(async (): Promise<void> => {
    return noopAsync()
  }, [])

  if (!configured) {
    return { ...UNCONFIGURED_STATE, login: noop, logout, getAccessToken }
  }

  const { ready, authenticated, user, getAccessToken: privyGetAccessToken } = usePrivy()
  const { login } = useLogin()
  const { logout: privyLogout } = useLogout()

  return {
    ready,
    authenticated,
    user: user ?? null,
    login,
    logout: async () => {
      try {
        await privyLogout()
      } catch {
        // noop — user already signed out
      }
    },
    getAccessToken: async () => {
      try {
        return await privyGetAccessToken()
      } catch {
        return null
      }
    },
    unconfigured: false,
  }
}