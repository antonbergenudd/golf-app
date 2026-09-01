import {
  useNavigation,
  useGlobalSearchParams,
  useLocalSearchParams,
  usePathname,
} from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
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

import { gameActionError } from "@/utils/gameActionError";
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
  forestDeep: "#071209",
};

const NAV_ROW_HEIGHT = 52;
const FAB_FLOAT = 28;

/** Expo Router can return `string | string[]`; tab screens may omit parent params in `useLocalSearchParams` while unfocused. */
function paramFirst(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) return String(v[0] ?? "");
  return String(v);
}

function sortVerificationRows(rows: Record<string, unknown>[]) {
  return [...rows].sort((a, b) => {
    const sa = String(a.status ?? "");
    const sb = String(b.status ?? "");
    const pa = sa === "pending" ? 0 : 1;
    const pb = sb === "pending" ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""));
  });
}

export default function VerificationsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const local = useLocalSearchParams();
  const global = useGlobalSearchParams();
  const pathname = usePathname();
  const pathGameId = pathname.match(/\/game\/([^/]+)/)?.[1] ?? "";

  const gameId =
    paramFirst(local.gameId) || paramFirst(global.gameId) || pathGameId;
  const playerId = paramFirst(local.playerId) || paramFirst(global.playerId);
  const playerName =
    paramFirst(local.playerName) || paramFirst(global.playerName) || "Player";

  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [gameRow, setGameRow] = useState<Record<string, unknown> | null>(null);
  const [scoreRows, setScoreRows] = useState<Record<string, unknown>[]>([]);
  const [scoreModalOpen, setScoreModalOpen] = useState(false);
  const [draftStrokes, setDraftStrokes] = useState(4);
  const [scoreBusy, setScoreBusy] = useState(false);

  useEffect(() => {
    if (!gameId) return;
    let active = true;
    const unsub = databaseService.subscribeChallengeVerifications(
      gameId,
      (r) => {
        if (active) setRows(r);
      },
    );
    return () => {
      active = false;
      unsub();
    };
  }, [gameId]);

  useEffect(() => {
    if (!gameId) return;
    let active = true;
    const unsub = databaseService.subscribeGame(gameId, (row) => {
      if (active) setGameRow(row);
    });
    return () => {
      active = false;
      unsub();
    };
  }, [gameId]);

  useEffect(() => {
    if (!gameId) return;
    let active = true;
    const unsub = databaseService.subscribeScores(gameId, (rows) => {
      if (active) setScoreRows(rows);
    });
    return () => {
      active = false;
      unsub();
    };
  }, [gameId]);

  const sorted = useMemo(() => sortVerificationRows(rows), [rows]);

  const pendingCount = useMemo(
    () => sorted.filter((r) => String(r.status ?? "") === "pending").length,
    [sorted],
  );

  const resolveVerification = useCallback(
    async (verificationId: string, outcome: "succeeded" | "failed") => {
      if (!gameId || !playerId) return;
      setBusyId(verificationId);
      try {
        if (outcome === "succeeded") {
          await databaseService.confirmChallengeVerification({
            gameId,
            verificationId,
            verifierId: playerId,
            verifierName: playerName,
          });
        } else {
          await databaseService.failChallengeVerification({
            gameId,
            verificationId,
            verifierId: playerId,
            verifierName: playerName,
          });
        }
      } catch (e) {
        Alert.alert("Verification", gameActionError(e));
      } finally {
        setBusyId(null);
      }
    },
    [gameId, playerId, playerName],
  );

  const currentHole = Number(gameRow?.current_hole ?? 1);

  const myHoleScoreRow = useMemo(
    () =>
      scoreRows.find(
        (r) =>
          String(r.player_id) === playerId && Number(r.hole) === currentHole,
      ),
    [scoreRows, playerId, currentHole],
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

  const openScoreModal = useCallback(() => {
    if (!gameId) {
      Alert.alert(
        "Score",
        "Open verifications from an active round to enter scores.",
      );
      return;
    }
    blurActiveElementForModalWeb();
    setDraftStrokes(
      hasHoleScore && savedStrokesForHole != null ? savedStrokesForHole : 4,
    );
    setScoreModalOpen(true);
  }, [gameId, hasHoleScore, savedStrokesForHole]);

  const fabRegistration: GameFabRegistration = useMemo(
    () => ({
      digit: !gameId ? "—" : hasHoleScore ? String(savedStrokesForHole!) : "—",
      scoredLook: Boolean(gameId && hasHoleScore),
      caption: "Score",
      captionEntered: Boolean(gameId && hasHoleScore),
      onPress: openScoreModal,
      accessibilityLabel: !gameId
        ? "Score"
        : hasHoleScore && savedStrokesForHole != null
          ? `Score ${savedStrokesForHole} strokes, tap to edit`
          : "Enter score for this hole",
    }),
    [gameId, hasHoleScore, savedStrokesForHole, openScoreModal],
  );

  useRegisterGameTabFab("verifications", fabRegistration);

  async function submitHoleScore() {
    if (!gameId || !playerId) return;
    const strokesSaved = Math.min(30, Math.max(1, Math.floor(draftStrokes)));
    setScoreBusy(true);
    try {
      await databaseService.saveHoleScore({
        gameId,
        playerId,
        playerName,
        hole: currentHole,
        strokes: draftStrokes,
      });
      setScoreRows((prev) => {
        const rest = prev.filter(
          (r) =>
            String(r.player_id) !== playerId || Number(r.hole) !== currentHole,
        );
        const prior = prev.find(
          (r) =>
            String(r.player_id) === playerId && Number(r.hole) === currentHole,
        );
        return [
          ...rest,
          {
            ...prior,
            id: prior?.id,
            player_id: playerId,
            player_name: playerName,
            hole: currentHole,
            strokes: strokesSaved,
            game_id: gameId,
          },
        ];
      });
      setScoreModalOpen(false);
    } catch (e) {
      Alert.alert("Could not save score", gameActionError(e));
    } finally {
      setScoreBusy(false);
    }
  }

  function openGame() {
    navigation.navigate("index" as never);
  }

  const bottomPad =
    NAV_ROW_HEIGHT + FAB_FLOAT + Math.max(insets.bottom, 10) + 24;

  const isEmptyScroll = !gameId || sorted.length === 0;

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <GameSessionSubscreenHeader
          onBack={openGame}
          centerIcon="fact-check"
          title="Verifications"
        />

        <View style={styles.statsSection}>
          <View>
            <Text style={styles.statsKicker}>Challenge checks</Text>
            <Text style={styles.statsBig}>
              {gameId ? (
                <>
                  {pendingCount}{" "}
                  <Text style={styles.statsBigMuted}>pending</Text>
                </>
              ) : (
                <Text style={styles.statsBigMuted}>—</Text>
              )}
            </Text>
          </View>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            isEmptyScroll && styles.scrollContentEmptyFill,
            { paddingBottom: bottomPad },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {!gameId ? (
            <View style={styles.emptyCards}>
              <MaterialIcons
                name="fact-check"
                size={40}
                color="rgba(184,212,191,0.45)"
              />
              <Text style={styles.emptyCardsTitle}>No active game</Text>
              <Text style={styles.emptyCardsSub}>
                Open verifications from a round in progress.
              </Text>
            </View>
          ) : sorted.length === 0 ? (
            <View style={styles.emptyCards}>
              <MaterialIcons
                name="fact-check"
                size={40}
                color="rgba(184,212,191,0.45)"
              />
              <Text style={styles.emptyCardsTitle}>
                No verification requests yet
              </Text>
              <Text style={styles.emptyCardsSub}>
                When someone sends a challenge for verification, it will appear
                here for another player to mark succeeded or failed.
              </Text>
            </View>
          ) : (
            sorted.map((row) => {
              const id = String(row.id ?? "");
              const status = String(row.status ?? "");
              const pending = status === "pending";
              const claimantId = String(row.claimant_id ?? "");
              const claimantName = String(row.claimant_name ?? "Player");
              const title = String(row.challenge_title ?? "Challenge");
              const description = String(
                row.challenge_description ?? "",
              ).trim();
              const hole = Number(row.hole ?? 1);
              const pts = Number(row.points_to_award ?? 0);
              const verifierName = String(row.verifier_name ?? "");
              const deputyN = String(row.deputy_name ?? "");
              const canConfirm =
                pending && claimantId !== playerId && playerId !== "";
              const isOwnRequest = pending && claimantId === playerId;
              const busy = busyId === id;

              return (
                <View key={id} style={styles.card}>
                  <View style={styles.cardTop}>
                    <Text style={styles.cardTitle} numberOfLines={2}>
                      {title}
                    </Text>
                    <View
                      style={[
                        styles.statusPill,
                        pending
                          ? styles.statusPending
                          : status === "confirmed"
                            ? styles.statusOk
                            : status === "failed"
                              ? styles.statusFail
                              : styles.statusMuted,
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusPillText,
                          pending && styles.statusPillTextPending,
                          status === "confirmed" && styles.statusPillTextOk,
                          status === "failed" && styles.statusPillTextFail,
                        ]}
                      >
                        {pending
                          ? "Pending"
                          : status === "confirmed"
                            ? "Succeeded"
                            : status === "failed"
                              ? "Failed"
                              : status === "cancelled"
                                ? "Cancelled"
                                : status}
                      </Text>
                    </View>
                  </View>
                  {description ? (
                    <Text style={styles.cardDescription}>{description}</Text>
                  ) : null}
                  <Text style={styles.cardMeta}>
                    Hole {hole}
                    {Number.isFinite(pts) && pts > 0 ? ` · +${pts} pts` : ""}
                  </Text>
                  <Text style={styles.cardWho}>
                    Requested by {claimantName}
                  </Text>
                  {deputyN ? (
                    <Text style={styles.cardFighter}>Fighter: {deputyN}</Text>
                  ) : null}
                  {status === "confirmed" && verifierName ? (
                    <Text style={styles.cardFoot}>
                      Succeeded · {verifierName}
                    </Text>
                  ) : null}
                  {status === "failed" && verifierName ? (
                    <Text style={styles.cardFoot}>Failed · {verifierName}</Text>
                  ) : null}
                  {canConfirm ? (
                    <View style={styles.actionRow}>
                      {busy ? (
                        <ActivityIndicator
                          color={GolfColors.gold}
                          style={styles.actionBusy}
                        />
                      ) : (
                        <>
                          <Pressable
                            style={({ pressed }) => [
                              styles.outcomeBtn,
                              styles.outcomeBtnFail,
                              pressed && styles.outcomeBtnPressed,
                            ]}
                            onPress={() =>
                              void resolveVerification(id, "failed")
                            }
                            accessibilityRole="button"
                            accessibilityLabel={`Mark challenge failed for ${claimantName}`}
                          >
                            <Text style={styles.outcomeBtnFailText}>
                              Failed
                            </Text>
                          </Pressable>
                          <Pressable
                            style={({ pressed }) => [
                              styles.outcomeBtn,
                              styles.outcomeBtnOk,
                              pressed && styles.outcomeBtnPressed,
                            ]}
                            onPress={() =>
                              void resolveVerification(id, "succeeded")
                            }
                            accessibilityRole="button"
                            accessibilityLabel={`Mark challenge succeeded for ${claimantName}`}
                          >
                            <Text style={styles.outcomeBtnOkText}>
                              Succeeded
                            </Text>
                          </Pressable>
                        </>
                      )}
                    </View>
                  ) : null}
                  {isOwnRequest ? (
                    <Text style={styles.waitingNote}>
                      Waiting for another player to mark succeeded or failed.
                    </Text>
                  ) : null}
                </View>
              );
            })
          )}
        </ScrollView>
      </SafeAreaView>

      <HoleScoreModal
        visible={scoreModalOpen && gameId !== ""}
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
  statsSection: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "flex-start",
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  statsKicker: {
    fontFamily: Font.semiBold,
    fontSize: 11,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: "rgba(184,212,191,0.65)",
    marginBottom: 6,
  },
  statsBig: {
    fontFamily: Font.black,
    fontSize: 28,
    color: "#FFFFFF",
  },
  statsBigMuted: {
    fontFamily: Font.medium,
    fontSize: 18,
    color: "rgba(184,212,191,0.75)",
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 4,
    gap: 12,
  },
  scrollContentEmptyFill: {
    flexGrow: 1,
    justifyContent: "center",
  },
  emptyCards: {
    alignItems: "center",
    paddingVertical: 36,
    paddingHorizontal: 12,
    gap: 10,
  },
  emptyCardsTitle: {
    fontFamily: Font.semiBold,
    fontSize: 16,
    color: "rgba(255,255,255,0.88)",
    textAlign: "center",
  },
  emptyCardsSub: {
    fontFamily: Font.regular,
    fontSize: 14,
    lineHeight: 20,
    color: "rgba(184,212,191,0.72)",
    textAlign: "center",
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(42,80,48,0.65)",
    backgroundColor: "rgba(20,41,24,0.94)",
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 6,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  cardTitle: {
    flex: 1,
    fontFamily: Font.semiBold,
    fontSize: 16,
    color: "rgba(255,255,255,0.92)",
  },
  cardDescription: {
    fontFamily: Font.regular,
    fontSize: 14,
    lineHeight: 20,
    color: "rgba(184,212,191,0.88)",
  },
  statusPill: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusPending: {
    backgroundColor: "rgba(212,175,55,0.18)",
  },
  statusOk: {
    backgroundColor: "rgba(107,152,114,0.22)",
  },
  statusFail: {
    backgroundColor: "rgba(255,82,82,0.18)",
  },
  statusMuted: {
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  statusPillText: {
    fontFamily: Font.bold,
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.55)",
  },
  statusPillTextPending: {
    color: GolfColors.gold,
  },
  statusPillTextOk: {
    color: GolfColors.sage,
  },
  statusPillTextFail: {
    color: "#FF8A80",
  },
  cardMeta: {
    fontFamily: Font.medium,
    fontSize: 13,
    color: "rgba(184,212,191,0.85)",
  },
  cardWho: {
    fontFamily: Font.regular,
    fontSize: 14,
    color: "rgba(255,255,255,0.72)",
  },
  cardFighter: {
    fontFamily: Font.medium,
    fontSize: 14,
    color: "rgba(212,175,55,0.9)",
  },
  cardFoot: {
    fontFamily: Font.regular,
    fontSize: 13,
    color: "rgba(184,212,191,0.7)",
    marginTop: 2,
  },
  waitingNote: {
    fontFamily: Font.medium,
    fontSize: 13,
    color: "rgba(212,175,55,0.85)",
    marginTop: 4,
  },
  actionRow: {
    marginTop: 10,
    flexDirection: "row",
    gap: 10,
    alignItems: "stretch",
    minHeight: 46,
  },
  actionBusy: {
    flex: 1,
    paddingVertical: 12,
  },
  outcomeBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  outcomeBtnPressed: {
    opacity: 0.92,
  },
  outcomeBtnFail: {
    borderWidth: 1,
    borderColor: "rgba(255,138,128,0.55)",
    backgroundColor: "rgba(255,82,82,0.12)",
  },
  outcomeBtnFailText: {
    fontFamily: Font.bold,
    fontSize: 14,
    color: "#FFAB91",
  },
  outcomeBtnOk: {
    backgroundColor: GolfColors.gold,
  },
  outcomeBtnOkText: {
    fontFamily: Font.bold,
    fontSize: 14,
    color: GolfColors.forestDeep,
  },
});
