import * as SecureStore from "expo-secure-store";
import type { Cache } from "@wallet-ui/react-native-web3js";
import { PublicKey, type PublicKeyInitData } from "@solana/web3.js";

const STORAGE_KEY = "clawdbot-mwa-authorization-cache";

function cacheReviver(key: string, value: unknown) {
  if (key === "publicKey") {
    return new PublicKey(value as PublicKeyInitData);
  }
  return value;
}

export function createSecureStoreCache<T>(): Cache<T> {
  return {
    async get(): Promise<T | undefined> {
      const result = await SecureStore.getItemAsync(STORAGE_KEY);
      if (!result) {
        return undefined;
      }
      try {
        return JSON.parse(result, cacheReviver) as T;
      } catch {
        return undefined;
      }
    },
    async set(value: T): Promise<void> {
      await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(value));
    },
    async clear(): Promise<void> {
      await SecureStore.deleteItemAsync(STORAGE_KEY);
    },
  };
}

export { cacheReviver, STORAGE_KEY };
