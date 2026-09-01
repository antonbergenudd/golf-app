import { useNavigation } from "@react-navigation/native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { LinearGradient } from "expo-linear-gradient";
import {
  useGlobalSearchParams,
  useLocalSearchParams,
  usePathname,
} from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { GameSessionSubscreenHeader } from "@/components/fairway/GameSessionSubscreenHeader";
import { HoleScoreModal } from "@/components/fairway/HoleScoreModal";
import {
  useRegisterGameTabFab,
  type GameFabRegistration,
} from "@/context/GameShellContext";
import { databaseService } from "@/services/databaseService";
import { Font } from "@/theme/fonts";
import { blurActiveElementForModalWeb } from "@/utils/blurForModalWeb";

const GolfColors = {
  gold: "#D4AF37",
  sage: "#6B9872",
  mist: "#B8D4BF",
  forest: "#142918",
  forestDeep: "#071209",
};

const NAV_ROW_HEIGHT = 52;
const FAB_FLOAT = 28;

function chunkHoles(total: number): number[][] {
  if (total <= 0) return [];
  const holes = Array.from({ length: total }, (_, i) => i + 1);
  const rows: number[][] = [];
  for (let i = 0; i < holes.length; i += 9) {
    rows.push(holes.slice(i, i + 9));
  }
  return rows;
}

function sumStrokes(
  scoreRows: Record<string, unknown>[],
  gameId: string,
  playerId: string,
): number {
  return scoreRows
    .filter(
      (r) => String(r.game_id) === gameId && String(r.player_id) === playerId,
    )
    .reduce((acc, r) => acc + Number(r.strokes ?? 0), 0);
}

function strokeForHole(
  scoreRows: Record<string, unknown>[],
  playerId: string,
  hole: number,
): number | null {
  const row = scoreRows.find(
    (r) => String(r.player_id) === playerId && Number(r.hole) === hole,
  );
  if (!row) return null;
  const s = Number(row.strokes);
  return Number.isFinite(s) ? s : null;
}

function avatarInitial(name: string, fallbackId: string): string {
  const t = name.trim();
  if (t.length > 0) return t.slice(0, 1).toUpperCase();
  return fallbackId.slice(0, 1).toUpperCase() || "?";
}

/** Expo Router can return `string | string[]`; nested tabs may omit parent params in `useLocalSearchParams`. */
function paramFirst(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) return String(v[0] ?? "");
  return String(v);
}

export default function ScorecardScreen() {
  const insets = useSafeAreaInsets();
  const local = useLocalSearchParams();
  const global = useGlobalSearchParams();
  const pathname = usePathname();
  const gameIdFromPath = pathname.match(/\/game\/([^/]+)/)?.[1] ?? "";

  const gid =
    paramFirst(local.gameId) || paramFirst(global.gameId) || gameIdFromPath;
  const lid = paramFirst(local.lobbyId) || paramFirst(global.lobbyId);
  const selfId =
    paramFirst(local.currentPlayerId) ||
    paramFirst(global.currentPlayerId) ||
    paramFirst(local.playerId) ||
    paramFirst(global.playerId);

  const navigation = useNavigation();

  const [names, setNames] = useState<Record<string, string>>({});
  const [lobbyTitle, setLobbyTitle] = useState("");
  const [gameRow, setGameRow] = useState<Record<string, unknown> | null>(null);
  const [scoreRows, setScoreRows] = useState<Record<string, unknown>[]>([]);
  const [scoreModalOpen, setScoreModalOpen] = useState(false);
  const [draftStrokes, setDraftStrokes] = useState(4);
  const [scoreBusy, setScoreBusy] = useState(false);

  useEffect(() => {
    if (!lid) return;
    let active = true;
    const unsub = databaseService.subscribeLobby(lid, (row) => {
      if (!active || !row) return;
      setLobbyTitle(row.name);
      const m: Record<string, string> = {};
      for (const p of row.players) m[p.id] = p.name;
      setNames(m);
    });
    return () => {
      active = false;
      unsub();
    };
  }, [lid]);

  useEffect(() => {
    if (!gid) return;
    let active = true;
    const unsub = databaseService.subscribeGame(gid, (row) => {
      if (active) setGameRow(row);
    });
    return () => {
      active = false;
      unsub();
    };
  }, [gid]);

  useEffect(() => {
    if (!gid) return;
    let active = true;
    const unsub = databaseService.subscribeScores(gid, (rows) => {
      if (active) setScoreRows(rows);
    });
    return () => {
      active = false;
      unsub();
    };
  }, [gid]);

  const currentHole = Number(gameRow?.current_hole ?? 1);
  const totalHoles = Math.max(1, Number(gameRow?.holes ?? 9));
  const rawPoints = (gameRow?.player_points as Record<string, number>) ?? {};
  const rawHidden =
    (gameRow?.hidden_balance_until_hole as Record<string, number>) ?? {};
  const playerIds = (gameRow?.player_ids as string[]) ?? [];
  const selfName = names[selfId] ?? "Player";

  const myHoleScoreRow = useMemo(
    () =>
      scoreRows.find(
        (r) => String(r.player_id) === selfId && Number(r.hole) === currentHole,
      ),
    [scoreRows, selfId, currentHole],
  );
  const savedStrokesForHole =
    myHoleScoreRow != null ? Number(myHoleScoreRow.strokes) : null;
  const hasHoleScore =
    myHoleScoreRow != null &&
    savedStrokesForHole != null &&
    Number.isFinite(savedStrokesForHole);

  useEffect(() => {
    setScoreModalOpen(false);
  }, [currentHole]);

  const sortedPlayerIds = useMemo(() => {
    return [...playerIds].sort((a, b) => {
      const pd = (rawPoints[b] ?? 0) - (rawPoints[a] ?? 0);
      if (pd !== 0) return pd;
      return (names[a] ?? a).localeCompare(names[b] ?? b);
    });
  }, [playerIds, rawPoints, names]);

  const bottomPad =
    NAV_ROW_HEIGHT + FAB_FLOAT + Math.max(insets.bottom, 10) + 24;

  const openScoreModal = useCallback(() => {
    if (!gid) {
      Alert.alert("Score", "No active game.");
      return;
    }
    blurActiveElementForModalWeb();
    setDraftStrokes(
      hasHoleScore && savedStrokesForHole != null ? savedStrokesForHole : 4,
    );
    setScoreModalOpen(true);
  }, [gid, hasHoleScore, savedStrokesForHole]);

  const fabRegistration: GameFabRegistration = useMemo(
    () => ({
      digit: !gid ? "—" : hasHoleScore ? String(savedStrokesForHole!) : "—",
      scoredLook: Boolean(gid && hasHoleScore),
      caption: "Score",
      captionEntered: Boolean(gid && hasHoleScore),
      onPress: openScoreModal,
      accessibilityLabel: !gid
        ? "Score"
        : hasHoleScore && savedStrokesForHole != null
          ? `Score ${savedStrokesForHole} strokes, tap to edit`
          : "Enter score for this hole",
    }),
    [gid, hasHoleScore, savedStrokesForHole, openScoreModal],
  );

  useRegisterGameTabFab("scorecard", fabRegistration);

  function openGame() {
    navigation.navigate("index" as never);
  }

  function openInventory() {
    blurActiveElementForModalWeb();
    navigation.navigate("inventory" as never);
  }

  async function submitHoleScore() {
    if (!gid || !selfId) return;
    const strokesSaved = Math.min(30, Math.max(1, Math.floor(draftStrokes)));
    setScoreBusy(true);
    try {
      await databaseService.saveHoleScore({
        gameId: gid,
        playerId: selfId,
        playerName: selfName,
        hole: currentHole,
        strokes: draftStrokes,
      });
      setScoreRows((prev) => {
        const rest = prev.filter(
          (r) =>
            String(r.player_id) !== selfId || Number(r.hole) !== currentHole,
        );
        const prior = prev.find(
          (r) =>
            String(r.player_id) === selfId && Number(r.hole) === currentHole,
        );
        return [
          ...rest,
          {
            ...prior,
            id: prior?.id,
            player_id: selfId,
            player_name: selfName,
            hole: currentHole,
            strokes: strokesSaved,
            game_id: gid,
          },
        ];
      });
      setScoreModalOpen(false);
    } catch (e) {
      Alert.alert("Could not save score", String(e));
    } finally {
      setScoreBusy(false);
    }
  }

  if (!gameRow) {
    return (
      <View style={styles.root}>
        <SafeAreaView style={styles.safe} edges={["top"]}>
          <GameSessionSubscreenHeader
            onBack={openGame}
            centerIcon="people"
            title="Lobby"
          />
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={GolfColors.sage} />
            <Text style={styles.loadingText}>Loading…</Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  const holeRows = chunkHoles(totalHoles);

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <GameSessionSubscreenHeader
          onBack={openGame}
          centerIcon="people"
          title="Lobby"
        />

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: bottomPad },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* Current round */}
          <View style={styles.roundSection}>
            <LinearGradient
              colors={[
                "rgba(26,42,26,0.98)",
                "rgba(18,32,22,0.92)",
                "rgba(15,28,18,0.88)",
              ]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.roundCard}
            >
              <View style={styles.roundRow}>
                <View>
                  <Text style={styles.roundKicker}>Current Round</Text>
                  <Text style={styles.roundHoleLine}>
                    <Text style={styles.roundHoleMain}>Hole {currentHole}</Text>
                    <Text style={styles.roundHoleOf}> of {totalHoles}</Text>
                  </Text>
                </View>
                <View style={styles.roundRight}>
                  <View style={styles.roundIconBox}>
                    <MaterialIcons
                      name="people"
                      size={26}
                      color={GolfColors.sage}
                    />
                  </View>
                  <View style={styles.roundCount}>
                    <Text style={styles.roundCountNum}>{playerIds.length}</Text>
                    <Text style={styles.roundCountLbl}>Players</Text>
                  </View>
                </View>
              </View>
            </LinearGradient>
          </View>

          {/* Leaderboard */}
          <View style={styles.lbTitleRow}>
            <Text style={styles.lbTitle}>Leaderboard</Text>
            <View style={styles.lbHints}>
              <Text style={styles.lbHint}>Pts</Text>
              <Text style={styles.lbHint}>Strokes</Text>
            </View>
          </View>

          {sortedPlayerIds.map((pid, index) => {
            const isLeader = index === 0;
            const isYou = pid === selfId;
            const displayName = names[pid] ?? pid.slice(0, 8);
            const pts = rawPoints[pid] ?? 0;
            const hidden =
              (rawHidden[pid] ?? 0) >= currentHole && pid !== selfId;
            const totalStr = sumStrokes(scoreRows, gid, pid);

            const cardBorder = isYou
              ? styles.playerCardYou
              : isLeader
                ? styles.playerCardLeader
                : styles.playerCardDefault;

            return (
              <View key={pid} style={[styles.playerCard, cardBorder]}>
                <View style={styles.playerHeader}>
                  <View
                    style={[
                      styles.rankBadge,
                      isLeader ? styles.rankBadgeLeader : styles.rankBadgeRest,
                    ]}
                  >
                    {isLeader ? (
                      <MaterialCommunityIcons
                        name="crown"
                        size={16}
                        color={GolfColors.forestDeep}
                      />
                    ) : (
                      <Text style={styles.rankNum}>{index + 1}</Text>
                    )}
                  </View>

                  <View
                    style={[
                      styles.avatar,
                      isYou ? styles.avatarYou : styles.avatarOther,
                    ]}
                  >
                    <Text
                      style={[
                        styles.avatarLetter,
                        isYou ? styles.avatarLetterYou : undefined,
                      ]}
                    >
                      {avatarInitial(displayName, pid)}
                    </Text>
                  </View>

                  <View style={styles.nameBlock}>
                    <View style={styles.nameRow}>
                      <Text
                        style={[
                          styles.playerName,
                          isYou && styles.playerNameYou,
                        ]}
                        numberOfLines={1}
                      >
                        {displayName}
                      </Text>
                      {isYou ? (
                        <View style={styles.youBadge}>
                          <Text style={styles.youBadgeText}>You</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>

                  <View style={styles.metrics}>
                    <View
                      style={[
                        styles.ptsPill,
                        isLeader ? styles.ptsPillLeader : styles.ptsPillOther,
                      ]}
                    >
                      {isLeader ? (
                        <MaterialIcons
                          name="emoji-events"
                          size={14}
                          color={GolfColors.sage}
                        />
                      ) : null}
                      <Text
                        style={[
                          styles.ptsVal,
                          isLeader ? styles.ptsValLeader : styles.ptsValOther,
                        ]}
                      >
                        {hidden ? "—" : String(pts)}
                      </Text>
                    </View>
                    <Text style={styles.strokeCol}>{totalStr}</Text>
                  </View>
                </View>

                <View style={styles.gridWrap}>
                  {holeRows.map((row, ri) => (
                    <View key={`row-${ri}`} style={styles.holeRow}>
                      {row.map((holeNum) => {
                        const stroke = strokeForHole(scoreRows, pid, holeNum);
                        const isDash = stroke == null;
                        const isCurrent = holeNum === currentHole;
                        const cellStyle = isDash
                          ? styles.holeCellEmpty
                          : isCurrent
                            ? styles.holeCellCurrent
                            : styles.holeCellFilled;

                        return (
                          <View
                            key={holeNum}
                            style={[styles.holeCell, cellStyle]}
                          >
                            <Text style={styles.holeIdx}>{holeNum}</Text>
                            <Text
                              style={[
                                styles.holeScore,
                                isDash && styles.holeScoreMuted,
                              ]}
                            >
                              {isDash ? "—" : String(stroke)}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  ))}
                </View>
              </View>
            );
          })}
        </ScrollView>
      </SafeAreaView>

      <HoleScoreModal
        visible={scoreModalOpen && gid !== ""}
        holeNumber={currentHole}
        strokes={draftStrokes}
        onChangeStrokes={setDraftStrokes}
        onClose={() => setScoreModalOpen(false)}
        onSubmit={() => void submitHoleScore()}
        busy={scoreBusy}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  loadingText: {
    fontFamily: Font.regular,
    fontSize: 15,
    color: GolfColors.sage,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  roundSection: {
    marginBottom: 18,
  },
  roundCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(42,80,48,0.55)",
    padding: 18,
    overflow: "hidden",
  },
  roundRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  roundKicker: {
    fontFamily: Font.semiBold,
    fontSize: 11,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: "rgba(184,212,191,0.65)",
    marginBottom: 6,
  },
  roundHoleLine: {},
  roundHoleMain: {
    fontFamily: Font.black,
    fontSize: 26,
    color: "#FFFFFF",
  },
  roundHoleOf: {
    fontFamily: Font.medium,
    fontSize: 18,
    color: "rgba(184,212,191,0.75)",
  },
  roundRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  roundIconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "rgba(107,152,114,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  roundCount: { alignItems: "flex-end" },
  roundCountNum: {
    fontFamily: Font.bold,
    fontSize: 20,
    color: "#FFFFFF",
  },
  roundCountLbl: {
    fontFamily: Font.medium,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: "rgba(184,212,191,0.65)",
    marginTop: 2,
  },
  lbTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  lbTitle: {
    fontFamily: Font.semiBold,
    fontSize: 13,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: "rgba(184,212,191,0.7)",
  },
  lbHints: {
    flexDirection: "row",
    gap: 22,
  },
  lbHint: {
    fontFamily: Font.medium,
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: "rgba(184,212,191,0.55)",
    width: 52,
    textAlign: "right",
  },
  playerCard: {
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 12,
    overflow: "hidden",
  },
  playerCardYou: {
    borderColor: "rgba(212,175,55,0.55)",
    backgroundColor: "rgba(46,46,30,0.45)",
  },
  playerCardLeader: {
    borderColor: "rgba(107,152,114,0.55)",
    backgroundColor: "rgba(30,62,46,0.42)",
  },
  playerCardDefault: {
    borderColor: "rgba(58,90,58,0.4)",
    backgroundColor: "rgba(30,46,30,0.38)",
  },
  playerHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  rankBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  rankBadgeLeader: {
    backgroundColor: GolfColors.sage,
  },
  rankBadgeRest: {
    backgroundColor: "rgba(120,140,130,0.35)",
  },
  rankNum: {
    fontFamily: Font.bold,
    fontSize: 14,
    color: "rgba(220,230,225,0.85)",
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarYou: {
    backgroundColor: "rgba(212,175,55,0.2)",
  },
  avatarOther: {
    backgroundColor: "rgba(120,140,130,0.32)",
  },
  avatarLetter: {
    fontFamily: Font.bold,
    fontSize: 16,
    color: "#FFFFFF",
  },
  avatarLetterYou: {
    color: GolfColors.gold,
  },
  nameBlock: { flex: 1, minWidth: 0 },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  playerName: {
    fontFamily: Font.bold,
    fontSize: 16,
    color: "#FFFFFF",
    flexShrink: 1,
  },
  playerNameYou: {
    color: GolfColors.gold,
  },
  youBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: "rgba(212,175,55,0.22)",
  },
  youBadgeText: {
    fontFamily: Font.bold,
    fontSize: 9,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: GolfColors.gold,
  },
  metrics: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  ptsPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    minWidth: 44,
    justifyContent: "flex-end",
  },
  ptsPillLeader: {
    backgroundColor: "rgba(107,152,114,0.22)",
  },
  ptsPillOther: {
    backgroundColor: "rgba(212,175,55,0.18)",
  },
  ptsVal: {
    fontFamily: Font.bold,
    fontSize: 14,
  },
  ptsValLeader: {
    color: GolfColors.sage,
  },
  ptsValOther: {
    color: GolfColors.gold,
  },
  strokeCol: {
    fontFamily: Font.bold,
    fontSize: 15,
    color: "#FFFFFF",
    width: 40,
    textAlign: "right",
  },
  gridWrap: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 6,
  },
  holeRow: {
    flexDirection: "row",
    gap: 4,
  },
  holeCell: {
    flex: 1,
    minWidth: 0,
    aspectRatio: 1,
    maxHeight: 44,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
  },
  holeCellEmpty: {
    backgroundColor: "rgba(80,100,90,0.18)",
  },
  holeCellFilled: {
    backgroundColor: "rgba(120,140,130,0.35)",
    borderWidth: 0,
  },
  holeCellCurrent: {
    backgroundColor: "rgba(107,152,114,0.22)",
    borderWidth: 1,
    borderColor: "rgba(107,152,114,0.45)",
  },
  holeIdx: {
    fontFamily: Font.medium,
    fontSize: 8,
    color: "rgba(184,212,191,0.55)",
    marginBottom: 2,
  },
  holeScore: {
    fontFamily: Font.bold,
    fontSize: 12,
    color: "#FFFFFF",
  },
  holeScoreMuted: {
    color: "rgba(184,212,191,0.35)",
    fontFamily: Font.medium,
  },
});
