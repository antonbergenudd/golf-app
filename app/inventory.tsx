import { Ionicons } from "@expo/vector-icons";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import {
  router,
  useGlobalSearchParams,
  useLocalSearchParams,
  usePathname,
  useSegments,
} from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Modal,
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

import { GolfChrome } from "@/components/fairway/GolfChrome";
import { HoleScoreModal } from "@/components/fairway/HoleScoreModal";
import { VerificationNavButton } from "@/components/fairway/VerificationNavButton";
import { useGamePendingVerificationCount } from "@/hooks/useGamePendingVerificationCount";
import { isAttackActionCard, isChallengeCardType, isInventoryActionCard } from "@/models/card";
import type { Lobby, LobbyPlayer } from "@/models/lobby";
import { databaseService } from "@/services/databaseService";
import { Font } from "@/theme/fonts";
import { resolveSessionGameId, paramFirst } from "@/utils/resolveSessionGameId";
import { blurActiveElementForModalWeb as blurBeforeModalWeb } from "@/utils/blurForModalWeb";
import {
  formatAttackOutcome,
  type AttackFeedbackCopy,
} from "@/utils/attackOutcomeMessages";

const GolfColors = {
  gold: "#D4AF37",
  sage: "#6B9872",
  mist: "#B8D4BF",
  forestDeep: "#071209",
  danger: "#FF5252",
};

const NAV_ROW_HEIGHT = 52;
const FAB_FLOAT = 28;

function starsFromPoints(points: unknown): number {
  const n = Number(points);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.min(3, Math.max(1, Math.ceil(n)));
}

export default function InventoryScreen() {
  const insets = useSafeAreaInsets();
  const p = useLocalSearchParams<{
    gameId: string;
    playerId: string;
    lobbyId: string;
    playerName?: string;
  }>();
  const global = useGlobalSearchParams() as Record<string, unknown>;
  const pathname = usePathname();
  const segments = useSegments();

  const gameId = resolveSessionGameId({
    local: p as Record<string, unknown>,
    global,
    pathname,
    segments,
  });
  const playerId =
    paramFirst(p.playerId) ||
    paramFirst(global.playerId);
  const playerName =
    paramFirst(p.playerName) ||
    paramFirst(global.playerName) ||
    "Player";
  const lobbyId =
    paramFirst(p.lobbyId) ||
    paramFirst(global.lobbyId);

  const pendingVerificationCount = useGamePendingVerificationCount(
    gameId,
    playerId,
  );

  const [gameRow, setGameRow] = useState<Record<string, unknown> | null>(null);
  const [cardsDoc, setCardsDoc] = useState<Record<string, unknown> | null>(
    null,
  );
  const [lobbySnap, setLobbySnap] = useState<Lobby | null>(null);
  const [busy, setBusy] = useState<boolean | string>(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [targetModal, setTargetModal] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [scoreRows, setScoreRows] = useState<Record<string, unknown>[]>([]);
  const [scoreModalOpen, setScoreModalOpen] = useState(false);
  const [draftStrokes, setDraftStrokes] = useState(4);
  const [scoreBusy, setScoreBusy] = useState(false);

  useEffect(() => {
    if (!gameId) return;
    return databaseService.subscribeScores(gameId, setScoreRows);
  }, [gameId]);

  useEffect(() => {
    if (!gameId) return;
    return databaseService.subscribeGame(gameId, setGameRow);
  }, [gameId]);

  useEffect(() => {
    if (!gameId || !playerId) return;
    return databaseService.subscribePlayerCards(gameId, playerId, setCardsDoc);
  }, [gameId, playerId]);

  useEffect(() => {
    if (!lobbyId) return;
    return databaseService.subscribeLobby(lobbyId, setLobbySnap);
  }, [lobbyId]);

  const currentHole = Number(gameRow?.current_hole ?? 1);

  const myHoleScoreRow = useMemo(
    () =>
      scoreRows.find(
        (r) =>
          String(r.player_id) === playerId &&
          Number(r.hole) === currentHole,
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

  const inventoryCards = useMemo(() => {
    const raw = (cardsDoc?.cards as Record<string, unknown>[]) ?? [];
    return raw.filter(isInventoryActionCard);
  }, [cardsDoc]);

  const attackCount = useMemo(
    () => inventoryCards.filter((c) => isAttackActionCard(c)).length,
    [inventoryCards],
  );
  const utilityCount = inventoryCards.length - attackCount;

  const targetCandidates = useMemo(() => {
    const players = lobbySnap?.players ?? [];
    return players.filter((pl) => pl.id !== playerId);
  }, [lobbySnap?.players, playerId]);

  const [trialCombatStep, setTrialCombatStep] = useState<
    null | { action: Record<string, unknown>; deputy?: LobbyPlayer }
  >(null);

  const trialCombatChallengeOptions = useMemo(() => {
    const raw = (cardsDoc?.cards as Record<string, unknown>[]) ?? [];
    return raw.filter(
      (c) =>
        isChallengeCardType(String(c.type)) &&
        Number(c.hole ?? 0) === currentHole &&
        c.claimed !== true &&
        c.verificationPending !== true,
    );
  }, [cardsDoc, currentHole]);

  const [attackFeedback, setAttackFeedback] =
    useState<AttackFeedbackCopy | null>(null);

  const bottomPad =
    NAV_ROW_HEIGHT + FAB_FLOAT + Math.max(insets.bottom, 10) + 24;

  const playAttackCard = useCallback(
    async (card: Record<string, unknown>, target: LobbyPlayer) => {
      if (!gameId || busy) return;
      const cardId = String(card.id ?? "");
      const cardHole = Number(card.hole ?? currentHole);
      const snapshot = { ...card };
      setBusy(true);
      try {
        await databaseService.markPendingBankedActionUsed({
          gameId,
          playerId,
          cardId,
          cardHole,
        });
        const outcome = await databaseService.resolvePlayedAttackCard({
          gameId,
          attackerId: playerId,
          attackerName: playerName,
          targetPlayerId: target.id,
          targetPlayerName: target.name,
          card: snapshot,
        });
        await databaseService.resolveActionStealCopiesForPlayedAction({
          gameId,
          sourcePlayerId: playerId,
          sourceActionCard: snapshot,
        });
        setAttackFeedback(formatAttackOutcome(outcome, target.name));
        setSelectedId(null);
      } catch (e) {
        Alert.alert("Inventory", String(e));
      } finally {
        setBusy(false);
      }
    },
    [gameId, playerId, currentHole, busy, playerName],
  );

  const playCard = useCallback(
    async (card: Record<string, unknown>) => {
      if (!gameId || busy) return;
      const cardId = String(card.id ?? "");
      const cardHole = Number(card.hole ?? currentHole);
      const snapshot = { ...card };
      setBusy(true);
      try {
        await databaseService.markPendingBankedActionUsed({
          gameId,
          playerId,
          cardId,
          cardHole,
        });
        await databaseService.resolveActionStealCopiesForPlayedAction({
          gameId,
          sourcePlayerId: playerId,
          sourceActionCard: snapshot,
        });
        setSelectedId(null);
      } catch (e) {
        Alert.alert("Inventory", String(e));
      } finally {
        setBusy(false);
      }
    },
    [gameId, playerId, currentHole, busy],
  );

  function beginTrialCombat(card: Record<string, unknown>) {
    const raw = (cardsDoc?.cards as Record<string, unknown>[]) ?? [];
    const has = raw.some(
      (c) =>
        isChallengeCardType(String(c.type)) &&
        Number(c.hole ?? 0) === currentHole &&
        c.claimed !== true &&
        c.verificationPending !== true,
    );
    if (!has) {
      Alert.alert(
        "Trial by combat",
        "You need an unclaimed challenge on this hole to assign a fighter.",
      );
      return;
    }
    if (targetCandidates.length === 0) {
      Alert.alert(
        "Trial by combat",
        "You need at least one other player in the lobby.",
      );
      return;
    }
    blurBeforeModalWeb();
    setTrialCombatStep({ action: card });
  }

  async function completeTrialCombat(
    action: Record<string, unknown>,
    deputy: LobbyPlayer,
    challengeCardId: string,
  ) {
    if (!gameId || busy) return;
    const actionId = String(action.id ?? "");
    const hole = Number(action.hole ?? currentHole);
    setBusy(`trial_${actionId}`);
    try {
      await databaseService.assignTrialCombatDeputy({
        gameId,
        sponsorId: playerId,
        deputyId: deputy.id,
        deputyName: deputy.name,
        challengeCardId,
        cardHole: hole,
      });
      await databaseService.markPendingBankedActionUsed({
        gameId,
        playerId,
        cardId: actionId,
        cardHole: hole,
      });
      setTrialCombatStep(null);
    } catch (e) {
      Alert.alert("Trial by combat", String(e));
    } finally {
      setBusy(null);
    }
  }

  function handlePlayPress(card: Record<string, unknown>) {
    if (String(card.id ?? "") === "action_041") {
      beginTrialCombat(card);
      return;
    }
    const needsTarget = isAttackActionCard(card);
    if (needsTarget) {
      blurBeforeModalWeb();
      setTargetModal(card);
      return;
    }
    void playCard(card);
  }

  function openGame() {
    if (router.canGoBack()) router.back();
    else router.replace("/");
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

  const openScoreModal = useCallback(() => {
    if (!gameId) {
      Alert.alert(
        "Score",
        "Open inventory from an active round to enter scores.",
      );
      return;
    }
    blurBeforeModalWeb();
    setDraftStrokes(
      hasHoleScore && savedStrokesForHole != null
        ? savedStrokesForHole
        : 4,
    );
    setScoreModalOpen(true);
  }, [gameId, hasHoleScore, savedStrokesForHole]);

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
            String(r.player_id) === playerId &&
            Number(r.hole) === currentHole,
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
      Alert.alert("Could not save score", String(e));
    } finally {
      setScoreBusy(false);
    }
  }

  return (
    <GolfChrome>
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.header}>
          <Pressable
            onPress={openGame}
            hitSlop={12}
            style={styles.headerSide}
            accessibilityRole="button"
            accessibilityLabel="Back to game"
          >
            <Ionicons name="chevron-back" size={22} color={GolfColors.mist} />
            <Text style={styles.headerBack}>Back</Text>
          </Pressable>
          <View style={styles.headerCenter} pointerEvents="none">
            <MaterialIcons name="layers" size={18} color={GolfColors.gold} />
            <Text style={styles.headerTitle}>Inventory</Text>
          </View>
          <View style={styles.headerSide} />
        </View>

        {gameId === "" ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>No active game</Text>
            <Text style={styles.emptySub}>
              Open inventory from a round in progress.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.statsSection}>
              <View>
                <Text style={styles.statsKicker}>Your cards</Text>
                <Text style={styles.statsBig}>
                  {inventoryCards.length}{" "}
                  <Text style={styles.statsBigMuted}>available</Text>
                </Text>
              </View>
              <View style={styles.statsPills}>
                <View style={styles.statPill}>
                  <View
                    style={[styles.statIconWrap, styles.statIconAttack]}
                  >
                    <MaterialIcons
                      name="gps-fixed"
                      size={18}
                      color={GolfColors.danger}
                    />
                  </View>
                  <Text style={styles.statPillCap}>Attack</Text>
                  <Text style={styles.statPillVal}>{attackCount}</Text>
                </View>
                <View style={styles.statPill}>
                  <View
                    style={[styles.statIconWrap, styles.statIconUtility]}
                  >
                    <MaterialIcons
                      name="shield"
                      size={18}
                      color={GolfColors.sage}
                    />
                  </View>
                  <Text style={styles.statPillCap}>Utility</Text>
                  <Text style={styles.statPillVal}>{utilityCount}</Text>
                </View>
              </View>
            </View>

            <ScrollView
              style={styles.scroll}
              contentContainerStyle={[
                styles.scrollContent,
                { paddingBottom: bottomPad },
              ]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {inventoryCards.length === 0 ? (
                <View style={styles.emptyCards}>
                  <View style={styles.emptyIconTile}>
                    <MaterialIcons
                      name="layers"
                      size={36}
                      color="rgba(184,212,191,0.45)"
                    />
                  </View>
                  <Text style={styles.emptyCardsTitle}>
                    No cards in your inventory
                  </Text>
                  <Text style={styles.emptyCardsSub}>
                    Buy cards from the market to use them here
                  </Text>
                </View>
              ) : (
                inventoryCards.map((card) => {
                  const id = String(card.id ?? "");
                  const title = String(card.title ?? "Action");
                  const description = String(card.description ?? "");
                  const attack = isAttackActionCard(card);
                  const selected = selectedId === id;
                  const stars = starsFromPoints(card.points);

                  return (
                    <Pressable
                      key={id}
                      onPress={() =>
                        setSelectedId(selected ? null : id)
                      }
                      style={({ pressed }) => [
                        pressed && styles.cardShellPressed,
                      ]}
                    >
                      <View
                        style={[
                          styles.cardShell,
                          attack ? styles.cardShellAttack : styles.cardShellUtility,
                          selected && styles.cardShellSelected,
                        ]}
                      >
                      <View style={styles.cardRow}>
                        <View
                          style={[
                            styles.cardIconBg,
                            selected
                              ? styles.cardIconBgSelected
                              : attack
                                ? styles.cardIconBgAttack
                                : styles.cardIconBgUtility,
                          ]}
                        >
                          <MaterialIcons
                            name={attack ? "bolt" : "eco"}
                            size={28}
                            color={
                              selected
                                ? GolfColors.gold
                                : attack
                                  ? GolfColors.danger
                                  : GolfColors.mist
                            }
                          />
                        </View>
                        <View style={styles.cardBody}>
                          <View style={styles.cardTitleRow}>
                            <Text style={styles.cardTitle} numberOfLines={1}>
                              {title}
                            </Text>
                            <View
                              style={[
                                styles.typeBadge,
                                attack
                                  ? styles.typeBadgeAttack
                                  : styles.typeBadgeUtility,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.typeBadgeText,
                                  attack
                                    ? styles.typeBadgeTextAttack
                                    : styles.typeBadgeTextUtility,
                                ]}
                              >
                                {attack ? "ATTACK" : "UTILITY"}
                              </Text>
                            </View>
                          </View>
                          <Text style={styles.cardDesc} numberOfLines={2}>
                            {description}
                          </Text>
                          <View style={styles.starRow}>
                            {[0, 1, 2].map((i) => (
                              <MaterialIcons
                                key={i}
                                name={
                                  i < stars ? "star" : "star-border"
                                }
                                size={12}
                                color={
                                  i < stars
                                    ? selected
                                      ? GolfColors.gold
                                      : attack
                                        ? GolfColors.danger
                                        : GolfColors.mist
                                    : "rgba(107,152,114,0.35)"
                                }
                              />
                            ))}
                          </View>
                        </View>
                        {attack ? (
                          <MaterialIcons
                            name="gps-fixed"
                            size={18}
                            color="rgba(184,212,191,0.55)"
                          />
                        ) : null}
                      </View>

                      {selected ? (
                        <View style={styles.cardExpand}>
                          <Pressable
                            onPress={(e) => {
                              e.stopPropagation?.();
                              handlePlayPress(card);
                            }}
                            disabled={busy}
                          >
                            {({ pressed }) => (
                            <View
                              style={[
                                styles.playBtn,
                                attack
                                  ? styles.playBtnAttack
                                  : styles.playBtnUtility,
                                busy && { opacity: 0.6 },
                                pressed && !busy && { opacity: 0.92 },
                              ]}
                            >
                            <Ionicons
                              name="play"
                              size={20}
                              color={
                                attack ? "#FFFFFF" : GolfColors.forestDeep
                              }
                            />
                            <Text
                              style={[
                                styles.playBtnText,
                                attack && styles.playBtnTextLight,
                              ]}
                            >
                              {attack
                                ? String(card.id) === "action_041"
                                  ? "Set up trial"
                                  : "Select target"
                                : "Play card"}
                            </Text>
                            </View>
                            )}
                          </Pressable>
                        </View>
                      ) : null}
                      </View>
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          </>
        )}
      </SafeAreaView>

      <Modal
        visible={targetModal !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setTargetModal(null)}
        onShow={blurBeforeModalWeb}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setTargetModal(null)}
        >
          <Pressable
            style={styles.modalSheet}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalKicker}>Playing</Text>
                <Text style={styles.modalTitle}>
                  {targetModal
                    ? String(targetModal.title ?? "Action")
                    : ""}
                </Text>
              </View>
              <Pressable
                onPress={() => setTargetModal(null)}
                hitSlop={10}
                style={styles.modalClose}
              >
                <MaterialIcons name="close" size={22} color={GolfColors.mist} />
              </Pressable>
            </View>
            <Text style={styles.modalHint}>Select a target player:</Text>
            {targetCandidates.length === 0 ? (
              <Text style={styles.modalEmpty}>
                No other players in this lobby yet.
              </Text>
            ) : (
              targetCandidates.map((pl) => (
                <Pressable
                  key={pl.id}
                  onPress={() => {
                    const c = targetModal;
                    setTargetModal(null);
                    if (c) void playAttackCard(c, pl);
                  }}
                  disabled={busy}
                  style={({ pressed }) => [
                    styles.targetRow,
                    pressed && { opacity: 0.9 },
                  ]}
                >
                  <View style={styles.targetAvatar}>
                    <Text style={styles.targetAvatarText}>
                      {(pl.name || "?").slice(0, 1).toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.targetName}>{pl.name}</Text>
                  <MaterialIcons
                    name="gps-fixed"
                    size={18}
                    color={GolfColors.danger}
                    style={{ marginLeft: "auto" }}
                  />
                </Pressable>
              ))
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={attackFeedback !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setAttackFeedback(null)}
      >
        <Pressable
          style={styles.attackFeedbackBackdrop}
          onPress={() => setAttackFeedback(null)}
        >
          <Pressable
            style={[
              styles.modalSheet,
              attackFeedback?.tone === "celebrate" && styles.attackSheetCelebrate,
              attackFeedback?.tone === "oops" && styles.attackSheetOops,
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={styles.modalKicker}>Attack result</Text>
            <Text style={styles.attackResultTitle}>
              {attackFeedback?.title ?? ""}
            </Text>
            <Text style={styles.attackResultBody}>{attackFeedback?.body ?? ""}</Text>
            <Pressable
              style={styles.attackResultDone}
              onPress={() => setAttackFeedback(null)}
              accessibilityRole="button"
              accessibilityLabel="Dismiss"
            >
              <Text style={styles.attackResultDoneText}>OK</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={trialCombatStep !== null && trialCombatStep.deputy === undefined}
        transparent
        animationType="fade"
        onRequestClose={() => setTrialCombatStep(null)}
        onShow={blurBeforeModalWeb}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setTrialCombatStep(null)}
        >
          <Pressable
            style={styles.modalSheet}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalKicker}>Trial by combat</Text>
                <Text style={styles.modalTitle}>
                  {trialCombatStep
                    ? String(trialCombatStep.action.title ?? "Action")
                    : ""}
                </Text>
              </View>
              <Pressable
                onPress={() => setTrialCombatStep(null)}
                hitSlop={10}
                style={styles.modalClose}
              >
                <MaterialIcons name="close" size={22} color={GolfColors.mist} />
              </Pressable>
            </View>
            <Text style={styles.modalHint}>
              Who performs your challenge for you?
            </Text>
            {targetCandidates.map((pl) => (
              <Pressable
                key={pl.id}
                onPress={() => {
                  if (!trialCombatStep) return;
                  setTrialCombatStep({ action: trialCombatStep.action, deputy: pl });
                }}
                disabled={busy !== null}
                style={({ pressed }) => [
                  styles.targetRow,
                  pressed && { opacity: 0.9 },
                ]}
              >
                <View style={styles.targetAvatar}>
                  <Text style={styles.targetAvatarText}>
                    {(pl.name || "?").slice(0, 1).toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.targetName}>{pl.name}</Text>
                <MaterialIcons
                  name="person"
                  size={18}
                  color={GolfColors.gold}
                  style={{ marginLeft: "auto" }}
                />
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={
          trialCombatStep !== null && trialCombatStep.deputy !== undefined
        }
        transparent
        animationType="fade"
        onRequestClose={() =>
          setTrialCombatStep((s) =>
            s ? { action: s.action } : null,
          )
        }
        onShow={blurBeforeModalWeb}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() =>
            setTrialCombatStep((s) => (s ? { action: s.action } : null))
          }
        >
          <Pressable
            style={styles.modalSheet}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalKicker}>Trial by combat</Text>
                <Text style={styles.modalTitle}>Choose challenge</Text>
              </View>
              <Pressable
                onPress={() =>
                  setTrialCombatStep((s) =>
                    s ? { action: s.action } : null,
                  )
                }
                hitSlop={10}
                style={styles.modalClose}
              >
                <MaterialIcons name="close" size={22} color={GolfColors.mist} />
              </Pressable>
            </View>
            <Text style={styles.modalHint}>
              Fighter: {trialCombatStep?.deputy?.name ?? ""}
            </Text>
            {trialCombatChallengeOptions.length === 0 ? (
              <Text style={styles.modalEmpty}>
                No eligible challenges on this hole.
              </Text>
            ) : (
              trialCombatChallengeOptions.map((ch) => (
                <Pressable
                  key={String(ch.id)}
                  onPress={() => {
                    const step = trialCombatStep;
                    if (!step?.deputy || busy) return;
                    void completeTrialCombat(
                      step.action,
                      step.deputy,
                      String(ch.id ?? ""),
                    );
                  }}
                  disabled={busy !== null}
                  style={({ pressed }) => [
                    styles.targetRow,
                    pressed && { opacity: 0.9 },
                  ]}
                >
                  <MaterialIcons
                    name="emoji-events"
                    size={20}
                    color={GolfColors.gold}
                  />
                  <Text style={styles.targetName} numberOfLines={2}>
                    {String(ch.title ?? "Challenge")}
                  </Text>
                  <MaterialIcons
                    name="chevron-right"
                    size={20}
                    color={GolfColors.mist}
                    style={{ marginLeft: "auto" }}
                  />
                </Pressable>
              ))
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <HoleScoreModal
        visible={scoreModalOpen && gameId !== ""}
        holeNumber={currentHole}
        strokes={draftStrokes}
        onChangeStrokes={setDraftStrokes}
        onClose={() => setScoreModalOpen(false)}
        onSubmit={() => void submitHoleScore()}
        busy={scoreBusy}
      />

      {/* Bottom tab bar — aligned with game screen */}
      <View
        style={[
          styles.bottomNav,
          { paddingBottom: Math.max(insets.bottom, 10) },
        ]}
      >
        <Pressable style={styles.navItem} onPress={openGame}>
          <MaterialIcons name="flag" size={22} color={GolfColors.sage} />
          <Text style={styles.navLabel}>Game</Text>
        </Pressable>

        <Pressable style={styles.navItem}>
          <MaterialIcons name="layers" size={22} color={GolfColors.gold} />
          <Text style={[styles.navLabel, styles.navLabelActive]}>
            Inventory
          </Text>
        </Pressable>

        <View style={styles.fabSlot}>
          <Pressable
            style={({ pressed }) => [
              styles.fabOuter,
              !gameId || !hasHoleScore
                ? styles.fabOuterPending
                : styles.fabOuterScored,
              pressed && styles.fabOuterPressed,
            ]}
            onPress={openScoreModal}
            accessibilityLabel={
              !gameId
                ? "Score"
                : hasHoleScore
                  ? `Score ${savedStrokesForHole} strokes, tap to edit`
                  : "Enter score for this hole"
            }
          >
            <Text
              style={[
                styles.fabDigit,
                gameId && !hasHoleScore && styles.fabDigitPlaceholder,
              ]}
            >
              {!gameId ? "—" : hasHoleScore ? String(savedStrokesForHole) : "—"}
            </Text>
          </Pressable>
          <Text
            style={[
              styles.fabCaption,
              gameId && (hasHoleScore ? styles.fabCaptionEntered : styles.fabCaptionPrompt),
            ]}
          >
            {!gameId ? "Score" : hasHoleScore ? "Score" : "Enter Score"}
          </Text>
        </View>

        <Pressable style={styles.navItem} onPress={openScorecard}>
          <MaterialIcons name="people" size={22} color={GolfColors.sage} />
          <Text style={styles.navLabel}>Lobby</Text>
        </Pressable>

        <VerificationNavButton
          pendingCount={pendingVerificationCount}
          onPress={() =>
            router.push({
              pathname: "/verifications",
              params: {
                gameId,
                playerId,
                lobbyId,
                playerName,
                lobbyName: lobbySnap?.name ?? "",
              },
            })
          }
          iconColor={GolfColors.sage}
        />
      </View>
    </GolfChrome>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  headerSide: {
    width: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  headerBack: {
    fontFamily: Font.medium,
    fontSize: 14,
    color: "rgba(184,212,191,0.85)",
  },
  headerCenter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerTitle: {
    fontFamily: Font.bold,
    fontSize: 17,
    color: "#FFFFFF",
  },
  statsSection: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  statsKicker: {
    fontFamily: Font.semiBold,
    fontSize: 11,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: "rgba(184,212,191,0.65)",
    marginBottom: 4,
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
  statsPills: {
    flexDirection: "row",
    gap: 14,
  },
  statPill: {
    alignItems: "center",
    minWidth: 56,
  },
  statIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  statIconAttack: {
    backgroundColor: "rgba(255,82,82,0.18)",
  },
  statIconUtility: {
    backgroundColor: "rgba(107,152,114,0.22)",
  },
  statPillCap: {
    fontFamily: Font.bold,
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: "rgba(184,212,191,0.65)",
  },
  statPillVal: {
    fontFamily: Font.bold,
    fontSize: 14,
    color: "#FFFFFF",
    marginTop: 2,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 20,
    gap: 12,
  },
  cardShell: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
    backgroundColor: "rgba(15,26,18,0.55)",
  },
  cardShellAttack: {
    borderColor: "rgba(255,82,82,0.38)",
  },
  cardShellUtility: {
    borderColor: "rgba(107,152,114,0.45)",
  },
  cardShellSelected: {
    borderColor: "rgba(212,175,55,0.55)",
    backgroundColor: "rgba(30,62,46,0.45)",
  },
  cardShellPressed: {
    opacity: 0.96,
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
  },
  cardIconBg: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  cardIconBgAttack: {
    backgroundColor: "rgba(255,82,82,0.2)",
  },
  cardIconBgUtility: {
    backgroundColor: "rgba(107,152,114,0.22)",
  },
  cardIconBgSelected: {
    backgroundColor: "rgba(212,175,55,0.2)",
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
    flexWrap: "wrap",
  },
  cardTitle: {
    fontFamily: Font.bold,
    fontSize: 16,
    color: "#FFFFFF",
    flexShrink: 1,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  typeBadgeAttack: {
    backgroundColor: "rgba(255,82,82,0.2)",
  },
  typeBadgeUtility: {
    backgroundColor: "rgba(107,152,114,0.22)",
  },
  typeBadgeText: {
    fontFamily: Font.bold,
    fontSize: 10,
    letterSpacing: 0.6,
  },
  typeBadgeTextAttack: {
    color: GolfColors.danger,
  },
  typeBadgeTextUtility: {
    color: GolfColors.sage,
  },
  cardDesc: {
    fontFamily: Font.regular,
    fontSize: 14,
    lineHeight: 19,
    color: "rgba(184,212,191,0.85)",
  },
  starRow: {
    flexDirection: "row",
    gap: 3,
    marginTop: 8,
  },
  cardExpand: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  playBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
  },
  playBtnAttack: {
    backgroundColor: GolfColors.danger,
  },
  playBtnUtility: {
    backgroundColor: GolfColors.sage,
  },
  playBtnText: {
    fontFamily: Font.bold,
    fontSize: 14,
    color: GolfColors.forestDeep,
  },
  playBtnTextLight: {
    color: "#FFFFFF",
  },
  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontFamily: Font.bold,
    fontSize: 18,
    color: "#FFFFFF",
    marginBottom: 8,
  },
  emptySub: {
    fontFamily: Font.regular,
    fontSize: 15,
    color: "rgba(184,212,191,0.8)",
    textAlign: "center",
  },
  emptyCards: {
    alignItems: "center",
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  emptyIconTile: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: "rgba(107,152,114,0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyCardsTitle: {
    fontFamily: Font.medium,
    fontSize: 16,
    color: "rgba(184,212,191,0.9)",
  },
  emptyCardsSub: {
    fontFamily: Font.regular,
    fontSize: 14,
    color: "rgba(184,212,191,0.65)",
    marginTop: 6,
    textAlign: "center",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(10,20,10,0.82)",
    justifyContent: "flex-end",
    padding: 20,
  },
  attackFeedbackBackdrop: {
    flex: 1,
    backgroundColor: "rgba(10,20,10,0.82)",
    justifyContent: "center",
    padding: 24,
  },
  modalSheet: {
    backgroundColor: "rgba(20,38,26,0.98)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(42,80,48,0.65)",
    padding: 20,
    maxWidth: 400,
    width: "100%",
    alignSelf: "center",
  },
  attackSheetCelebrate: {
    borderColor: "rgba(212,175,55,0.45)",
    backgroundColor: "rgba(212,175,55,0.08)",
  },
  attackSheetOops: {
    borderColor: "rgba(255,138,128,0.35)",
    backgroundColor: "rgba(255,82,82,0.06)",
  },
  attackResultTitle: {
    fontFamily: Font.bold,
    fontSize: 22,
    color: "#FFFFFF",
    marginBottom: 10,
    marginTop: 8,
  },
  attackResultBody: {
    fontFamily: Font.regular,
    fontSize: 16,
    lineHeight: 22,
    color: "rgba(255,255,255,0.88)",
    marginBottom: 18,
  },
  attackResultDone: {
    alignSelf: "stretch",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: GolfColors.gold,
  },
  attackResultDoneText: {
    fontFamily: Font.bold,
    fontSize: 15,
    color: GolfColors.forestDeep,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  modalKicker: {
    fontFamily: Font.semiBold,
    fontSize: 11,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: "rgba(184,212,191,0.65)",
  },
  modalTitle: {
    fontFamily: Font.bold,
    fontSize: 18,
    color: "#FFFFFF",
    marginTop: 4,
  },
  modalClose: {
    padding: 4,
  },
  modalHint: {
    fontFamily: Font.regular,
    fontSize: 14,
    color: "rgba(184,212,191,0.85)",
    marginBottom: 12,
  },
  modalEmpty: {
    fontFamily: Font.regular,
    fontSize: 14,
    color: "rgba(184,212,191,0.65)",
    paddingVertical: 12,
  },
  targetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: "rgba(107,152,114,0.1)",
    borderWidth: 1,
    borderColor: "rgba(42,80,48,0.45)",
    marginBottom: 8,
  },
  targetAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,82,82,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  targetAvatarText: {
    fontFamily: Font.bold,
    fontSize: 16,
    color: GolfColors.danger,
  },
  targetName: {
    fontFamily: Font.semiBold,
    fontSize: 16,
    color: "#FFFFFF",
  },
  bottomNav: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-around",
    paddingTop: 8,
    backgroundColor: "rgba(26,42,26,0.94)",
    borderTopWidth: 1,
    borderTopColor: "rgba(42,80,48,0.45)",
    zIndex: 30,
  },
  navItem: {
    alignItems: "center",
    justifyContent: "center",
    minWidth: 52,
    paddingBottom: 4,
    gap: 4,
  },
  navLabel: {
    fontFamily: Font.medium,
    fontSize: 11,
    color: GolfColors.sage,
  },
  navLabelActive: {
    color: GolfColors.gold,
  },
  fabSlot: {
    alignItems: "center",
    marginTop: -FAB_FLOAT,
    width: 76,
    zIndex: 40,
  },
  fabOuter: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    transform: [{ translateY: -6 }],
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.55,
    shadowRadius: 22,
    elevation: 18,
  },
  fabOuterScored: {
    borderColor: "rgba(212,175,55,0.55)",
    backgroundColor: GolfColors.gold,
  },
  fabOuterPending: {
    borderColor: "rgba(58,90,58,0.55)",
    backgroundColor: "rgba(42,72,48,0.96)",
    shadowOpacity: 0.4,
  },
  fabOuterPressed: {
    transform: [{ translateY: -2 }],
    shadowOpacity: 0.35,
    elevation: 10,
  },
  fabDigit: {
    fontFamily: Font.black,
    fontSize: 22,
    fontWeight: "normal",
    color: GolfColors.forestDeep,
  },
  fabDigitPlaceholder: {
    color: `${GolfColors.sage}AA`,
    fontSize: 20,
  },
  fabCaption: {
    fontFamily: Font.medium,
    fontSize: 10,
    marginTop: 4,
  },
  fabCaptionEntered: {
    color: GolfColors.gold,
  },
  fabCaptionPrompt: {
    color: GolfColors.sage,
  },
});
