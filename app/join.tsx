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
import {
  loadGameSession,
  saveGameSession,
  savePlayerName,
  loadSavedPlayerName,
} from "@/services/gameSession";

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
      Alert.alert("Code", "Please enter a valid 6-character code.");
      return;
    }
    if (!pn) {
      Alert.alert("Name", "Please enter your name.");
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
        Alert.alert("Can't join", "Lobby full, invalid code, or game already started.");
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
            <Text className="text-lg font-bold text-white">Join game</Text>
            <View style={{ width: 22 }} />
          </View>

          <View className="flex-1 px-6 pt-4">
            <Text className="mb-2 text-[11px] font-bold uppercase tracking-[3.2px] text-[#6B9872]">
              Fairway
            </Text>
            <Text className="mb-2 text-[28px] font-extrabold tracking-tight text-white">
              Enter the code
            </Text>
            <Text className="mb-8 text-[15px] leading-snug text-[#C8DCC9]">
              Ask the host for their six-character lobby code.
            </Text>

            <Text className="mb-2 text-xs font-semibold text-[#B8D4BF]">
              Lobby code
            </Text>
            <TextInput
              value={code}
              onChangeText={(t) => setCode(t.toUpperCase())}
              autoCapitalize="characters"
              maxLength={6}
              placeholder="• • • • • •"
              placeholderTextColor="rgba(42,80,48,0.85)"
              className="mb-7 rounded-[14px] border border-[#2A5030] bg-[#1C3D22] py-4 text-center text-[32px] font-bold tracking-[10px] text-[#D4AF37]"
            />

            <Text className="mb-2 text-xs font-semibold text-[#B8D4BF]">
              Your name
            </Text>
            <TextInput
              value={playerName}
              onChangeText={setPlayerName}
              placeholder="How should others see you?"
              placeholderTextColor="#3D6644"
              maxLength={20}
              className="mb-9 rounded-[14px] border border-[#2A5030] bg-[#1C3D22] px-4 py-[18px] text-base text-white"
            />

            <AppButton label="Join game" loading={loading} onPress={join} />

            <Pressable onPress={() => router.back()} className="mt-8 items-center">
              <Text className="text-center text-sm text-[#6B9872]">
                Don&apos;t have a code?{" "}
                <Text className="font-bold text-[#D4AF37]">Host a round</Text>
              </Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </GolfChrome>
  );
}
