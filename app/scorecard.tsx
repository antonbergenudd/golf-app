import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { GolfChrome } from "@/components/fairway/GolfChrome";
import {
  gameCurrencyLabel,
  parseGameMode,
} from "@/models/gameMode";
import { isChallengeCardType } from "@/models/card";
import { databaseService } from "@/services/databaseService";

export default function ScorecardScreen() {
  const { gameId, lobbyId, currentPlayerId } = useLocalSearchParams<{
    gameId: string;
    lobbyId: string;
    currentPlayerId: string;
  }>();

  const gid = String(gameId ?? "");
  const lid = String(lobbyId ?? "");
  const selfId = String(currentPlayerId ?? "");

  const [names, setNames] = useState<Record<string, string>>({});
  const [gameRow, setGameRow] = useState<Record<string, unknown> | null>(null);
  const [cardsByPlayer, setCardsByPlayer] = useState<
    Record<string, Record<string, unknown>[]>
  >({});
  const [globalFx, setGlobalFx] = useState<Record<string, unknown> | null>(
    null,
  );

  useEffect(() => {
    const unsubLobby = databaseService.subscribeLobby(lid, (row) => {
      if (!row) return;
      const m: Record<string, string> = {};
      for (const p of row.players) m[p.id] = p.name;
      setNames(m);
    });
    return () => unsubLobby();
  }, [lid]);

  useEffect(() => {
    const u1 = databaseService.subscribeGame(gid, setGameRow);
    const u2 = databaseService.subscribeAllPlayerCards(gid, (docs) => {
      const map: Record<string, Record<string, unknown>[]> = {};
      for (const d of docs) {
        const pid = String(d.player_id ?? "");
        map[pid] = (d.cards as Record<string, unknown>[]) ?? [];
      }
      setCardsByPlayer(map);
    });
    const u3 = databaseService.subscribeGlobalEffects(gid, setGlobalFx);
    return () => {
      u1();
      u2();
      u3();
    };
  }, [gid]);

  if (!gameRow) {
    return (
      <GolfChrome>
        <View className="flex-1 items-center justify-center">
          <Text className="text-[#6B9872]">Loading…</Text>
        </View>
      </GolfChrome>
    );
  }

  const mode = parseGameMode(gameRow.mode);
  const rawPoints = (gameRow.player_points as Record<string, number>) ?? {};
  const rawHidden =
    (gameRow.hidden_balance_until_hole as Record<string, number>) ?? {};
  const currentHole = Number(gameRow.current_hole ?? 1);
  const playerIds = (gameRow.player_ids as string[]) ?? [];
  const directCards =
    (globalFx?.direct_cards as Record<string, unknown>[]) ?? [];

  return (
    <GolfChrome>
      <SafeAreaView className="flex-1" edges={["top"]}>
        <View className="flex-row items-center border-b border-[#2A5030]/80 px-4 py-3">
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="chevron-back" size={22} color="#D4AF37" />
          </Pressable>
          <Text className="flex-1 text-center text-lg font-bold text-white">
            Lobby
          </Text>
          <View style={{ width: 22 }} />
        </View>

        <ScrollView className="flex-1 px-5 pt-4" contentContainerClassName="pb-12">
          {playerIds.map((pid) => {
            const displayName = names[pid] ?? pid.slice(0, 8);
            const pts = rawPoints[pid] ?? 0;
            const hidden =
              (rawHidden[pid] ?? 0) >= currentHole && pid !== selfId;
            const cards = cardsByPlayer[pid] ?? [];
            const actions = cards
              .filter((c) => c.type === "action")
              .map((c) => String(c.title ?? "Action"));
            const chals = cards
              .filter((c) => isChallengeCardType(String(c.type)))
              .map((c) => String(c.title ?? "Challenge"));
            const directs = directCards
              .filter((c) => c.playerId === pid)
              .map((c) => String(c.title ?? "Direct"));

            return (
              <View
                key={pid}
                className="mb-4 rounded-[18px] border border-[#2A5030] bg-[#142918]/92 p-4"
              >
                <Text className="text-lg font-bold text-white">{displayName}</Text>
                <Text className="mt-1 text-sm text-[#B8D4BF]">
                  {hidden
                    ? "Balance hidden"
                    : `${pts} ${gameCurrencyLabel(mode, { short: true })}`}
                </Text>
                <Text className="mt-3 text-xs font-semibold uppercase text-[#6B9872]">
                  Challenges
                </Text>
                <Text className="text-sm text-white/80">
                  {chals.length ? chals.join(" · ") : "—"}
                </Text>
                <Text className="mt-2 text-xs font-semibold uppercase text-[#6B9872]">
                  Actions
                </Text>
                <Text className="text-sm text-white/80">
                  {actions.length ? actions.join(" · ") : "—"}
                </Text>
                <Text className="mt-2 text-xs font-semibold uppercase text-[#6B9872]">
                  Direct
                </Text>
                <Text className="text-sm text-white/80">
                  {directs.length ? directs.join(" · ") : "—"}
                </Text>
              </View>
            );
          })}
        </ScrollView>
      </SafeAreaView>
    </GolfChrome>
  );
}
