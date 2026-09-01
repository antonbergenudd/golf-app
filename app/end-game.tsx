import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { GolfChrome } from "@/components/fairway/GolfChrome";
import { AppButton } from "@/components/ui/AppButton";
import { gameModeName, parseGameMode } from "@/models/gameMode";
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
  const [strokeTotals, setStrokeTotals] = useState<Record<string, number>>({});
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    setGameRow(null);
    setStrokeTotals({});
    void (async () => {
      try {
        const [row, totals] = await Promise.all([
          databaseService.fetchGameById(gameId),
          databaseService.getGameTotals(gameId),
        ]);
        if (!cancelled) {
          setGameRow(row);
          setStrokeTotals(totals);
        }
      } catch (e) {
        if (!cancelled) setLoadError(String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [gameId]);

  async function goToHome() {
    await clearGameSession();
    router.replace("/");
  }

  async function startNewRound() {
    await clearGameSession();
    router.replace("/create");
  }

  if (loadError !== null) {
    return (
      <GolfChrome>
        <View className="flex-1 items-center justify-center px-6">
          <Text className="font-sans text-center text-[#FF5252]">{loadError}</Text>
        </View>
      </GolfChrome>
    );
  }

  if (!gameRow) {
    return (
      <GolfChrome>
        <View className="flex-1 items-center justify-center">
          <Text className="font-sans text-[#6B9872]">Loading scores…</Text>
        </View>
      </GolfChrome>
    );
  }

  const mode = parseGameMode(gameRow.mode);
  const entries = Object.entries(nameMap).map(([id, name]) => ({
    id,
    name,
    totalStrokes: strokeTotals[id],
  }));
  entries.sort((a, b) => {
    const sa =
      a.totalStrokes != null && Number.isFinite(a.totalStrokes)
        ? a.totalStrokes
        : Number.POSITIVE_INFINITY;
    const sb =
      b.totalStrokes != null && Number.isFinite(b.totalStrokes)
        ? b.totalStrokes
        : Number.POSITIVE_INFINITY;
    if (sa !== sb) return sa - sb;
    return a.name.localeCompare(b.name);
  });

  return (
    <GolfChrome>
      <SafeAreaView className="flex-1" edges={["top", "bottom"]}>
        <ScrollView contentContainerClassName="px-6 pb-12 pt-10">
          <Text className="font-sans mb-2 text-center text-[11px] font-bold uppercase tracking-[3px] text-[#6B9872]">
            {gameModeName(mode)}
          </Text>
          <Text className="font-sans mb-2 text-center text-[28px] font-extrabold text-white">
            {lobbyName}
          </Text>
          <Text className="font-sans mb-10 text-center text-sm text-[#9AB79F]">
            Total strokes — lowest wins
          </Text>

          {entries.map((row, index) => (
            <View
              key={row.id}
              className="mb-3 flex-row items-center justify-between rounded-[14px] border border-[#2A5030] bg-[#142918]/95 px-4 py-3"
            >
              <Text className="font-sans text-base font-bold text-white">
                #{index + 1} {row.name}
                {row.id === currentPlayerId ? " (you)" : ""}
              </Text>
              <View className="items-end">
                <Text className="font-sans text-lg font-black text-[#D4AF37]">
                  {row.totalStrokes != null && Number.isFinite(row.totalStrokes)
                    ? row.totalStrokes
                    : "—"}
                </Text>
                <Text className="font-sans text-[10px] uppercase tracking-wider text-[#6B9872]">
                  strokes
                </Text>
              </View>
            </View>
          ))}

          <View className="mt-10">
            <AppButton label="Go to home" onPress={goToHome} />
            <View className="mt-3">
              <AppButton
                label="Start a new round"
                variant="muted"
                onPress={startNewRound}
              />
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </GolfChrome>
  );
}
