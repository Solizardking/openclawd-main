import { useLogin } from '@privy-io/react-auth'
import { usePrivyAuth } from './usePrivyAuth'

/**
 * Pre-built Privy login modal trigger.
 *
 * Uses `useLogin` + `usePrivy` per Privy's quick-start docs:
 * - `login` opens the out-of-the-box modal on click.
 * - `onComplete` fires on successful auth so the console can refresh.
 * - `onError` surfaces login failures in the console.
 */
function LoginButtonInner({ onLoggedIn }: { onLoggedIn?: () => void }) {
  const { ready, authenticated } = usePrivyAuth()
  const { login } = useLogin({
    onComplete: () => {
      onLoggedIn?.()
    },
    onError: (error) => {
      console.error('[Privy] login failed', error)
    },
  })

  const disabled = !ready || (ready && authenticated)

  if (disabled) return null

  return (
    <button
      type="button"
      className="btn-auth-login"
      onClick={login}
      title="Sign in with Privy — email, Google, Telegram, or wallet"
    >
      <span className="auth-ico">🦞</span>
      Sign in
    </button>
  )
}

export default function LoginButton({ onLoggedIn }: { onLoggedIn?: () => void }) {
  const { unconfigured } = usePrivyAuth()

  if (unconfigured) return null

  return <LoginButtonInner onLoggedIn={onLoggedIn} />
}