import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Clipboard from "expo-clipboard";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { GolfChrome } from "@/components/fairway/GolfChrome";
import { LobbyFooterButton } from "@/components/fairway/LobbyFooterButton";
import { Font } from "@/theme/fonts";
import type { GameMode } from "@/models/gameMode";
import { gameModeName } from "@/models/gameMode";
import type { Lobby, LobbyPlayer } from "@/models/lobby";
import { lobbyHelpers } from "@/models/lobby";
import { databaseService } from "@/services/databaseService";
import {
  blurActiveElementForModalWeb,
  blurIfFocusInsideAriaHiddenAncestorsWeb,
} from "@/utils/blurForModalWeb";
import { saveGameSession, clearGameSession } from "@/services/gameSession";

/** Matches legacy `lobby_room.dart` `_playerColors`. */
const PLAYER_RING = [
  "#D4AF37",
  "#60A5FA",
  "#F87171",
  "#34D399",
  "#A78BFA",
  "#FBBF24",
  "#38BDF8",
  "#E879F9",
];

const GolfColors = {
  scaffold: "#071209",
  gold: "#D4AF37",
  mist: "#B8D4BF",
  sage: "#6B9872",
  forest: "#142918",
  forestPanel: "#0F1A12",
  inputFill: "#1C3D22",
  border: "#2A5030",
  mutedGreen: "#4A7A50",
  hint: "#3D6644",
};

export default function LobbyRoomScreen() {
  const params = useLocalSearchParams<{
    lobbyId: string;
    playerId: string;
    playerName: string;
  }>();
  const lobbyId = String(params.lobbyId ?? "");
  const playerId = String(params.playerId ?? "");
  const playerName = String(params.playerName ?? "");
  const insets = useSafeAreaInsets();

  const [lobby, setLobby] = useState<Lobby | null>(null);
  const [holes, setHoles] = useState(18);
  const [mode, setMode] = useState<GameMode>("classic");
  const [startingPoints, setStartingPoints] = useState(1);
  const [qrOpen, setQrOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const navigatedRef = useRef(false);
  const wasEverInLobbyRef = useRef(false);

  /** Draft state for Edit Game Settings modal */
  const [draftHoles, setDraftHoles] = useState(18);
  const [draftMode, setDraftMode] = useState<GameMode>("classic");
  const [draftStartingPoints, setDraftStartingPoints] = useState(1);
  const [draftCustom, setDraftCustom] = useState("");

  const copySnackbarOpacity = useRef(new Animated.Value(0)).current;
  const copySnackbarTranslate = useRef(new Animated.Value(12)).current;
  const copySnackbarHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const showCopySnackbar = useCallback(() => {
    if (copySnackbarHideTimerRef.current) {
      clearTimeout(copySnackbarHideTimerRef.current);
      copySnackbarHideTimerRef.current = null;
    }
    copySnackbarOpacity.stopAnimation();
    copySnackbarTranslate.stopAnimation();
    copySnackbarOpacity.setValue(0);
    copySnackbarTranslate.setValue(12);
    Animated.parallel([
      Animated.timing(copySnackbarOpacity, {
        toValue: 1,
        duration: 160,
        useNativeDriver: true,
      }),
      Animated.timing(copySnackbarTranslate, {
        toValue: 0,
        duration: 160,
        useNativeDriver: true,
      }),
    ]).start();
    copySnackbarHideTimerRef.current = setTimeout(() => {
      Animated.parallel([
        Animated.timing(copySnackbarOpacity, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(copySnackbarTranslate, {
          toValue: 12,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
      copySnackbarHideTimerRef.current = null;
    }, 2400);
  }, [copySnackbarOpacity, copySnackbarTranslate]);

  useEffect(() => {
    return () => {
      if (copySnackbarHideTimerRef.current) {
        clearTimeout(copySnackbarHideTimerRef.current);
      }
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      blurIfFocusInsideAriaHiddenAncestorsWeb();
    }, []),
  );

  useEffect(() => {
    const unsub = databaseService.subscribeLobby(lobbyId, (l) => {
      setLobby(l);
      if (l) {
        setHoles(l.plannedHoles);
        setMode(l.plannedMode);
        setStartingPoints(l.startingPoints);
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

  useEffect(() => {
    if (!lobby || lobby.status === "closed") return;
    if (lobbyHelpers.isPlayerInLobby(lobby, playerId)) {
      wasEverInLobbyRef.current = true;
      return;
    }
    if (!wasEverInLobbyRef.current || navigatedRef.current) return;
    void clearGameSession();
    const msg = "The host removed you from this lobby.";
    if (Platform.OS === "web") {
      if (typeof window !== "undefined") window.alert(msg);
      blurActiveElementForModalWeb();
      router.replace("/");
      return;
    }
    Alert.alert("Removed from lobby", msg, [
      {
        text: "OK",
        onPress: () => {
          blurActiveElementForModalWeb();
          router.replace("/");
        },
      },
    ]);
  }, [lobby, playerId]);

  const isHost = lobby?.hostId === playerId;

  useEffect(() => {
    if (!lobby || navigatedRef.current) return;
    if (lobby.status === "active" && lobby.gameId && !isHost) {
      navigatedRef.current = true;
      blurActiveElementForModalWeb();
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

  const leave = useCallback(() => {
    const title = isHost ? "Close Lobby?" : "Leave Lobby?";
    const message = isHost
      ? "This will remove all players. Are you sure?"
      : "Are you sure you want to leave?";

    async function performLeave() {
      try {
        if (isHost) {
          await databaseService.closeLobby(lobbyId);
        } else {
          await databaseService.leaveLobby(lobbyId, playerId);
        }
        await clearGameSession();
        blurActiveElementForModalWeb();
        router.replace("/");
      } catch (e) {
        Alert.alert("Error", String(e));
      }
    }

    /** RN Web often does not render multi-button `Alert.alert`; use the native confirm dialog. */
    if (Platform.OS === "web") {
      const ok =
        typeof window !== "undefined" &&
        window.confirm(`${title}\n\n${message}`);
      if (ok) void performLeave();
      return;
    }

    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel" },
      {
        text: isHost ? "Close" : "Leave",
        style: "destructive",
        onPress: () => void performLeave(),
      },
    ]);
  }, [isHost, lobbyId, playerId]);

  const confirmKickPlayer = useCallback(
    (target: LobbyPlayer) => {
      if (!isHost || target.id === playerId) return;
      const title = "Remove player?";
      const message = `${target.name} will be removed from the lobby.`;

      async function performKick() {
        try {
          await databaseService.kickPlayerFromLobby(
            lobbyId,
            playerId,
            target.id,
          );
        } catch (e) {
          Alert.alert("Could not remove player", String(e));
        }
      }

      if (Platform.OS === "web") {
        const ok =
          typeof window !== "undefined" &&
          window.confirm(`${title}\n\n${message}`);
        if (ok) void performKick();
        return;
      }

      Alert.alert(title, message, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => void performKick(),
        },
      ]);
    },
    [isHost, lobbyId, playerId],
  );

  function openQrModal() {
    blurActiveElementForModalWeb();
    setQrOpen(true);
  }

  function openSettingsModal() {
    if (!lobby) return;
    if (!isHost) {
      Alert.alert("Game settings", "Only the host can change game settings.");
      return;
    }
    const h = lobby.plannedHoles;
    setDraftHoles(h);
    setDraftMode(lobby.plannedMode);
    setDraftStartingPoints(lobby.startingPoints);
    setDraftCustom(String(h));
    blurActiveElementForModalWeb();
    setSettingsOpen(true);
  }

  const closeSettingsModal = useCallback(() => {
    setSettingsOpen(false);
  }, []);

  async function saveSettingsModal() {
    const trimmed = draftCustom.trim();
    let chosen = draftHoles;
    if (trimmed !== "") {
      const parsed = parseInt(trimmed, 10);
      if (Number.isNaN(parsed) || parsed < 1) {
        Alert.alert("Invalid", "Enter a positive whole number of holes.");
        return;
      }
      chosen = parsed;
    }
    chosen = Math.max(1, Math.floor(chosen));
    const startPts = Math.min(10, Math.max(0, Math.floor(draftStartingPoints)));
    try {
      await databaseService.updateLobbyPlannedSettings(lobbyId, {
        holes: chosen,
        mode: draftMode,
        startingPoints: startPts,
      });
      closeSettingsModal();
    } catch (e) {
      Alert.alert("Could not save", String(e));
    }
  }

  async function startGame() {
    if (!lobby) return;
    setStarting(true);
    try {
      await databaseService.updateLobbyPlannedSettings(lobbyId, {
        holes,
        mode,
        startingPoints,
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
      blurActiveElementForModalWeb();
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

  async function copyCode() {
    if (!lobby?.code) return;
    await Clipboard.setStringAsync(lobby.code);
    showCopySnackbar();
  }

  const title = lobby?.name ?? "Lobby";

  const appBarSubtitle = !lobby
    ? "Loading…"
    : lobbyHelpers.isWaiting(lobby)
      ? `${gameModeName(mode)} · ${holes} holes · ${startingPoints} gold`
      : lobby.status === "active"
        ? "Game in progress"
        : lobby.status === "completed"
          ? "Round finished"
          : lobby.status.charAt(0).toUpperCase() + lobby.status.slice(1);

  function renderBody() {
    if (!lobby) {
      return (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={GolfColors.gold} size="large" />
          <Text style={styles.loadingText}>Loading lobby…</Text>
        </View>
      );
    }

    if (lobby.status === "closed") {
      void clearGameSession();
      blurActiveElementForModalWeb();
      router.replace("/");
      return null;
    }

    const players = lobby.players;
    const maxPlayers = lobby.maxPlayers;
    const canShowStart =
      isHost && players.length >= 1 && lobbyHelpers.isWaiting(lobby);

    return (
      <View style={styles.bodyColumn}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Centered title */}
          <View style={styles.lobbyHeaderSection}>
            <View style={styles.lobbyHeaderTitleBlock}>
              <View style={styles.lobbyHeaderTitleRow}>
                <MaterialIcons
                  name="sports-golf"
                  size={18}
                  color={GolfColors.gold}
                />
                <Text style={styles.lobbyHeaderTitle} numberOfLines={1}>
                  {title}
                </Text>
              </View>
              <Text style={styles.lobbyHeaderSubtitle} numberOfLines={2}>
                {appBarSubtitle}
              </Text>
            </View>
          </View>

          {/* Lobby code card */}
          <LinearGradient
            colors={["rgba(212,175,55,0.1)", "rgba(15,26,18,0.94)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.codeCard}
          >
            <View style={styles.codeCardBody}>
              <View style={styles.codeTopRow}>
                <View style={styles.codeLeft}>
                  <Text style={styles.codeKicker}>Lobby code</Text>
                  <Text selectable style={styles.codeDigits}>
                    {lobby.code}
                  </Text>
                  <Text style={styles.codeHostLine}>
                    {isHost
                      ? "You are the host"
                      : `Host: ${lobby.hostName ?? ""}`}
                  </Text>
                </View>
                <View style={styles.countPillSlot}>
                  <View style={styles.countPill}>
                    <Text style={styles.countPillText} numberOfLines={1}>
                      {players.length} / {maxPlayers}
                    </Text>
                  </View>
                </View>
              </View>
              <View style={styles.codeActionsRow}>
                <Pressable onPress={copyCode} style={styles.iconTile}>
                  <MaterialIcons
                    name="content-copy"
                    size={18}
                    color={GolfColors.gold}
                  />
                </Pressable>
                <Pressable onPress={openQrModal} style={styles.iconTile}>
                  <MaterialIcons
                    name="qr-code"
                    size={18}
                    color={GolfColors.gold}
                  />
                </Pressable>
                {isHost ? (
                  <Pressable
                    onPress={() => openSettingsModal()}
                    style={[styles.iconTile, styles.iconTileHostTrailing]}
                    accessibilityRole="button"
                    accessibilityLabel="Game settings"
                  >
                    <MaterialIcons
                      name="settings"
                      size={18}
                      color={GolfColors.gold}
                    />
                  </Pressable>
                ) : null}
              </View>
            </View>
          </LinearGradient>

          {/* Players card */}
          <View
            style={[styles.card, { paddingHorizontal: 0, paddingVertical: 0 }]}
          >
            <View style={styles.playersHeader}>
              <MaterialIcons
                name="people-outline"
                size={18}
                color={GolfColors.sage}
              />
              <Text style={styles.playersKicker}>Players</Text>
            </View>
            <View style={styles.playersDivider} />
            {Array.from({ length: maxPlayers }).map((_, index) => (
              <View key={index}>
                {index > 0 ? <View style={styles.playerSep} /> : null}
                {index >= players.length ? (
                  <View style={styles.playerRow}>
                    <View style={styles.emptyAvatar}>
                      <MaterialIcons
                        name="add"
                        size={18}
                        color={`${GolfColors.hint}E6`}
                      />
                    </View>
                    <Text style={styles.openSpot}>Open spot</Text>
                  </View>
                ) : (
                  <PlayerRow
                    player={players[index]!}
                    index={index}
                    viewerPlayerId={playerId}
                    showKick={
                      isHost &&
                      lobbyHelpers.isWaiting(lobby) &&
                      !players[index]!.isHost &&
                      players[index]!.id !== lobby.hostId
                    }
                    onKick={() => confirmKickPlayer(players[index]!)}
                  />
                )}
              </View>
            ))}
          </View>
        </ScrollView>

        <View
          style={[
            styles.lobbyBottomActions,
            { paddingBottom: Math.max(28, insets.bottom + 12) },
          ]}
        >
          {canShowStart ? (
            <LobbyFooterButton
              variant="primary"
              label={players.length === 1 ? "Play solo" : "Start game"}
              showPlayIcon
              loading={starting}
              onPress={() => void startGame()}
              accessibilityLabel={
                players.length === 1 ? "Play solo" : "Start game"
              }
            />
          ) : null}
          <LobbyFooterButton
            variant="danger"
            label={isHost ? "Close lobby" : "Leave lobby"}
            onPress={leave}
            accessibilityLabel={isHost ? "Close lobby" : "Leave lobby"}
          />
        </View>
      </View>
    );
  }

  return (
    <GolfChrome>
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        {renderBody()}

        <Animated.View
          style={[
            styles.copySnackbarWrap,
            {
              bottom: insets.bottom + 118,
              opacity: copySnackbarOpacity,
              transform: [{ translateY: copySnackbarTranslate }],
            },
          ]}
          pointerEvents="none"
        >
          <View style={styles.copySnackbar}>
            <MaterialIcons
              name="check-circle"
              size={20}
              color={GolfColors.gold}
            />
            <Text style={styles.copySnackbarText}>
              Code copied to clipboard
            </Text>
          </View>
        </Animated.View>

        {/* QR modal */}
        <Modal
          visible={qrOpen}
          transparent
          animationType="fade"
          onShow={blurActiveElementForModalWeb}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setQrOpen(false)}
          >
            <Pressable
              style={styles.qrSheet}
              onPress={(e) => e.stopPropagation()}
            >
              <Text style={styles.qrTitle}>Scan to Join</Text>
              <View style={styles.qrWhite}>
                {lobby ? <QRCode value={lobby.code} size={200} /> : null}
              </View>
              <Text style={styles.qrCode}>{lobby?.code}</Text>
              <Text style={styles.qrHint}>or type the code above</Text>
              <Pressable
                onPress={() => setQrOpen(false)}
                style={{ marginTop: 16 }}
              >
                <Text style={styles.qrClose}>Close</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Edit game settings — parity with Flutter `_showHostOptions` */}
        <Modal
          visible={settingsOpen}
          transparent
          animationType="fade"
          onShow={blurActiveElementForModalWeb}
        >
          <View style={styles.modalSettingsRoot}>
            <Pressable
              style={[StyleSheet.absoluteFill, styles.modalBackdropDim]}
              onPress={closeSettingsModal}
              accessibilityRole="button"
              accessibilityLabel="Dismiss game settings"
            />
            <View style={styles.modalSettingsFrame} pointerEvents="box-none">
              <View style={styles.settingsSheet}>
                <Text style={styles.modalTitle}>Game Settings</Text>
                <View style={styles.settingsModalBody}>
                  <View>
                    <Text style={styles.modalKicker}>Number of holes</Text>
                    <View style={styles.holeWrap}>
                      {[6, 9, 12, 18, 36].map((h) => (
                        <Pressable
                          key={h}
                          onPress={() => {
                            setDraftHoles(h);
                            setDraftCustom(String(h));
                          }}
                          style={[
                            styles.holeChip,
                            draftHoles === h
                              ? styles.holeChipOn
                              : styles.holeChipOff,
                          ]}
                        >
                          <Text
                            style={
                              draftHoles === h
                                ? styles.holeChipTextOn
                                : styles.holeChipTextOff
                            }
                          >
                            {h} holes
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                    <Text style={[styles.modalKicker, { marginTop: 14 }]}>
                      Custom
                    </Text>
                    <TextInput
                      value={draftCustom}
                      onChangeText={(t) => {
                        setDraftCustom(t);
                        const n = parseInt(t, 10);
                        if (!Number.isNaN(n)) setDraftHoles(n);
                      }}
                      keyboardType="number-pad"
                      placeholder="e.g. 27"
                      placeholderTextColor={`${GolfColors.sage}99`}
                      style={styles.modalInput}
                    />
                  </View>
                  <View style={{ marginTop: 20 }}>
                    <Text style={styles.modalKicker}>Game mode</Text>
                    <View style={styles.modeRow}>
                      <Pressable
                        onPress={() => setDraftMode("classic")}
                        style={[
                          styles.modeCard,
                          draftMode === "classic"
                            ? styles.modeCardOn
                            : styles.modeCardOff,
                        ]}
                      >
                        <Text
                          style={
                            draftMode === "classic"
                              ? styles.modeCardTitleOn
                              : styles.modeCardTitleOff
                          }
                        >
                          Classic
                        </Text>
                        <Text
                          style={
                            draftMode === "classic"
                              ? styles.modeCardSubOn
                              : styles.modeCardSubOff
                          }
                        >
                          Track points
                        </Text>
                      </Pressable>
                      <View style={{ width: 10 }} />
                      <View
                        style={[
                          styles.modeCard,
                          styles.modeCardOff,
                          styles.modeCardBeerRunDisabled,
                          draftMode === "beer_run"
                            ? styles.modeCardBeerRunActiveOutline
                            : null,
                        ]}
                        accessibilityState={{ disabled: true }}
                      >
                        <Text style={styles.modeCardTitleDisabled}>
                          Beer Run
                        </Text>
                        <Text style={styles.modeCardSubDisabled}>
                          To be implemented
                        </Text>
                        {draftMode === "beer_run" ? (
                          <Text style={styles.modeCardBeerRunCurrentHint}>
                            Currently selected for this lobby
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  </View>
                  <View style={{ marginTop: 20 }}>
                    <Text style={styles.modalKicker}>
                      Starting gold per player
                    </Text>
                    <View style={styles.startGoldWrap}>
                      {Array.from({ length: 11 }, (_, i) => i).map((n) => (
                        <Pressable
                          key={n}
                          onPress={() => setDraftStartingPoints(n)}
                          style={[
                            styles.startGoldChip,
                            draftStartingPoints === n
                              ? styles.startGoldChipOn
                              : styles.startGoldChipOff,
                          ]}
                        >
                          <Text
                            style={
                              draftStartingPoints === n
                                ? styles.startGoldChipTextOn
                                : styles.startGoldChipTextOff
                            }
                          >
                            {n}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                </View>
                <View style={styles.modalActions}>
                  <Pressable onPress={closeSettingsModal}>
                    <Text style={styles.modalClose}>Close</Text>
                  </Pressable>
                  <Pressable
                    onPress={saveSettingsModal}
                    style={styles.modalSaveWrap}
                  >
                    <Text style={styles.modalSave}>Save</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </GolfChrome>
  );
}

function PlayerRow({
  player,
  index,
  viewerPlayerId,
  showKick,
  onKick,
}: {
  player: Lobby["players"][number];
  index: number;
  viewerPlayerId: string;
  showKick?: boolean;
  onKick?: () => void;
}) {
  const ring = PLAYER_RING[index % PLAYER_RING.length];
  const isMe = player.id === viewerPlayerId;

  return (
    <View style={styles.playerRow}>
      <View
        style={[
          styles.avatarRing,
          {
            borderColor: `${ring}80`,
            backgroundColor: `${ring}26`,
          },
        ]}
      >
        {player.isHost ? (
          <MaterialIcons name="star" size={18} color={ring} />
        ) : (
          <Text style={[styles.avatarLetter, { color: ring }]}>
            {player.name.slice(0, 1).toUpperCase()}
          </Text>
        )}
      </View>
      <View style={{ flex: 1 }}>
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <Text
            style={[styles.playerName, isMe ? styles.playerNameBold : null]}
          >
            {player.name}
          </Text>
          {isMe ? <Badge label="you" color="#60A5FA" marginLeft={8} /> : null}
          {player.isHost ? (
            <Badge
              label="host"
              color={GolfColors.gold}
              marginLeft={isMe ? 6 : 8}
            />
          ) : null}
        </View>
        <Text style={styles.joinedSub}>
          Joined {formatJoinTime(player.joinedAt)}
        </Text>
      </View>
      {showKick && onKick ? (
        <Pressable
          onPress={onKick}
          hitSlop={10}
          style={styles.playerKickButton}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${player.name} from lobby`}
        >
          <MaterialIcons name="person-off" size={22} color="#F87171" />
        </Pressable>
      ) : null}
    </View>
  );
}

function Badge({
  label,
  color,
  marginLeft,
}: {
  label: string;
  color: string;
  marginLeft: number;
}) {
  return (
    <View
      style={[
        styles.badge,
        {
          marginLeft,
          borderColor: `${color}66`,
          backgroundColor: `${color}26`,
        },
      ]}
    >
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

function formatJoinTime(joinedAt: string): string {
  const t = new Date(joinedAt).getTime();
  if (Number.isNaN(t)) return "";
  const diff = Date.now() - t;
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(diff / 3600000);
  if (mins < 1) return "just now";
  if (hrs < 1) return `${mins}m ago`;
  return `${hrs}h ago`;
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  lobbyHeaderSection: {
    paddingTop: 8,
    paddingBottom: 12,
  },
  lobbyHeaderTitleBlock: {
    alignItems: "center",
    paddingHorizontal: 8,
  },
  lobbyHeaderTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  lobbyHeaderTitle: {
    fontFamily: Font.bold,
    fontSize: 17,
    fontWeight: "normal",
    letterSpacing: -0.2,
    color: "#FFFFFF",
    textAlign: "center",
    maxWidth: "100%",
  },
  lobbyHeaderSubtitle: {
    fontFamily: Font.regular,
    marginTop: 2,
    fontSize: 11,
    fontWeight: "normal",
    letterSpacing: 0.2,
    textAlign: "center",
    color: "rgba(184,212,191,0.65)",
  },
  lobbyBottomActions: {
    flexShrink: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 10,
  },
  bodyColumn: {
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
  },
  scroll: {
    flex: 1,
    minHeight: 0,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 0,
    paddingBottom: 16,
  },
  loadingWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 80,
  },
  loadingText: {
    fontFamily: Font.regular,
    marginTop: 16,
    fontSize: 15,
    fontWeight: "normal",
    color: `${GolfColors.sage}F2`,
  },
  codeCard: {
    borderRadius: 22,
    borderWidth: 1.2,
    borderColor: "rgba(212,175,55,0.45)",
    paddingHorizontal: 20,
    paddingVertical: 18,
    marginBottom: 16,
    overflow: "hidden",
    backgroundColor: "rgba(15,26,18,0.94)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 10,
  },
  codeCardBody: {
    width: "100%",
  },
  codeTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    width: "100%",
  },
  codeLeft: {
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
  },
  countPillSlot: {
    flexShrink: 0,
    paddingTop: 2,
  },
  codeKicker: {
    fontFamily: Font.bold,
    fontSize: 10,
    fontWeight: "normal",
    letterSpacing: 1.8,
    color: GolfColors.sage,
  },
  codeDigits: {
    fontFamily: Font.black,
    marginTop: 6,
    fontSize: 34,
    fontWeight: "normal",
    letterSpacing: 6,
    color: GolfColors.gold,
  },
  codeHostLine: {
    fontFamily: Font.regular,
    marginTop: 4,
    fontSize: 13,
    fontWeight: "normal",
    color: `${GolfColors.sage}F2`,
  },
  codeActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    flexWrap: "wrap",
    marginTop: 36,
    gap: 8,
  },
  countPill: {
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: GolfColors.inputFill,
    borderWidth: 1,
    borderColor: GolfColors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  countPillText: {
    fontFamily: Font.bold,
    fontSize: 11,
    fontWeight: "normal",
    color: "#FFFFFF",
    textAlign: "center",
  },
  iconTile: {
    padding: 10,
    borderRadius: 12,
    backgroundColor: "rgba(212,175,55,0.12)",
    borderWidth: 1,
    borderColor: "rgba(212,175,55,0.3)",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 40,
    minHeight: 40,
  },
  iconTileHostTrailing: {
    marginLeft: "auto",
  },
  card: {
    backgroundColor: "rgba(20,41,24,0.94)",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: GolfColors.border,
    paddingHorizontal: 16,
    marginBottom: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 18,
    elevation: 8,
  },
  playersHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  playersKicker: {
    fontFamily: Font.bold,
    marginLeft: 8,
    fontSize: 13,
    fontWeight: "normal",
    letterSpacing: 1.8,
    color: GolfColors.sage,
  },
  playersDivider: {
    height: 1,
    backgroundColor: GolfColors.border,
  },
  playerSep: {
    height: 1,
    backgroundColor: GolfColors.inputFill,
  },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  playerKickButton: {
    padding: 6,
    marginLeft: 4,
  },
  emptyAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: GolfColors.border,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  openSpot: {
    fontFamily: Font.regular,
    fontSize: 14,
    fontStyle: "italic",
    fontWeight: "normal",
    color: `${GolfColors.mutedGreen}F2`,
  },
  avatarRing: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLetter: {
    fontFamily: Font.bold,
    fontSize: 16,
    fontWeight: "normal",
  },
  playerName: {
    fontFamily: Font.regular,
    fontSize: 15,
    fontWeight: "normal",
    color: "#FFFFFF",
  },
  playerNameBold: {
    fontFamily: Font.bold,
    fontWeight: "normal",
  },
  joinedSub: {
    fontFamily: Font.regular,
    marginTop: 2,
    fontSize: 11,
    fontWeight: "normal",
    color: `${GolfColors.mutedGreen}F2`,
  },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 20,
    borderWidth: 1,
  },
  badgeText: {
    fontFamily: Font.bold,
    fontSize: 10,
    fontWeight: "normal",
    letterSpacing: 0.5,
  },
  modalSettingsRoot: {
    flex: 1,
  },
  modalBackdropDim: {
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  modalSettingsFrame: {
    ...StyleSheet.absoluteFill,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  copySnackbarWrap: {
    position: "absolute",
    left: 20,
    right: 20,
    zIndex: 200,
    alignItems: "center",
  },
  copySnackbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    maxWidth: 400,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: "rgba(20,41,24,0.96)",
    borderWidth: 1,
    borderColor: GolfColors.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 16,
  },
  copySnackbarText: {
    fontFamily: Font.regular,
    fontSize: 14,
    fontWeight: "normal",
    color: "#FFFFFF",
  },
  qrSheet: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: GolfColors.border,
    backgroundColor: GolfColors.forest,
    padding: 24,
    alignItems: "center",
  },
  qrTitle: {
    fontFamily: Font.bold,
    fontSize: 18,
    fontWeight: "normal",
    color: "#FFFFFF",
    marginBottom: 16,
    textAlign: "center",
  },
  qrWhite: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
  },
  qrCode: {
    fontFamily: Font.black,
    marginTop: 16,
    fontSize: 28,
    fontWeight: "normal",
    letterSpacing: 8,
    color: GolfColors.gold,
  },
  qrHint: {
    fontFamily: Font.regular,
    marginTop: 4,
    fontSize: 12,
    fontWeight: "normal",
    color: `${GolfColors.sage}F2`,
  },
  qrClose: {
    fontFamily: Font.regular,
    fontSize: 15,
    fontWeight: "normal",
    color: `${GolfColors.sage}F2`,
    textAlign: "center",
  },
  settingsSheet: {
    maxHeight: "94%",
    width: "100%",
    maxWidth: 440,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: GolfColors.border,
    backgroundColor: GolfColors.forest,
    padding: 22,
  },
  settingsModalBody: {
    paddingBottom: 4,
  },
  modalTitle: {
    fontFamily: Font.bold,
    fontSize: 18,
    fontWeight: "normal",
    color: "#FFFFFF",
    marginBottom: 16,
  },
  modalKicker: {
    fontFamily: Font.bold,
    fontSize: 11,
    fontWeight: "normal",
    letterSpacing: 1.8,
    color: GolfColors.sage,
  },
  holeWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 14,
  },
  startGoldWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14,
  },
  startGoldChip: {
    minWidth: 44,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  startGoldChipOn: {
    backgroundColor: GolfColors.gold,
    borderColor: GolfColors.gold,
  },
  startGoldChipOff: {
    backgroundColor: GolfColors.inputFill,
    borderColor: GolfColors.border,
  },
  startGoldChipTextOn: {
    fontFamily: Font.bold,
    fontSize: 14,
    fontWeight: "normal",
    color: GolfColors.scaffold,
  },
  startGoldChipTextOff: {
    fontFamily: Font.bold,
    fontSize: 14,
    fontWeight: "normal",
    color: "#FFFFFF",
  },
  holeChip: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  holeChipOn: {
    backgroundColor: GolfColors.gold,
    borderColor: GolfColors.gold,
  },
  holeChipOff: {
    backgroundColor: GolfColors.inputFill,
    borderColor: GolfColors.border,
  },
  holeChipTextOn: {
    fontFamily: Font.bold,
    fontSize: 14,
    fontWeight: "normal",
    color: GolfColors.scaffold,
  },
  holeChipTextOff: {
    fontFamily: Font.bold,
    fontSize: 14,
    fontWeight: "normal",
    color: "#FFFFFF",
  },
  modalInput: {
    fontFamily: Font.regular,
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: GolfColors.border,
    backgroundColor: GolfColors.inputFill,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: "normal",
    color: "#FFFFFF",
  },
  modeRow: {
    flexDirection: "row",
    marginTop: 14,
  },
  modeCard: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  modeCardOn: {
    backgroundColor: GolfColors.gold,
    borderColor: GolfColors.gold,
  },
  modeCardOff: {
    backgroundColor: GolfColors.inputFill,
    borderColor: GolfColors.border,
  },
  modeCardBeerRunDisabled: {
    opacity: 0.72,
  },
  modeCardBeerRunActiveOutline: {
    borderColor: "rgba(212,175,55,0.5)",
  },
  modeCardTitleDisabled: {
    fontFamily: Font.bold,
    fontSize: 14,
    fontWeight: "normal",
    color: `${GolfColors.sage}E6`,
  },
  modeCardSubDisabled: {
    fontFamily: Font.regular,
    marginTop: 4,
    fontSize: 12,
    fontWeight: "normal",
    color: `${GolfColors.mutedGreen}E6`,
  },
  modeCardBeerRunCurrentHint: {
    fontFamily: Font.regular,
    marginTop: 8,
    fontSize: 11,
    fontWeight: "normal",
    fontStyle: "italic",
    color: `${GolfColors.sage}CC`,
  },
  modeCardTitleOn: {
    fontFamily: Font.bold,
    fontSize: 14,
    fontWeight: "normal",
    color: GolfColors.scaffold,
  },
  modeCardTitleOff: {
    fontFamily: Font.bold,
    fontSize: 14,
    fontWeight: "normal",
    color: "#FFFFFF",
  },
  modeCardSubOn: {
    fontFamily: Font.regular,
    marginTop: 4,
    fontSize: 12,
    fontWeight: "normal",
    color: "rgba(7,18,9,0.8)",
  },
  modeCardSubOff: {
    fontFamily: Font.regular,
    marginTop: 4,
    fontSize: 12,
    fontWeight: "normal",
    color: GolfColors.sage,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    marginTop: 24,
    gap: 16,
  },
  modalClose: {
    fontFamily: Font.regular,
    fontSize: 15,
    fontWeight: "normal",
    color: `${GolfColors.sage}F2`,
    padding: 8,
  },
  modalSaveWrap: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  modalSave: {
    fontFamily: Font.bold,
    fontSize: 15,
    fontWeight: "normal",
    color: GolfColors.gold,
  },
});
