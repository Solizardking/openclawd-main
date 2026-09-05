import { useMobileWallet } from "@wallet-ui/react-native-web3js";
import { useCallback, useEffect, useState } from "react";
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { CLAWDBOT_IDENTITY, LOCAL_CONSOLE_URL } from "./identity";

type Health = {
  status?: string;
  agent?: string;
  package?: string;
  product?: string;
};

export function HomeScreen() {
  const { account, connect, disconnect, signIn } = useMobileWallet();
  const [health, setHealth] = useState<Health | null>(null);
  const [healthError, setHealthError] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const refreshHealth = useCallback(async () => {
    setHealthError("");
    try {
      const res = await fetch(`${LOCAL_CONSOLE_URL}/api/health`);
      const body = (await res.json()) as Health;
      setHealth(body);
    } catch (err) {
      setHealth(null);
      setHealthError(
        err instanceof Error ? err.message : "console unreachable",
      );
    }
  }, []);

  useEffect(() => {
    void refreshHealth();
  }, [refreshHealth]);

  const onConnect = async () => {
    setBusy(true);
    setNote("");
    try {
      await connect();
      setNote("Wallet authorized. Session is cached in expo-secure-store.");
    } catch (err) {
      setNote(err instanceof Error ? err.message : "connect failed");
    } finally {
      setBusy(false);
    }
  };

  const onDisconnect = async () => {
    setBusy(true);
    setNote("");
    try {
      await disconnect();
      setNote("Deauthorized. Secure cache cleared.");
    } catch (err) {
      setNote(err instanceof Error ? err.message : "disconnect failed");
    } finally {
      setBusy(false);
    }
  };

  const onSignIn = async () => {
    setBusy(true);
    setNote("");
    try {
      await signIn({
        domain: "cheshireterminal.ai",
        statement: "Sign in to Clawd Bot",
      });
      setNote("Signed in with Solana.");
    } catch (err) {
      setNote(err instanceof Error ? err.message : "sign-in failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.wrap}>
        <Text style={styles.kicker}>Solana Mobile · MWA</Text>
        <Text style={styles.title}>{CLAWDBOT_IDENTITY.name}</Text>
        <Text style={styles.body}>
          Connect a Seeker / MWA wallet. Authorization is cached with
          expo-secure-store so the session survives app restarts. Live trading
          stays on the clawdbot binary with paper mode first (Law V).
        </Text>

        <View style={styles.card}>
          <Text style={styles.label}>Wallet</Text>
          <Text style={styles.mono}>
            {account?.address ?? "not connected"}
          </Text>
          {account ? (
            <Pressable
              style={styles.button}
              onPress={onDisconnect}
              disabled={busy}
            >
              <Text style={styles.buttonText}>Disconnect</Text>
            </Pressable>
          ) : (
            <Pressable style={styles.button} onPress={onConnect} disabled={busy}>
              <Text style={styles.buttonText}>Connect Wallet</Text>
            </Pressable>
          )}
          <Pressable
            style={[styles.button, styles.ghost]}
            onPress={onSignIn}
            disabled={busy}
          >
            <Text style={styles.ghostText}>Sign In with Solana</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Local clawdbot console</Text>
          <Text style={styles.mono}>{LOCAL_CONSOLE_URL}</Text>
          <Text style={styles.body}>
            {health
              ? `${health.agent ?? "Clawd Bot"} · ${health.status ?? "?"} · ${health.package ?? ""}`
              : healthError || "start `clawdbot web --no-browser` on this machine"}
          </Text>
          <Pressable
            style={[styles.button, styles.ghost]}
            onPress={refreshHealth}
          >
            <Text style={styles.ghostText}>Probe /api/health</Text>
          </Pressable>
        </View>

        {note ? <Text style={styles.note}>{note}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0B1020" },
  wrap: { padding: 24, gap: 16 },
  kicker: { color: "#14F195", letterSpacing: 2, fontSize: 12 },
  title: { color: "#F8FAFC", fontSize: 32, fontWeight: "700" },
  body: { color: "#94A3B8", fontSize: 15, lineHeight: 22 },
  card: {
    backgroundColor: "#111827",
    borderRadius: 16,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: "#1F2937",
  },
  label: { color: "#67E8F9", fontSize: 12, textTransform: "uppercase" },
  mono: { color: "#E2E8F0", fontFamily: "monospace", fontSize: 13 },
  button: {
    backgroundColor: "#14F195",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  buttonText: { color: "#052E16", fontWeight: "700" },
  ghost: { backgroundColor: "transparent", borderWidth: 1, borderColor: "#334155" },
  ghostText: { color: "#E2E8F0", fontWeight: "600" },
  note: { color: "#FBBF24", fontSize: 13 },
});
