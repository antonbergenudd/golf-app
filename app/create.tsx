import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { GolfChrome } from "@/components/fairway/GolfChrome";
import { AppButton } from "@/components/ui/AppButton";
import { databaseService } from "@/services/databaseService";
import { saveGameSession, savePlayerName, loadSavedPlayerName } from "@/services/gameSession";

export default function CreateLobbyScreen() {
  const today = new Date();
  const defaultName = `Golf Game ${today.getDate()}/${today.getMonth() + 1}`;
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
      Alert.alert("Missing", "Please enter a game name.");
      return;
    }
    if (!pn) {
      Alert.alert("Missing", "Please enter your name.");
      return;
    }
    setLoading(true);
    await savePlayerName(pn);
    const playerId = `player_${Date.now()}`;
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
      Alert.alert("Error", String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <GolfChrome>
      <SafeAreaView className="flex-1" edges={["top", "bottom"]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          className="flex-1"
        >
          <View className="flex-row items-center justify-between border-b border-[#2A5030]/80 px-4 py-3">
            <Pressable onPress={() => router.back()} hitSlop={12}>
              <Ionicons name="chevron-back" size={22} color="#D4AF37" />
            </Pressable>
            <Text className="text-lg font-bold text-white">New game</Text>
            <View style={{ width: 22 }} />
          </View>

          <View className="flex-1 px-6 pt-4">
            <Text className="mb-2 text-[11px] font-bold uppercase tracking-[3.2px] text-[#6B9872]">
              Host
            </Text>
            <Text className="mb-2 text-[28px] font-extrabold tracking-tight text-white">
              Set up your game
            </Text>
            <Text className="mb-8 text-[15px] leading-snug text-[#C8DCC9]">
              Share the lobby code with friends once the table is ready.
            </Text>

            <FieldLabel>Game name</FieldLabel>
            <TextInput
              value={lobbyName}
              onChangeText={setLobbyName}
              placeholder="e.g. Sunday scramble"
              placeholderTextColor="#3D6644"
              maxLength={30}
              className="mb-5 rounded-[14px] border border-[#2A5030] bg-[#1C3D22] px-4 py-[18px] text-base text-white"
            />

            <FieldLabel>Your name</FieldLabel>
            <TextInput
              value={playerName}
              onChangeText={setPlayerName}
              placeholder="How should others see you?"
              placeholderTextColor="#3D6644"
              maxLength={20}
              className="mb-9 rounded-[14px] border border-[#2A5030] bg-[#1C3D22] px-4 py-[18px] text-base text-white"
            />

            <AppButton label="Create lobby" loading={loading} onPress={create} />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </GolfChrome>
  );
}

function FieldLabel({ children }: { children: string }) {
  return (
    <Text className="mb-2 text-xs font-semibold text-[#B8D4BF]">{children}</Text>
  );
}
