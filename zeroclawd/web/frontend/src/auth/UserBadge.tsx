import { usePrivyAuth } from './usePrivyAuth'

function shortAddress(value: string | undefined): string {
  if (!value) return ''
  if (value.length <= 12) return value
  return `${value.slice(0, 6)}…${value.slice(-4)}`
}

/**
 * Shows the signed-in user's identity (email/phone/wallet/telegram) plus a
 * Sign out button. Renders nothing when Privy is unconfigured.
 */
export default function UserBadge({ onLoggedOut }: { onLoggedOut?: () => void }) {
  const { ready, authenticated, user, logout, unconfigured } = usePrivyAuth()

  if (unconfigured || !ready || !authenticated || !user) return null

  // Resolve a display identity from linked accounts
  const email = user.email?.address
  const phone = user.phone?.number
  const wallet = user.wallet?.address
  const google = user.google?.email
  const telegram = user.telegram?.username
  const display = email || phone || google || (telegram ? `@${telegram}` : undefined) || shortAddress(wallet)

  return (
    <div className="auth-badge">
      <span className="auth-badge__id" title={user.id}>
        {display || shortAddress(wallet)}
      </span>
      <button
        type="button"
        className="btn-auth-logout"
        onClick={async () => {
          await logout()
          onLoggedOut?.()
        }}
        title="Sign out"
      >
        Sign out
      </button>
    </div>
  )
}