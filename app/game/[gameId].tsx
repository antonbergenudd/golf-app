import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { GolfChrome } from "@/components/fairway/GolfChrome";
import { AppButton } from "@/components/ui/AppButton";
import { isChallengeCardType } from "@/models/card";
import {
  gameCurrencyLabel,
  gameModeName,
  parseGameMode,
} from "@/models/gameMode";
import type { Lobby } from "@/models/lobby";
import { databaseService } from "@/services/databaseService";

function normalizeGame(row: Record<string, unknown> | null) {
  if (!row) return null;
  return {
    currentHole: Number(row.current_hole ?? 1),
    holes: Number(row.holes ?? 18),
    mode: parseGameMode(row.mode),
    playerPoints: (row.player_points as Record<string, number>) ?? {},
    playerIds: (row.player_ids as string[]) ?? [],
    status: String(row.status ?? "active"),
    name: String(row.name ?? ""),
  };
}

export default function GameScreen() {
  const p = useLocalSearchParams<{
    gameId: string;
    playerId: string;
    playerName: string;
    lobbyId: string;
    lobbyCode: string;
    lobbyName: string;
  }>();

  const gameId = String(p.gameId ?? "");
  const playerId = String(p.playerId ?? "");
  const playerName = String(p.playerName ?? "");
  const lobbyId = String(p.lobbyId ?? "");
  const lobbyCode = String(p.lobbyCode ?? "");
  const lobbyName = String(p.lobbyName ?? "");

  const [game, setGame] = useState<ReturnType<typeof normalizeGame>>(null);
  const [myCardsDoc, setMyCardsDoc] = useState<Record<string, unknown> | null>(
    null,
  );
  const [events, setEvents] = useState<Record<string, unknown>[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const [lobbySnap, setLobbySnap] = useState<Lobby | null>(null);

  useEffect(() => {
    if (!lobbyId) return;
    return databaseService.subscribeLobby(lobbyId, setLobbySnap);
  }, [lobbyId]);

  useEffect(() => {
    const u1 = databaseService.subscribeGame(gameId, (row) =>
      setGame(normalizeGame(row)),
    );
    const u2 = databaseService.subscribePlayerCards(
      gameId,
      playerId,
      setMyCardsDoc,
    );
    const u3 = databaseService.subscribeGameEvents(gameId, setEvents);
    return () => {
      u1();
      u2();
      u3();
    };
  }, [gameId, playerId]);

  const cards = (myCardsDoc?.cards as Record<string, unknown>[]) ?? [];
  const challenges = cards.filter((c) =>
    isChallengeCardType(String(c.type)),
  );
  const actions = cards.filter((c) => c.type === "action");

  const myPoints = game?.playerPoints[playerId] ?? 0;
  const isHost = lobbySnap?.hostId === playerId;

  async function nextHole() {
    if (!game?.playerIds.length) return;
    setBusy("hole");
    try {
      await databaseService.nextHole(gameId, game.playerIds);
    } catch (e) {
      Alert.alert("Hole", String(e));
    } finally {
      setBusy(null);
    }
  }

  async function claimChallenge(card: Record<string, unknown>) {
    const id = String(card.id ?? "");
    const hole = Number(card.hole ?? game?.currentHole ?? 1);
    if (card.requiresWheelSpin === true) {
      router.push({
        pathname: "/wheel",
        params: { playerName, autoSpin: "1" },
      });
      return;
    }
    setBusy(id);
    try {
      await databaseService.markChallengeClaimed({
        gameId,
        playerId,
        cardId: id,
        cardHole: hole,
      });
      await databaseService.addGameEvent({
        gameId,
        playerId,
        playerName,
        eventType: "challenge_claimed",
        eventData: { cardId: id, title: card.title },
      });
    } catch (e) {
      Alert.alert("Challenge", String(e));
    } finally {
      setBusy(null);
    }
  }

  function openScorecard() {
    router.push({
      pathname: "/scorecard",
      params: {
        gameId,
        lobbyId,
        currentPlayerId: playerId,
      },
    });
  }

  function openEndGame() {
    const map =
      lobbySnap != null
        ? Object.fromEntries(lobbySnap.players.map((pl) => [pl.id, pl.name]))
        : Object.fromEntries(
            (game?.playerIds ?? []).map((id) => [
              id,
              id === playerId ? playerName : "Player",
            ]),
          );
    const namesJson = encodeURIComponent(JSON.stringify(map));
    router.push({
      pathname: "/end-game",
      params: {
        gameId,
        lobbyName,
        currentPlayerId: playerId,
        namesJson,
      },
    });
  }

  if (!game) {
    return (
      <GolfChrome>
        <View className="flex-1 items-center justify-center">
          <Text className="text-[#6B9872]">Loading game…</Text>
        </View>
      </GolfChrome>
    );
  }

  return (
    <GolfChrome>
      <SafeAreaView className="flex-1" edges={["top"]}>
        <View className="flex-row items-center border-b border-[#2A5030]/80 px-4 py-3">
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="chevron-back" size={22} color="#D4AF37" />
          </Pressable>
          <View className="flex-1 px-2">
            <Text className="text-center text-lg font-bold text-white" numberOfLines={1}>
              {lobbyName || game.name}
            </Text>
            <Text className="text-center text-xs text-[#6B9872]">
              Hole {game.currentHole}/{game.holes} · {gameModeName(game.mode)}
            </Text>
          </View>
          <Pressable onPress={() => router.push("/settings")}>
            <Ionicons name="settings-outline" size={22} color="#D4AF37" />
          </Pressable>
        </View>

        <View className="flex-row items-center justify-between px-5 py-3">
          <View>
            <Text className="text-[11px] uppercase tracking-wide text-[#6B9872]">
              Your balance
            </Text>
            <Text className="text-2xl font-black text-[#D4AF37]">
              {myPoints}{" "}
              <Text className="text-sm font-semibold text-[#B8D4BF]">
                {gameCurrencyLabel(game.mode, { short: true })}
              </Text>
            </Text>
          </View>
          <Pressable
            onPress={openScorecard}
            className="rounded-xl border border-[#2A5030] px-3 py-2"
          >
            <Text className="text-xs font-bold text-white">Scorecard</Text>
          </Pressable>
        </View>

        <ScrollView className="flex-1 px-5" contentContainerClassName="pb-28">
          <Text className="mb-2 text-xs font-bold uppercase tracking-wide text-[#B8D4BF]">
            Challenges
          </Text>
          {challenges.length === 0 ? (
            <Text className="mb-6 text-sm text-white/60">No challenges yet.</Text>
          ) : (
            challenges.map((c, i) => (
              <View
                key={`${String(c.id)}_${String(c.hole)}_${i}`}
                className="mb-3 rounded-[14px] border border-[#2A5030] bg-[#142918]/95 p-3"
              >
                <Text className="text-base font-bold text-white">{String(c.title)}</Text>
                <Text className="mt-1 text-sm leading-snug text-white/75">
                  {String(c.description)}
                </Text>
                <Pressable
                  onPress={() => claimChallenge(c)}
                  disabled={busy !== null}
                  className="mt-3 self-start rounded-lg bg-[#D4AF37] px-4 py-2"
                >
                  <Text className="text-sm font-bold text-[#071209]">
                    {c.requiresWheelSpin ? "Spin wheel first" : "Claim"}
                  </Text>
                </Pressable>
              </View>
            ))
          )}

          <Text className="mb-2 mt-4 text-xs font-bold uppercase tracking-wide text-[#B8D4BF]">
            Action offers & inventory
          </Text>
          {actions.length === 0 ? (
            <Text className="text-sm text-white/60">No action cards.</Text>
          ) : (
            actions.map((c, i) => (
              <View
                key={`a_${String(c.id)}_${i}`}
                className="mb-2 rounded-xl border border-[#2A5030]/80 bg-[#0F1A12]/90 px-3 py-2"
              >
                <Text className="font-semibold text-white">{String(c.title)}</Text>
              </View>
            ))
          )}

          <Text className="mb-2 mt-6 text-xs font-bold uppercase tracking-wide text-[#B8D4BF]">
            Recent feed
          </Text>
          {events.slice(0, 8).map((ev) => (
            <Text key={String(ev.id)} className="mb-1 text-xs text-white/55">
              • {String(ev.player_name)} — {String(ev.event_type)}
            </Text>
          ))}
        </ScrollView>

        <View className="border-t border-[#2A5030]/80 bg-[#071209]/98 px-5 pb-6 pt-3">
          <View className="flex-row gap-2">
            {isHost && (
              <View className="flex-1">
                <AppButton
                  label={busy === "hole" ? "…" : "Next hole"}
                  onPress={nextHole}
                  loading={busy === "hole"}
                />
              </View>
            )}
            <View className="flex-1">
              <AppButton variant="muted" label="End round" onPress={openEndGame} />
            </View>
          </View>
          <Text className="mt-2 text-center text-[10px] text-white/35">
            Code {lobbyCode}
          </Text>
        </View>
      </SafeAreaView>
    </GolfChrome>
  );
}
