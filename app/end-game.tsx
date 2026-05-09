import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { GolfChrome } from "@/components/fairway/GolfChrome";
import { AppButton } from "@/components/ui/AppButton";
import {
  gameCurrencyLabel,
  gameModeName,
  parseGameMode,
} from "@/models/gameMode";
import { databaseService } from "@/services/databaseService";
import { clearGameSession } from "@/services/gameSession";

export default function EndGameScreen() {
  const p = useLocalSearchParams<{
    gameId: string;
    lobbyName: string;
    currentPlayerId: string;
    namesJson?: string;
  }>();

  const gameId = String(p.gameId ?? "");
  const lobbyName = String(p.lobbyName ?? "");
  const currentPlayerId = String(p.currentPlayerId ?? "");

  const nameMap = useMemo(() => {
    const raw = String(p.namesJson ?? "{}");
    try {
      return JSON.parse(decodeURIComponent(raw)) as Record<string, string>;
    } catch {
      try {
        return JSON.parse(raw) as Record<string, string>;
      } catch {
        return {};
      }
    }
  }, [p.namesJson]);

  const [gameRow, setGameRow] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    return databaseService.subscribeGame(gameId, setGameRow);
  }, [gameId]);

  async function playAgain() {
    await clearGameSession();
    router.replace("/");
  }

  if (!gameRow) {
    return (
      <GolfChrome>
        <View className="flex-1 items-center justify-center">
          <Text className="text-[#6B9872]">Loading scores…</Text>
        </View>
      </GolfChrome>
    );
  }

  const mode = parseGameMode(gameRow.mode);
  const rawPoints = (gameRow.player_points as Record<string, number>) ?? {};
  const entries = Object.entries(nameMap).map(([id, name]) => ({
    id,
    name,
    points: rawPoints[id] ?? 0,
  }));
  entries.sort((a, b) => b.points - a.points);

  return (
    <GolfChrome>
      <SafeAreaView className="flex-1" edges={["top", "bottom"]}>
        <ScrollView contentContainerClassName="px-6 pb-12 pt-10">
          <Text className="mb-2 text-center text-[11px] font-bold uppercase tracking-[3px] text-[#6B9872]">
            {gameModeName(mode)}
          </Text>
          <Text className="mb-2 text-center text-[28px] font-extrabold text-white">
            {lobbyName}
          </Text>
          <Text className="mb-10 text-center text-sm text-[#9AB79F]">
            Final balance in {gameCurrencyLabel(mode, { short: true })}
          </Text>

          {entries.map((row, index) => (
            <View
              key={row.id}
              className="mb-3 flex-row items-center justify-between rounded-[14px] border border-[#2A5030] bg-[#142918]/95 px-4 py-3"
            >
              <Text className="text-base font-bold text-white">
                #{index + 1} {row.name}
                {row.id === currentPlayerId ? " (you)" : ""}
              </Text>
              <Text className="text-lg font-black text-[#D4AF37]">{row.points}</Text>
            </View>
          ))}

          <View className="mt-10">
            <AppButton label="Play again" onPress={playAgain} />
          </View>
        </ScrollView>
      </SafeAreaView>
    </GolfChrome>
  );
}
