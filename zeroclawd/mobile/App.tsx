import { MobileWalletProvider } from "@wallet-ui/react-native-web3js";
import { StatusBar } from "react-native";
import { HomeScreen } from "./src/HomeScreen";
import {
  CLAWDBOT_CHAIN,
  CLAWDBOT_IDENTITY,
  CLAWDBOT_RPC,
} from "./src/identity";
import { createSecureStoreCache } from "./src/secure-store-cache";

const secureCache = createSecureStoreCache();

export function App() {
  return (
    <MobileWalletProvider
      endpoint={CLAWDBOT_RPC}
      chain={CLAWDBOT_CHAIN}
      identity={CLAWDBOT_IDENTITY}
      cache={secureCache}
    >
      <StatusBar barStyle="light-content" />
      <HomeScreen />
    </MobileWalletProvider>
  );
}
