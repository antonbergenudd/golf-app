import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { GolfChrome } from "@/components/fairway/GolfChrome";
import { AppButton } from "@/components/ui/AppButton";
import { databaseService } from "@/services/databaseService";
import {
  loadGameSession,
  saveGameSession,
  savePlayerName,
  loadSavedPlayerName,
} from "@/services/gameSession";
import { Font } from "@/theme/fonts";
import { alertWeb } from "@/utils/blurForModalWeb";
import { formatDatabaseError } from "@/utils/formatDatabaseError";

export default function JoinLobbyScreen() {
  const [code, setCode] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void loadSavedPlayerName().then((n) => {
      if (n) setPlayerName(n);
    });
  }, []);

  async function join() {
    const c = code.trim().toUpperCase();
    const pn = playerName.trim();
    if (c.length !== 6) {
      alertWeb("Code", "Please enter a valid 6-character code.");
      return;
    }
    if (!pn) {
      alertWeb("Name", "Please enter your name.");
      return;
    }
    setLoading(true);
    await savePlayerName(pn);
    try {
      const saved = await loadGameSession();
      let playerId = `player_${Date.now()}`;
      if (
        saved &&
        saved.lobbyCode.toUpperCase() === c &&
        saved.playerName === pn
      ) {
        playerId = saved.playerId;
      }

      const ok = await databaseService.joinLobby(c, playerId, pn);
      if (!ok) {
        alertWeb(
          "Can't join",
          "Lobby full, invalid code, or game already started.",
        );
        setLoading(false);
        return;
      }

      const lobby = await databaseService.findLobbyByCode(c);
      if (!lobby?.id) throw new Error("Lobby not found");

      await saveGameSession({
        lobbyId: lobby.id,
        lobbyCode: lobby.code,
        playerId,
        playerName: pn,
        gameId: lobby.gameId ?? null,
      });

      router.replace({
        pathname: "/lobby/[lobbyId]",
        params: { lobbyId: lobby.id, playerId, playerName: pn },
      });
    } catch (e) {
      alertWeb("Could not join", formatDatabaseError(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <GolfChrome>
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.flex}
        >
          <View style={styles.header}>
            <Pressable onPress={() => router.back()} hitSlop={12}>
              <Ionicons name="chevron-back" size={22} color="#D4AF37" />
            </Pressable>
            <Text style={styles.headerTitle}>Join game</Text>
            <View style={styles.headerSpacer} />
          </View>

          <View style={styles.body}>
            <Text style={styles.kicker}>Fairway</Text>
            <Text style={styles.headline}>Enter the code</Text>
            <Text style={styles.subtitle}>
              Ask the host for their six-character lobby code.
            </Text>

            <FieldLabel>Lobby code</FieldLabel>
            <TextInput
              value={code}
              onChangeText={(t) => setCode(t.toUpperCase())}
              autoCapitalize="characters"
              maxLength={6}
              placeholder="• • • • • •"
              placeholderTextColor="rgba(42,80,48,0.85)"
              style={styles.codeInput}
            />

            <FieldLabel>Your name</FieldLabel>
            <TextInput
              value={playerName}
              onChangeText={setPlayerName}
              placeholder="How should others see you?"
              placeholderTextColor="#3D6644"
              maxLength={20}
              style={[styles.input, styles.inputLast]}
            />

            <AppButton label="Join game" loading={loading} onPress={join} />

            <Pressable onPress={() => router.back()} style={styles.footer}>
              <Text style={styles.footerText}>
                Don&apos;t have a code?{" "}
                <Text style={styles.footerStrong}>Host a round</Text>
              </Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </GolfChrome>
  );
}

function FieldLabel({ children }: { children: string }) {
  return <Text style={styles.fieldLabel}>{children}</Text>;
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(42,80,48,0.8)",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: {
    fontFamily: Font.semiBold,
    fontSize: 17,
    fontWeight: "normal",
    letterSpacing: -0.2,
    color: "#FFFFFF",
  },
  headerSpacer: { width: 22 },
  body: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  kicker: {
    fontFamily: Font.semiBold,
    marginBottom: 8,
    fontSize: 11,
    fontWeight: "normal",
    letterSpacing: 3.2,
    textTransform: "uppercase",
    color: "#6B9872",
  },
  headline: {
    fontFamily: Font.bold,
    marginBottom: 8,
    fontSize: 28,
    fontWeight: "normal",
    letterSpacing: -0.45,
    color: "#FFFFFF",
  },
  subtitle: {
    fontFamily: Font.regular,
    marginBottom: 32,
    fontSize: 15,
    fontWeight: "normal",
    lineHeight: 15 * 1.45,
    color: "#C8DCC9",
  },
  fieldLabel: {
    fontFamily: Font.semiBold,
    marginBottom: 8,
    fontSize: 12,
    fontWeight: "normal",
    color: "#B8D4BF",
  },
  codeInput: {
    fontFamily: Font.bold,
    marginBottom: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#2A5030",
    backgroundColor: "#1C3D22",
    paddingVertical: 16,
    textAlign: "center",
    fontSize: 32,
    fontWeight: "normal",
    letterSpacing: 10,
    color: "#D4AF37",
  },
  input: {
    fontFamily: Font.regular,
    marginBottom: 20,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#2A5030",
    backgroundColor: "#1C3D22",
    paddingHorizontal: 16,
    paddingVertical: 18,
    fontSize: 16,
    fontWeight: "normal",
    color: "#FFFFFF",
  },
  inputLast: {
    marginBottom: 36,
  },
  footer: {
    marginTop: 32,
    alignItems: "center",
  },
  footerText: {
    fontFamily: Font.regular,
    textAlign: "center",
    fontSize: 14,
    fontWeight: "normal",
    color: "#6B9872",
  },
  footerStrong: {
    fontFamily: Font.bold,
    fontWeight: "normal",
    color: "#D4AF37",
  },
});
