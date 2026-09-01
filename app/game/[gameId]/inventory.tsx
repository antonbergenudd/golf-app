import {
  useNavigation,
  useLocalSearchParams,
  useGlobalSearchParams,
  usePathname,
  useSegments,
} from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

import { gameActionError } from "@/utils/gameActionError";
import { GameSessionSubscreenHeader } from "@/components/fairway/GameSessionSubscreenHeader";
import { HoleScoreModal } from "@/components/fairway/HoleScoreModal";
import {
  useRegisterGameTabFab,
  type GameFabRegistration,
} from "@/context/GameShellContext";
import {
  isAttackActionCard,
  isChallengeCardType,
  isInventoryActionCard,
} from "@/models/card";
import type { Lobby, LobbyPlayer } from "@/models/lobby";
import { databaseService } from "@/services/databaseService";
import { Font } from "@/theme/fonts";
import { blurActiveElementForModalWeb as blurBeforeModalWeb } from "@/utils/blurForModalWeb";
import { paramFirst, resolveSessionGameId } from "@/utils/resolveSessionGameId";
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
  const local = useLocalSearchParams() as Record<string, unknown>;
  const global = useGlobalSearchParams() as Record<string, unknown>;
  const pathname = usePathname();
  const segments = useSegments();

  const sessionRef = useRef({
    gameId: "",
    playerId: "",
    lobbyId: "",
    playerName: "",
  });

  const resolvedGameId = resolveSessionGameId({
    local,
    global,
    pathname,
    segments,
  });
  const resolvedPlayerId =
    paramFirst(local.playerId) || paramFirst(global.playerId);
  const resolvedLobbyId =
    paramFirst(local.lobbyId) || paramFirst(global.lobbyId);
  const resolvedPlayerName =
    paramFirst(local.playerName) || paramFirst(global.playerName);

  if (resolvedGameId) sessionRef.current.gameId = resolvedGameId;
  if (resolvedPlayerId) sessionRef.current.playerId = resolvedPlayerId;
  if (resolvedLobbyId) sessionRef.current.lobbyId = resolvedLobbyId;
  if (resolvedPlayerName) sessionRef.current.playerName = resolvedPlayerName;

  const gameId = resolvedGameId || sessionRef.current.gameId;
  const playerId = resolvedPlayerId || sessionRef.current.playerId;
  const lobbyId = resolvedLobbyId || sessionRef.current.lobbyId;
  const playerName =
    (resolvedPlayerName || sessionRef.current.playerName || "Player").trim() ||
    "Player";

  const navigation = useNavigation();

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

  const [trialCombatStep, setTrialCombatStep] = useState<null | {
    action: Record<string, unknown>;
    deputy?: LobbyPlayer;
  }>(null);

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
        Alert.alert("Inventory", gameActionError(e));
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
        Alert.alert("Inventory", gameActionError(e));
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
      Alert.alert("Trial by combat", gameActionError(e));
    } finally {
      setBusy(false);
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
    navigation.navigate("index" as never);
  }

  function openScorecard() {
    navigation.navigate("scorecard" as never);
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

  useRegisterGameTabFab("inventory", fabRegistration);

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

  const isEmptyScroll = !gameId || inventoryCards.length === 0;

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <GameSessionSubscreenHeader
          onBack={openGame}
          centerIcon="layers"
          title="Inventory"
        />

        <View style={styles.statsSection}>
          <View>
            <Text style={styles.statsKicker}>Your cards</Text>
            <Text style={styles.statsBig}>
              {gameId ? inventoryCards.length : 0}{" "}
              <Text style={styles.statsBigMuted}>available</Text>
            </Text>
          </View>
          <View style={styles.statsPills}>
            <View style={styles.statPill}>
              <View style={[styles.statIconWrap, styles.statIconAttack]}>
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
              <View style={[styles.statIconWrap, styles.statIconUtility]}>
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
            isEmptyScroll && styles.scrollContentEmptyFill,
            { paddingBottom: bottomPad },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {!gameId ? (
            <View style={styles.emptyCards}>
              <View style={styles.emptyIconTile}>
                <MaterialIcons
                  name="layers"
                  size={36}
                  color="rgba(184,212,191,0.45)"
                />
              </View>
              <Text style={styles.emptyCardsTitle}>No active game</Text>
              <Text style={styles.emptyCardsSub}>
                Open inventory from a round in progress.
              </Text>
            </View>
          ) : inventoryCards.length === 0 ? (
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
                  onPress={() => setSelectedId(selected ? null : id)}
                  style={({ pressed }) => [pressed && styles.cardShellPressed]}
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
                              name={i < stars ? "star" : "star-border"}
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
                          disabled={Boolean(busy)}
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
                    {targetModal ? String(targetModal.title ?? "Action") : ""}
                  </Text>
                </View>
                <Pressable
                  onPress={() => setTargetModal(null)}
                  hitSlop={10}
                  style={styles.modalClose}
                >
                  <MaterialIcons
                    name="close"
                    size={22}
                    color={GolfColors.mist}
                  />
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
                    disabled={Boolean(busy)}
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
                attackFeedback?.tone === "celebrate" &&
                  styles.attackSheetCelebrate,
                attackFeedback?.tone === "oops" && styles.attackSheetOops,
              ]}
              onPress={(e) => e.stopPropagation()}
            >
              <Text style={styles.modalKicker}>Attack result</Text>
              <Text style={styles.attackResultTitle}>
                {attackFeedback?.title ?? ""}
              </Text>
              <Text style={styles.attackResultBody}>
                {attackFeedback?.body ?? ""}
              </Text>
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
          visible={
            trialCombatStep !== null && trialCombatStep.deputy === undefined
          }
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
                  <MaterialIcons
                    name="close"
                    size={22}
                    color={GolfColors.mist}
                  />
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
                    setTrialCombatStep({
                      action: trialCombatStep.action,
                      deputy: pl,
                    });
                  }}
                  disabled={typeof busy === "string" || busy === true}
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
            setTrialCombatStep((s) => (s ? { action: s.action } : null))
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
                    setTrialCombatStep((s) => (s ? { action: s.action } : null))
                  }
                  hitSlop={10}
                  style={styles.modalClose}
                >
                  <MaterialIcons
                    name="close"
                    size={22}
                    color={GolfColors.mist}
                  />
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
                    disabled={typeof busy === "string" || busy === true}
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
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
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
    paddingTop: 4,
    gap: 12,
  },
  scrollContentEmptyFill: {
    flexGrow: 1,
    justifyContent: "center",
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
  emptyCards: {
    alignItems: "center",
    paddingVertical: 36,
    paddingHorizontal: 12,
    gap: 10,
  },
  emptyIconTile: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: "rgba(107,152,114,0.12)",
    alignItems: "center",
    justifyContent: "center",
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
});
