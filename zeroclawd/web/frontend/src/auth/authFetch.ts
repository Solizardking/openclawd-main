import { useMemo } from 'react'
import { usePrivyAuth } from './usePrivyAuth'

export type { PrivyAuthState } from './usePrivyAuth'

/**
 * Returns an `fetch` wrapper that attaches the current Privy access token as a
 * `Authorization: Bearer <token>` header.
 *
 * The Go backend can verify this ES256 JWT with the `@privy-io/node` library
 * (or the `privy-auth` Go package) to authenticate API requests. When the app
 * is unconfigured (no VITE_PRIVY_APP_ID) or the user is signed out, requests
 * proceed without the header so the local console keeps working.
 */
export function createAuthFetch(getAccessToken: () => Promise<string | null>) {
  return async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const token = await getAccessToken()
    const headers = new Headers(init?.headers)

    if (token) {
      headers.set('Authorization', `Bearer ${token}`)
    }

    return fetch(input, { ...init, headers })
  }
}

export function useAuthFetch() {
  const { getAccessToken } = usePrivyAuth()
  // Stable reference so callers can safely use it in useCallback deps.
  return useMemo(() => createAuthFetch(getAccessToken), [getAccessToken])
}
