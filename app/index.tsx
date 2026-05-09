import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { GolfChrome } from "@/components/fairway/GolfChrome";
import { databaseService } from "@/services/databaseService";
import {
  clearGameSession,
  loadGameSession,
  type GameSession,
} from "@/services/gameSession";

export default function HomeScreen() {
  const [session, setSession] = useState<GameSession | null>(null);
  const [resuming, setResuming] = useState(false);

  const refreshSession = useCallback(async () => {
    const s = await loadGameSession();
    setSession(s);
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const dismissResume = async () => {
    await clearGameSession();
    setSession(null);
  };

  const resume = async () => {
    const s = session;
    if (!s || resuming) return;
    setResuming(true);
    try {
      const lobby = await databaseService.getLobbyById(s.lobbyId);
      if (!lobby || lobby.status === "closed") {
        await clearGameSession();
        setSession(null);
        Alert.alert("Unavailable", "That lobby is no longer available.");
        return;
      }
      if (lobby.status === "completed") {
        await clearGameSession();
        setSession(null);
        Alert.alert("Ended", "That round has already ended.");
        return;
      }
      if (!lobby.players.some((p) => p.id === s.playerId)) {
        await clearGameSession();
        setSession(null);
        Alert.alert("Unavailable", "You are no longer in that lobby.");
        return;
      }

      const gid = lobby.gameId ?? s.gameId ?? undefined;
      if (lobby.status === "active" && gid) {
        router.push({
          pathname: "/game/[gameId]",
          params: {
            gameId: gid,
            playerId: s.playerId,
            playerName: s.playerName,
            lobbyId: lobby.id,
            lobbyCode: lobby.code,
            lobbyName: lobby.name,
          },
        });
      } else {
        router.push({
          pathname: "/lobby/[lobbyId]",
          params: {
            lobbyId: lobby.id,
            playerId: s.playerId,
            playerName: s.playerName,
          },
        });
      }
      const refreshed = await loadGameSession();
      setSession(refreshed);
    } catch (e) {
      Alert.alert("Resume failed", String(e));
    } finally {
      setResuming(false);
    }
  };

  return (
    <GolfChrome>
      <SafeAreaView className="flex-1" edges={["top", "bottom"]}>
        <ScrollView
          contentContainerClassName="flex-grow px-6 pb-10 pt-3"
          keyboardShouldPersistTaps="handled"
        >
          <View className="mb-10 mt-2 items-center">
            <View className="mb-7 h-[100px] w-[100px] items-center justify-center rounded-full border border-[#D4AF37]/45 bg-[#1E3D26] shadow-lg shadow-[#D4AF37]/20">
              <Ionicons name="golf" size={44} color="#D4AF37" />
            </View>
            <Text className="mb-1.5 text-center text-[13px] font-semibold uppercase tracking-[3.2px] text-[#B8D4BF]/90">
              Fairway
            </Text>
            <Text className="mb-3.5 text-center text-[44px] font-extrabold leading-none tracking-tight text-white">
              Golf Game
            </Text>
            <Text className="max-w-md px-2 text-center text-[15px] leading-[1.45] text-white/78">
              A laid-back party round with cards that bend the rules — easy to
              scan, hard to put down.
            </Text>
          </View>

          {session != null && (
            <Pressable
              onPress={resuming ? undefined : resume}
              className="mb-10 rounded-[22px] border border-[#D4AF37]/40 bg-[#14261A]/92 px-4 py-3.5 active:opacity-90"
            >
              <View className="flex-row items-center">
                <Ionicons name="refresh" size={28} color="#D4AF37" />
                <View className="ml-3 flex-1">
                  <Text className="text-base font-bold text-white">
                    Resume your round
                  </Text>
                  <Text className="mt-1 text-[13px] leading-snug text-white/72">
                    {session.lobbyCode.trim()
                      ? `Code ${session.lobbyCode.trim().toUpperCase()}`
                      : "Tap to return to your lobby or game"}
                  </Text>
                </View>
                {resuming ? (
                  <Text className="text-[#D4AF37]">…</Text>
                ) : (
                  <Pressable onPress={dismissResume} hitSlop={12}>
                    <Ionicons name="close" size={22} color="rgba(255,255,255,0.45)" />
                  </Pressable>
                )}
              </View>
            </Pressable>
          )}

          <GameTile
            variant="host"
            icon="add-circle-outline"
            title="Host a round"
            subtitle="Create a lobby, share the code, deal the chaos."
            hint="Best for the friend who brought the speaker"
            onPress={() => router.push("/create")}
          />

          <View className="h-3.5" />

          <GameTile
            variant="join"
            icon="people-outline"
            title="Join with code"
            subtitle="Already have a lobby? Slip in and grab your bag."
            hint="Quick entry — no account drama"
            onPress={() => router.push("/join")}
          />

          <Text className="mt-7 text-center text-xs tracking-wide text-[#6B9872]/85">
            Cards · twists · bragging rights
          </Text>
        </ScrollView>
      </SafeAreaView>
    </GolfChrome>
  );
}

function GameTile({
  variant,
  icon,
  title,
  subtitle,
  hint,
  onPress,
}: {
  variant: "host" | "join";
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  hint: string;
  onPress: () => void;
}) {
  const host = variant === "host";
  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-start rounded-[26px] border px-[18px] py-[18px] active:scale-[0.98] ${
        host
          ? "border-[#D4AF37]/55 bg-[#14261A]/92 shadow-lg shadow-black/35"
          : "border-white/12 bg-[#0F1A12]/88 shadow-lg shadow-black/35"
      }`}
    >
      <View
        className={`mr-4 h-[54px] w-[54px] items-center justify-center rounded-2xl border ${
          host ? "border-[#D4AF37]/35 bg-black/20" : "border-white/[0.08] bg-[#1C2E22]"
        }`}
      >
        <Ionicons
          name={icon}
          size={28}
          color={host ? "#D4AF37" : "#7FA386"}
        />
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-lg font-bold tracking-tight text-white">{title}</Text>
        <Text className="mt-1.5 text-[13.5px] leading-snug text-white/72">
          {subtitle}
        </Text>
        <Text className="mt-2.5 text-[11px] italic text-[#6B9872]/95">{hint}</Text>
      </View>
      <Ionicons
        name="chevron-forward"
        size={22}
        color={host ? "rgba(212,175,55,0.9)" : "rgba(255,255,255,0.35)"}
        style={{ marginTop: 4 }}
      />
    </Pressable>
  );
}
