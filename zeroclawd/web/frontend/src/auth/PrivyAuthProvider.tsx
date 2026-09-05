import { PrivyProvider, type PrivyClientConfig } from '@privy-io/react-auth'
import { PrivyConfiguredContext } from './PrivyAuthContext'

/**
 * Privy client configuration for the Clawd Bot portal.
 *
 * Login methods are configured in the Privy Dashboard (email, Google, Telegram,
 * wallet). Here we only enforce the chain type shown in the wallet modal:
 * Solana-only, since this is the Solana/SVM + Robinhood EVM agent console.
 */
const privyConfig: PrivyClientConfig = {
  appearance: {
    theme: 'dark',
    accentColor: '#14F195',
    logo: '🦞',
    showWalletUIs: true,
  },
  embeddedWallets: {
    createOnLogin: 'all-users',
    noPromptOnSignature: false,
  },
  loginMethods: ['email', 'google', 'telegram', 'wallet'],
  walletChainType: 'solana-only',
}

export default function PrivyAuthProvider({ children }: { children: React.ReactNode }) {
  const appId = import.meta.env.VITE_PRIVY_APP_ID as string | undefined
  const configured = Boolean(appId && !appId.startsWith('clwd-placeholder'))

  if (!configured) {
    // Degrade gracefully: render children without Privy when not configured.
    return (
      <PrivyConfiguredContext.Provider value={{ configured: false }}>
        {children}
      </PrivyConfiguredContext.Provider>
    )
  }

  return (
    <PrivyConfiguredContext.Provider value={{ configured: true }}>
      <PrivyProvider appId={appId!} config={privyConfig}>
        {children}
      </PrivyProvider>
    </PrivyConfiguredContext.Provider>
  )
}