# Clawd Bot — Solana Mobile

React Native (Expo) client for the `clawdbot` binary. Wallet sessions use
[Mobile Wallet Adapter](https://docs.solanamobile.com/get-started/mobile-wallet-adapter)
via `@wallet-ui/react-native-web3js`, with authorization cached in
**expo-secure-store** (not plaintext AsyncStorage).

This app does **not** ship `.env.local`, `private.pem`, or any key material.
Connect is observe/sign-in; live execution stays on the Go CLI with paper
mode first (Six Laws I / III / V).

## Prerequisites

- Android SDK + an MWA wallet (Phantom, Solflare, or Seeker)
- Custom Expo dev client (`expo run:android`) — MWA Kotlin modules do not
  work in Expo Go
- Optional: `clawdbot web --no-browser` on the same machine so the app can
  probe `http://127.0.0.1:18800/api/health`

## Install

```bash
cd mobile
npx expo install expo-secure-store expo-dev-client
npm install @wallet-ui/react-native-web3js react-native-quick-crypto @solana/web3.js
npm run android
```

`polyfill.js` installs `react-native-quick-crypto` **before** `@solana/web3.js`.
`package.json` `"main"` is `./index.js` so that order is guaranteed.

## Authorization cache

`MobileWalletProvider` receives `cache={createSecureStoreCache()}` from
`src/secure-store-cache.ts`:

- `get()` — restore `auth_token` + account on launch
- `set()` — persist after authorize
- `clear()` — wipe on disconnect / deauthorize
- `cacheReviver` reconstitutes `PublicKey` from JSON

Override the local console URL with `EXPO_PUBLIC_CLAWD_CONSOLE_URL`.
Override RPC with `EXPO_PUBLIC_SOLANA_RPC_URL`.

## Identity

```
name: Clawd Bot
uri:  https://cheshireterminal.ai/zeroclawd
chain: solana:mainnet
```
