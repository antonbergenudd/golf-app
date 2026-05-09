import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import { SafeAreaView } from "react-native-safe-area-context";

import { GolfChrome } from "@/components/fairway/GolfChrome";
import { AppButton } from "@/components/ui/AppButton";
import type { GameMode } from "@/models/gameMode";
import { gameModeName } from "@/models/gameMode";
import type { Lobby } from "@/models/lobby";
import { lobbyHelpers } from "@/models/lobby";
import { databaseService } from "@/services/databaseService";
import { saveGameSession, clearGameSession } from "@/services/gameSession";

const PLAYER_DOT = ["#D4AF37", "#60A5FA", "#F87171", "#34D399"];

export default function LobbyRoomScreen() {
  const params = useLocalSearchParams<{
    lobbyId: string;
    playerId: string;
    playerName: string;
  }>();
  const lobbyId = String(params.lobbyId ?? "");
  const playerId = String(params.playerId ?? "");
  const playerName = String(params.playerName ?? "");

  const [lobby, setLobby] = useState<Lobby | null>(null);
  const [holes, setHoles] = useState(18);
  const [mode, setMode] = useState<GameMode>("classic");
  const [qrOpen, setQrOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const navigatedRef = useRef(false);

  useEffect(() => {
    const unsub = databaseService.subscribeLobby(lobbyId, (l) => {
      setLobby(l);
      if (l) {
        setHoles(l.plannedHoles);
        setMode(l.plannedMode);
        void saveGameSession({
          lobbyId: l.id,
          lobbyCode: l.code,
          playerId,
          playerName,
          gameId: l.gameId ?? null,
        });
      }
    });
    return unsub;
  }, [lobbyId, playerId, playerName]);

  const isHost = lobby?.hostId === playerId;

  useEffect(() => {
    if (!lobby || navigatedRef.current) return;
    if (
      lobby.status === "active" &&
      lobby.gameId &&
      !isHost
    ) {
      navigatedRef.current = true;
      router.replace({
        pathname: "/game/[gameId]",
        params: {
          gameId: lobby.gameId,
          playerId,
          playerName,
          lobbyId: lobby.id,
          lobbyCode: lobby.code,
          lobbyName: lobby.name,
        },
      });
    }
  }, [lobby, isHost, playerId, playerName]);

  const leave = useCallback(async () => {
    Alert.alert(
      isHost ? "Close lobby?" : "Leave lobby?",
      isHost
        ? "Players will be returned home."
        : "You can rejoin with the same code if seats remain.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: isHost ? "Close" : "Leave",
          style: "destructive",
          onPress: async () => {
            await databaseService.leaveLobby(lobbyId, playerId);
            await clearGameSession();
            router.replace("/");
          },
        },
      ],
    );
  }, [isHost, lobbyId, playerId]);

  async function startGame() {
    if (!lobby) return;
    setStarting(true);
    try {
      await databaseService.updateLobbyPlannedSettings(lobbyId, {
        holes,
        mode,
      });
      const gameId = await databaseService.startGameFromLobby(lobbyId);
      navigatedRef.current = true;
      await saveGameSession({
        lobbyId,
        lobbyCode: lobby.code,
        playerId,
        playerName,
        gameId,
      });
      router.replace({
        pathname: "/game/[gameId]",
        params: {
          gameId,
          playerId,
          playerName,
          lobbyId,
          lobbyCode: lobby.code,
          lobbyName: lobby.name,
        },
      });
    } catch (e) {
      Alert.alert("Could not start", String(e));
    } finally {
      setStarting(false);
    }
  }

  const title = lobby?.name ?? "Lobby";

  function renderBody() {
    if (!lobby) {
      return (
        <View className="flex-1 items-center justify-center py-20">
          <Text className="text-[#6B9872]">Loading lobby…</Text>
        </View>
      );
    }

    if (lobby.status === "closed") {
      void clearGameSession();
      router.replace("/");
      return null;
    }

    return (
      <ScrollView contentContainerClassName="px-5 pb-16 pt-2">
        <View className="mb-6 flex-row items-center justify-between">
          <View>
            <Text className="text-[11px] font-bold uppercase tracking-widest text-[#6B9872]">
              Lobby code
            </Text>
            <Text className="mt-1 text-4xl font-black tracking-[12px] text-[#D4AF37]">
              {lobby.code}
            </Text>
          </View>
          <Pressable
            onPress={() => setQrOpen(true)}
            className="rounded-2xl border border-[#2A5030] bg-[#142918]/95 p-3"
          >
            <Ionicons name="qr-code" size={28} color="#D4AF37" />
          </Pressable>
        </View>

        <View className="mb-6 rounded-[18px] border border-[#2A5030] bg-[#142918]/92 p-4">
          <Text className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#B8D4BF]">
            Players ({lobby.players.length}/{lobby.maxPlayers})
          </Text>
          {lobby.players.map((p, i) => (
            <View
              key={p.id}
              className="mb-2 flex-row items-center rounded-xl bg-black/15 px-3 py-2.5"
            >
              <View
                className="mr-3 h-9 w-9 rounded-full"
                style={{ backgroundColor: PLAYER_DOT[i % PLAYER_DOT.length] }}
              />
              <Text className="flex-1 text-base font-semibold text-white">
                {p.name}
                {p.isHost ? (
                  <Text className="text-xs font-normal text-[#6B9872]">
                    {" "}
                    · Host
                  </Text>
                ) : null}
              </Text>
            </View>
          ))}
        </View>

        {isHost && lobbyHelpers.isWaiting(lobby) && (
          <View className="mb-6 rounded-[18px] border border-[#2A5030] bg-[#0F1A12]/90 p-4">
            <Text className="mb-3 text-sm font-bold text-white">
              Round setup
            </Text>
            <Text className="mb-2 text-xs text-[#B8D4BF]">Holes</Text>
            <View className="mb-4 flex-row flex-wrap gap-2">
              {[9, 18, 27].map((h) => (
                <Pressable
                  key={h}
                  onPress={() => setHoles(h)}
                  className={`rounded-xl px-4 py-2 ${holes === h ? "bg-[#D4AF37]" : "border border-[#2A5030] bg-[#1C3D22]"}`}
                >
                  <Text
                    className={`font-semibold ${holes === h ? "text-[#071209]" : "text-white"}`}
                  >
                    {h}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text className="mb-2 text-xs text-[#B8D4BF]">Mode</Text>
            <View className="mb-4 flex-row gap-2">
              {(["classic", "beer_run"] as GameMode[]).map((m) => (
                <Pressable
                  key={m}
                  onPress={() => setMode(m)}
                  className={`flex-1 rounded-xl px-3 py-3 ${mode === m ? "bg-[#D4AF37]" : "border border-[#2A5030] bg-[#1C3D22]"}`}
                >
                  <Text
                    className={`text-center text-sm font-bold ${mode === m ? "text-[#071209]" : "text-white"}`}
                  >
                    {gameModeName(m)}
                  </Text>
                </Pressable>
              ))}
            </View>
            <AppButton
              label="Start round"
              loading={starting}
              onPress={startGame}
            />
          </View>
        )}

        {!isHost && lobbyHelpers.isWaiting(lobby) && (
          <Text className="text-center text-[15px] text-[#C8DCC9]">
            Waiting for the host to start…
          </Text>
        )}
      </ScrollView>
    );
  }

  return (
    <GolfChrome>
      <SafeAreaView className="flex-1" edges={["top"]}>
        <View className="flex-row items-center justify-between border-b border-[#2A5030]/80 px-4 py-3">
          <Pressable onPress={leave}>
            <Text className="text-xs font-semibold text-[#D4AF37]">
              {isHost ? "Close" : "Leave"}
            </Text>
          </Pressable>
          <Text className="max-w-[60%] flex-1 text-center text-lg font-bold text-white" numberOfLines={1}>
            {title}
          </Text>
          <View style={{ width: 48 }} />
        </View>
        {renderBody()}

        <Modal visible={qrOpen} transparent animationType="fade">
          <Pressable
            className="flex-1 items-center justify-center bg-black/70 px-6"
            onPress={() => setQrOpen(false)}
          >
            <Pressable
              onPress={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-[20px] border border-[#2A5030] bg-[#142918] p-6"
            >
              <Text className="mb-4 text-center text-lg font-bold text-white">
                Scan to Join
              </Text>
              <View className="items-center rounded-xl bg-white p-4">
                {lobby ? (
                  <QRCode value={lobby.code} size={200} />
                ) : null}
              </View>
              <Text className="mt-4 text-center text-[28px] font-black tracking-[8px] text-[#D4AF37]">
                {lobby?.code}
              </Text>
              <Pressable onPress={() => setQrOpen(false)} className="mt-4">
                <Text className="text-center text-[#D4AF37]">Close</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
      </SafeAreaView>
    </GolfChrome>
  );
}
