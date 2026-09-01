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
import { Font } from "@/theme/fonts";
import { databaseService } from "@/services/databaseService";
import {
  getOrCreateDevicePlayerId,
  saveGameSession,
  savePlayerName,
  loadSavedPlayerName,
} from "@/services/gameSession";
import { alertWeb } from "@/utils/blurForModalWeb";
import { formatDatabaseError } from "@/utils/formatDatabaseError";

export default function CreateLobbyScreen() {
  const today = new Date();
  const defaultName = `Fairway Chaos ${today.getDate()}/${today.getMonth() + 1}`;
  const [lobbyName, setLobbyName] = useState(defaultName);
  const [playerName, setPlayerName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void loadSavedPlayerName().then((n) => {
      if (n) setPlayerName(n);
    });
  }, []);

  async function create() {
    const ln = lobbyName.trim();
    const pn = playerName.trim();
    if (!ln) {
      alertWeb("Missing", "Please enter a game name.");
      return;
    }
    if (!pn) {
      alertWeb("Missing", "Please enter your name.");
      return;
    }
    setLoading(true);
    await savePlayerName(pn);
    const playerId = await getOrCreateDevicePlayerId();
    try {
      const lobbyId = await databaseService.createLobby({
        lobbyName: ln,
        hostId: playerId,
        hostName: pn,
      });
      const lobby = await databaseService.getLobbyById(lobbyId);
      if (!lobby) throw new Error("Could not load lobby");
      await saveGameSession({
        lobbyId,
        lobbyCode: lobby.code,
        playerId,
        playerName: pn,
        gameId: lobby.gameId ?? null,
      });
      router.replace({
        pathname: "/lobby/[lobbyId]",
        params: { lobbyId, playerId, playerName: pn },
      });
    } catch (e) {
      alertWeb("Could not create lobby", formatDatabaseError(e));
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
            <Text style={styles.headerTitle}>New game</Text>
            <View style={styles.headerSpacer} />
          </View>

          <View style={styles.body}>
            <Text style={styles.kicker}>Host</Text>
            <Text style={styles.headline}>Set up your game</Text>
            <Text style={styles.subtitle}>
              Share the lobby code with friends once the table is ready.
            </Text>

            <FieldLabel>Game name</FieldLabel>
            <TextInput
              value={lobbyName}
              onChangeText={setLobbyName}
              placeholder="e.g. Sunday scramble"
              placeholderTextColor="#3D6644"
              maxLength={30}
              style={styles.input}
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

            <AppButton
              label="Create lobby"
              loading={loading}
              onPress={create}
            />
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
  /** Matches home “Fairway”-style kicker — semibold, not heavy black */
  kicker: {
    fontFamily: Font.semiBold,
    marginBottom: 8,
    fontSize: 11,
    fontWeight: "normal",
    letterSpacing: 3.2,
    textTransform: "uppercase",
    color: "#6B9872",
  },
  /** Large title: Material-style bold (700), not extra-black (800) */
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
});
