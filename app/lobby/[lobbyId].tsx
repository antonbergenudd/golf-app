import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Clipboard from "expo-clipboard";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { Font } from "@/theme/fonts";
import type { GameMode } from "@/models/gameMode";
import { gameModeName } from "@/models/gameMode";
import type { Lobby } from "@/models/lobby";
import { lobbyHelpers } from "@/models/lobby";
import { databaseService } from "@/services/databaseService";
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
  const [qrOpen, setQrOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const navigatedRef = useRef(false);

  /** Draft state for Edit Game Settings modal */
  const [draftHoles, setDraftHoles] = useState(18);
  const [draftMode, setDraftMode] = useState<GameMode>("classic");
  const [draftCustom, setDraftCustom] = useState("");

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
    if (lobby.status === "active" && lobby.gameId && !isHost) {
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

  function openSettingsModal() {
    if (!lobby) return;
    if (!isHost) {
      Alert.alert("Game settings", "Only the host can change game settings.");
      return;
    }
    const h = lobby.plannedHoles;
    setDraftHoles(h);
    setDraftMode(lobby.plannedMode);
    setDraftCustom(String(h));
    setSettingsOpen(true);
  }

  async function saveSettingsModal() {
    const parsed = parseInt(draftCustom.trim(), 10);
    let chosen = draftHoles;
    if (!Number.isNaN(parsed)) {
      if (parsed < 1 || parsed > 36) {
        Alert.alert("Invalid", "Holes must be between 1 and 36.");
        return;
      }
      chosen = parsed;
    }
    chosen = Math.min(36, Math.max(1, chosen));
    try {
      await databaseService.updateLobbyPlannedSettings(lobbyId, {
        holes: chosen,
        mode: draftMode,
      });
      setSettingsOpen(false);
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

  async function copyCode() {
    if (!lobby?.code) return;
    await Clipboard.setStringAsync(lobby.code);
    if (Platform.OS !== "web") {
      Alert.alert("", "Code copied to clipboard");
    }
  }

  const title = lobby?.name ?? "Lobby";

  const appBarSubtitle = !lobby
    ? "Loading…"
    : lobbyHelpers.isWaiting(lobby)
      ? `${gameModeName(mode)} · ${holes} holes · Waiting`
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
      router.replace("/");
      return null;
    }

    const modeLabel = gameModeName(mode);
    const modeDetails = mode === "beer_run" ? "Track sips" : "Track points";
    const players = lobby.players;
    const maxPlayers = lobby.maxPlayers;

    return (
      <View style={styles.bodyColumn}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Lobby code card */}
          <LinearGradient
            colors={["rgba(212,175,55,0.1)", "rgba(15,26,18,0.94)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.codeCard}
          >
            <View style={styles.codeRow}>
              <View style={styles.codeLeft}>
                <Text style={styles.codeKicker}>Lobby code</Text>
                <Text style={styles.codeDigits}>{lobby.code}</Text>
                <Text style={styles.codeHostLine}>
                  {isHost
                    ? "You are the host"
                    : `Host: ${lobby.hostName ?? ""}`}
                </Text>
              </View>
              <View style={styles.codeRightCol}>
                <View style={styles.countPill}>
                  <Text style={styles.countPillText}>
                    {players.length} / {maxPlayers}
                  </Text>
                </View>
                <Pressable onPress={copyCode} style={styles.iconTile}>
                  <MaterialIcons name="content-copy" size={18} color={GolfColors.gold} />
                </Pressable>
                <Pressable onPress={() => setQrOpen(true)} style={styles.iconTile}>
                  <MaterialIcons name="qr-code" size={18} color={GolfColors.gold} />
                </Pressable>
              </View>
            </View>
          </LinearGradient>

          {/* Game settings card */}
          <View style={styles.card}>
            <View style={styles.settingsHeader}>
              <MaterialIcons name="tune" size={18} color={GolfColors.sage} />
              <Text style={styles.settingsKicker}>Game settings</Text>
              <View style={{ flex: 1 }} />
              {isHost ? (
                <Pressable onPress={openSettingsModal} hitSlop={8}>
                  <View style={styles.editBtn}>
                    <MaterialIcons name="edit" size={16} color={GolfColors.gold} />
                    <Text style={styles.editBtnLabel}> Edit</Text>
                  </View>
                </Pressable>
              ) : (
                <Text style={styles.hostHint}>Host can change</Text>
              )}
            </View>
            <View style={{ height: 12 }} />
            <View style={styles.settingTilesRow}>
              <SettingTile
                icon="flag"
                label="Holes"
                value={String(holes)}
                subtitle="Round length"
              />
              <View style={{ width: 10 }} />
              <SettingTile
                icon={mode === "beer_run" ? "local-bar" : "sports-golf"}
                label="Mode"
                value={modeLabel}
                subtitle={modeDetails}
              />
            </View>
          </View>

          {/* Players card */}
          <View style={[styles.card, { paddingHorizontal: 0, paddingVertical: 0 }]}>
            <View style={styles.playersHeader}>
              <MaterialIcons name="people-outline" size={18} color={GolfColors.sage} />
              <Text style={styles.playersKicker}>Players</Text>
            </View>
            <View style={styles.playersDivider} />
            {Array.from({ length: maxPlayers }).map((_, index) => (
              <View key={index}>
                {index > 0 ? <View style={styles.playerSep} /> : null}
                {index >= players.length ? (
                  <View style={styles.playerRow}>
                    <View style={styles.emptyAvatar}>
                      <MaterialIcons name="add" size={18} color={`${GolfColors.hint}E6`} />
                    </View>
                    <Text style={styles.openSpot}>Open spot</Text>
                  </View>
                ) : (
                  <PlayerRow
                    player={players[index]!}
                    index={index}
                    playerId={playerId}
                  />
                )}
              </View>
            ))}
          </View>
        </ScrollView>

        {/* Bottom bar — keep above ScrollView so touches aren’t stolen (RN flex + scroll quirk). */}
        <View
          style={[
            styles.bottomBar,
            styles.bottomBarElevated,
            Platform.OS === "web"
              ? { paddingBottom: 12 + insets.bottom }
              : null,
          ]}
        >
          {isHost && players.length >= 1 && lobbyHelpers.isWaiting(lobby) ? (
            <>
              <LobbyPrimaryOutlineButton
                label={players.length === 1 ? "Play solo" : "Start game"}
                icon="play-arrow"
                loading={starting}
                onPress={startGame}
              />
              <View style={{ height: 10 }} />
            </>
          ) : null}
          <LobbyDangerOutlineButton
            label={isHost ? "Close lobby" : "Leave lobby"}
            onPress={leave}
          />
        </View>
      </View>
    );
  }

  return (
    <GolfChrome>
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        {/* App bar — matches `buildGolfAppBar` gradient + title styles */}
        <View style={styles.appBarWrap}>
          <LinearGradient
            colors={["#153220", "#0B1A0E", "#071209"]}
            locations={[0, 0.55, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.appBarRow}>
            <View style={styles.appBarEdgeSpacer} />
            <View style={styles.appBarTitleBlock}>
              <Text style={styles.appBarTitle} numberOfLines={1}>
                {title}
              </Text>
              <Text style={styles.appBarSubtitle} numberOfLines={1}>
                {appBarSubtitle}
              </Text>
            </View>
            <View style={styles.appBarEdgeSpacer} />
          </View>
        </View>

        {renderBody()}

        {/* QR modal */}
        <Modal visible={qrOpen} transparent animationType="fade">
          <Pressable style={styles.modalBackdrop} onPress={() => setQrOpen(false)}>
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
              <Pressable onPress={() => setQrOpen(false)} style={{ marginTop: 16 }}>
                <Text style={styles.qrClose}>Close</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Edit game settings — parity with Flutter `_showHostOptions` */}
        <Modal visible={settingsOpen} transparent animationType="fade">
          <Pressable style={styles.modalBackdrop} onPress={() => setSettingsOpen(false)}>
            <Pressable style={styles.settingsSheet} onPress={(e) => e.stopPropagation()}>
              <Text style={styles.modalTitle}>Game Settings</Text>
              <Text style={styles.modalKicker}>Number of holes</Text>
              <View style={styles.holeWrap}>
                {[6, 9, 12, 18].map((h) => (
                  <Pressable
                    key={h}
                    onPress={() => {
                      setDraftHoles(h);
                      setDraftCustom(String(h));
                    }}
                    style={[
                      styles.holeChip,
                      draftHoles === h ? styles.holeChipOn : styles.holeChipOff,
                    ]}
                  >
                    <Text
                      style={
                        draftHoles === h ? styles.holeChipTextOn : styles.holeChipTextOff
                      }
                    >
                      {h} holes
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text style={[styles.modalKicker, { marginTop: 14 }]}>Custom (1–36)</Text>
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
              <Text style={[styles.modalKicker, { marginTop: 20 }]}>Game mode</Text>
              <View style={styles.modeRow}>
                <Pressable
                  onPress={() => setDraftMode("classic")}
                  style={[
                    styles.modeCard,
                    draftMode === "classic" ? styles.modeCardOn : styles.modeCardOff,
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
                <Pressable
                  onPress={() => setDraftMode("beer_run")}
                  style={[
                    styles.modeCard,
                    draftMode === "beer_run" ? styles.modeCardOn : styles.modeCardOff,
                  ]}
                >
                  <Text
                    style={
                      draftMode === "beer_run"
                        ? styles.modeCardTitleOn
                        : styles.modeCardTitleOff
                    }
                  >
                    Beer Run
                  </Text>
                  <Text
                    style={
                      draftMode === "beer_run"
                        ? styles.modeCardSubOn
                        : styles.modeCardSubOff
                    }
                  >
                    Track sips
                  </Text>
                </Pressable>
              </View>
              <View style={styles.modalActions}>
                <Pressable onPress={() => setSettingsOpen(false)}>
                  <Text style={styles.modalCancel}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={saveSettingsModal}
                  style={styles.modalSaveWrap}
                >
                  <Text style={styles.modalSave}>Save</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      </SafeAreaView>
    </GolfChrome>
  );
}

function SettingTile({
  icon,
  label,
  value,
  subtitle,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  value: string;
  subtitle: string;
}) {
  return (
    <View style={styles.settingTile}>
      <View style={styles.settingTileHead}>
        <MaterialIcons name={icon} size={14} color={GolfColors.sage} />
        <Text style={styles.settingTileLabel}>{label}</Text>
      </View>
      <Text style={styles.settingTileValue}>{value}</Text>
      <Text style={styles.settingTileSub}>{subtitle}</Text>
    </View>
  );
}

function PlayerRow({
  player,
  index,
  playerId,
}: {
  player: Lobby["players"][number];
  index: number;
  playerId: string;
}) {
  const ring = PLAYER_RING[index % PLAYER_RING.length];
  const isMe = player.id === playerId;

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
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center" }}>
          <Text style={[styles.playerName, isMe ? styles.playerNameBold : null]}>
            {player.name}
          </Text>
          {isMe ? (
            <Badge label="you" color="#60A5FA" marginLeft={8} />
          ) : null}
          {player.isHost ? (
            <Badge label="host" color={GolfColors.gold} marginLeft={isMe ? 6 : 8} />
          ) : null}
        </View>
        <Text style={styles.joinedSub}>Joined {formatJoinTime(player.joinedAt)}</Text>
      </View>
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

function LobbyPrimaryOutlineButton({
  label,
  icon,
  loading,
  onPress,
}: {
  label: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  loading?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={loading ? undefined : onPress}
      style={({ pressed }) => [
        styles.primaryOutline,
        pressed && !loading ? { transform: [{ scale: 0.97 }] } : null,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={GolfColors.gold} />
      ) : (
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <MaterialIcons name={icon} size={18} color={GolfColors.gold} />
          <Text style={styles.primaryOutlineText}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

function LobbyDangerOutlineButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.dangerOutline,
        pressed ? { transform: [{ scale: 0.97 }] } : null,
      ]}
    >
      <Text style={styles.dangerOutlineText}>{label}</Text>
    </Pressable>
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
  appBarWrap: {
    overflow: "hidden",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(42,80,48,0.5)",
  },
  appBarRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 6,
    minHeight: 52,
  },
  appBarTitleBlock: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  /** Empty rails so title + subtitle stay centered (no leading back control in lobby). */
  appBarEdgeSpacer: {
    width: 22,
  },
  appBarTitle: {
    fontFamily: Font.bold,
    textAlign: "center",
    fontSize: 17,
    fontWeight: "normal",
    letterSpacing: -0.2,
    color: "#FFFFFF",
  },
  /** Secondary line — parity with in-game header context (hole · mode). */
  appBarSubtitle: {
    fontFamily: Font.regular,
    marginTop: 2,
    fontSize: 11,
    fontWeight: "normal",
    letterSpacing: 0.2,
    textAlign: "center",
    color: `${GolfColors.sage}F0`,
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
    paddingTop: 8,
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
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 10,
  },
  codeRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  codeLeft: { flex: 1, paddingRight: 8 },
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
  codeRightCol: {
    alignItems: "flex-end",
  },
  countPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: GolfColors.inputFill,
    borderWidth: 1,
    borderColor: GolfColors.border,
  },
  countPillText: {
    fontFamily: Font.bold,
    fontSize: 13,
    fontWeight: "normal",
    color: "#FFFFFF",
  },
  iconTile: {
    marginTop: 12,
    padding: 10,
    borderRadius: 12,
    backgroundColor: "rgba(212,175,55,0.12)",
    borderWidth: 1,
    borderColor: "rgba(212,175,55,0.3)",
  },
  card: {
    backgroundColor: "rgba(20,41,24,0.94)",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: GolfColors.border,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 18,
    elevation: 8,
  },
  settingsHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  settingsKicker: {
    fontFamily: Font.bold,
    marginLeft: 8,
    fontSize: 13,
    fontWeight: "normal",
    letterSpacing: 1.8,
    color: GolfColors.sage,
  },
  editBtn: {
    flexDirection: "row",
    alignItems: "center",
  },
  editBtnLabel: {
    fontFamily: Font.semiBold,
    fontSize: 14,
    fontWeight: "normal",
    color: GolfColors.gold,
  },
  hostHint: {
    fontFamily: Font.regular,
    fontSize: 11,
    fontWeight: "normal",
    color: `${GolfColors.sage}D9`,
  },
  settingTilesRow: {
    flexDirection: "row",
  },
  settingTile: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    backgroundColor: GolfColors.inputFill,
    borderWidth: 1,
    borderColor: GolfColors.border,
  },
  settingTileHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  settingTileLabel: {
    fontFamily: Font.bold,
    fontSize: 11,
    fontWeight: "normal",
    letterSpacing: 0.4,
    color: `${GolfColors.sage}F2`,
  },
  settingTileValue: {
    fontFamily: Font.bold,
    marginTop: 6,
    fontSize: 16,
    fontWeight: "normal",
    color: "#FFFFFF",
  },
  settingTileSub: {
    fontFamily: Font.regular,
    marginTop: 2,
    fontSize: 11,
    fontWeight: "normal",
    color: `${GolfColors.mutedGreen}F2`,
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
  bottomBar: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: "rgba(7,18,9,0.92)",
    borderTopWidth: 1,
    borderTopColor: "rgba(212,175,55,0.12)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 24,
  },
  bottomBarElevated: {
    position: "relative",
    zIndex: 50,
    elevation: 50,
  },
  primaryOutline: {
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "rgba(212,175,55,0.6)",
    backgroundColor: "rgba(212,175,55,0.08)",
    shadowColor: GolfColors.gold,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 20,
    elevation: 6,
  },
  primaryOutlineText: {
    fontFamily: Font.bold,
    marginLeft: 8,
    fontSize: 15,
    fontWeight: "normal",
    letterSpacing: 1.5,
    color: GolfColors.gold,
  },
  dangerOutline: {
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,82,82,0.7)",
    backgroundColor: "rgba(255,82,82,0.05)",
  },
  dangerOutlineText: {
    fontFamily: Font.bold,
    fontSize: 15,
    fontWeight: "normal",
    letterSpacing: 1.5,
    color: "#FF5252",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    paddingHorizontal: 24,
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
    maxHeight: "90%",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: GolfColors.border,
    backgroundColor: GolfColors.forest,
    padding: 20,
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
  modalCancel: {
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
