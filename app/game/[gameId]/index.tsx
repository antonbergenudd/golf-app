import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { LinearGradient } from "expo-linear-gradient";
import {
  router,
  useGlobalSearchParams,
  useLocalSearchParams,
  usePathname,
} from "expo-router";
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useFocusEffect } from "@react-navigation/native";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { HoleScoreModal } from "@/components/fairway/HoleScoreModal";
import {
  useRegisterGameTabFab,
  type GameFabRegistration,
} from "@/context/GameShellContext";
import { useGameData } from "@/hooks/useGameData";
import { isAttackActionCard, isChallengeCardType } from "@/models/card";
import { gameCurrencyLabel } from "@/models/gameMode";
import { DatabaseService, databaseService } from "@/services/databaseService";
import { Font } from "@/theme/fonts";
import * as GameBlur from "@/utils/blurForModalWeb";
import {
  clearChallengeWheelLocalState,
  getChallengeWheelClub,
  hasChallengeWheelSpinDone,
} from "@/utils/challengeWheelStorage";
import {
  buildLiveEventCopy,
  formatShortRelativeTime,
  liveEventIconVariant,
} from "@/utils/liveFeedFormatting";

function challengeNeedsWheelSpin(card: Record<string, unknown>): boolean {
  const v = card.requiresWheelSpin;
  return v === true || v === "true";
}

const GolfColors = {
  gold: "#D4AF37",
  sage: "#6B9872",
  mist: "#B8D4BF",
  forest: "#142918",
  forestDeep: "#071209",
  border: "#2A5030",
  danger: "#FF5252",
};

const NAV_ROW_HEIGHT = 52;
const FAB_FLOAT = 28;
/** Horizontal inset for expanded Live panel (matches `liveWrap` padding; floats via shadow, not full-bleed) */
const LIVE_PANEL_SIDE_INSET = 20;

/** Collapsed Live strip: number of feed rows to show (most recent first). */
const LIVE_STRIP_VISIBLE_EVENTS = 4;
/** Fallback row height (px) before the first compact row `onLayout` runs — tuned close to `liveRow` + `liveRowCompact`. */
const FALLBACK_COLLAPSED_LIVE_ROW_HEIGHT = 53;
/** Fixed collapsed Live list height (4 rows × row height); inner `ScrollView` scrolls. */
const COLLAPSED_LIVE_FEED_BODY_HEIGHT_PX =
  FALLBACK_COLLAPSED_LIVE_ROW_HEIGHT * LIVE_STRIP_VISIBLE_EVENTS;

const BALANCE_FLASH_GAIN = "rgba(34, 197, 94, 0.38)";
const BALANCE_FLASH_LOSS = "rgba(248, 113, 113, 0.34)";

function starCountFromPoints(points: unknown): number {
  const n = Number(points);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.min(3, Math.max(1, Math.ceil(n)));
}

function isActionMarketOffer(a: Record<string, unknown>): boolean {
  if (a.type !== "action") return false;
  if (a.banked === true) return false;
  if (a.pendingBank === true) return false;
  if (a.offerConsumed === true) return false;
  if (a.inventoryUsed === true) return false;
  return true;
}

/** Market grid: this hole's row — unsold offers plus the same tiles after purchase (still visible as “Bought”). */
function isActionMarketRowCard(
  a: Record<string, unknown>,
  currentHole: number,
): boolean {
  if (a.type !== "action") return false;
  if (a.inventoryUsed === true) return false;
  if (Number(a.hole ?? 0) !== currentHole) return false;
  if (isActionMarketOffer(a)) return true;
  return (
    a.offerConsumed === true || a.banked === true || a.pendingBank === true
  );
}

function isActionBought(a: Record<string, unknown>): boolean {
  return (
    a.banked === true || a.pendingBank === true || a.offerConsumed === true
  );
}

/** Stable key for matching a hole's market offer row (buy optimistic UI). */
function marketOfferPurchaseKey(
  card: Record<string, unknown>,
  hole: number,
): string {
  return `${String(card.id ?? "")}|${Number(card.hole ?? hole)}`;
}

/** True once the action has been played from the bag (not merely purchased). */
function isActionCardPlayed(a: Record<string, unknown>): boolean {
  if (a.type !== "action") return false;
  return a.inventoryUsed === true;
}

/** First index of the bottom row in a left-to-right, `columns`-wide wrap grid. */
function gridLastRowStartIndex(itemCount: number, columns: number): number {
  if (itemCount <= 0) return 0;
  const rowCount = Math.ceil(itemCount / columns);
  return (rowCount - 1) * columns;
}

/** Expo Router can return `string | string[]`; tab screens may lose parent params in `useLocalSearchParams` while unfocused. */
function paramFirst(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) return String(v[0] ?? "");
  return String(v);
}

export default function GameScreen() {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const local = useLocalSearchParams();
  const global = useGlobalSearchParams();
  const pathname = usePathname();
  const pathGameId = pathname.match(/\/game\/([^/]+)/)?.[1] ?? "";

  const sessionRef = useRef({
    gameId: "",
    playerId: "",
    lobbyId: "",
    playerName: "",
    lobbyName: "",
  });

  const resolvedGameId =
    paramFirst(local.gameId) || paramFirst(global.gameId) || pathGameId;
  const resolvedPlayerId =
    paramFirst(local.playerId) || paramFirst(global.playerId);
  const resolvedLobbyId =
    paramFirst(local.lobbyId) || paramFirst(global.lobbyId);
  const resolvedPlayerName =
    paramFirst(local.playerName) || paramFirst(global.playerName);
  const resolvedLobbyName =
    paramFirst(local.lobbyName) || paramFirst(global.lobbyName);

  if (resolvedGameId) sessionRef.current.gameId = resolvedGameId;
  if (resolvedPlayerId) sessionRef.current.playerId = resolvedPlayerId;
  if (resolvedLobbyId) sessionRef.current.lobbyId = resolvedLobbyId;
  if (resolvedPlayerName) sessionRef.current.playerName = resolvedPlayerName;
  if (resolvedLobbyName) sessionRef.current.lobbyName = resolvedLobbyName;

  const gameId = resolvedGameId || sessionRef.current.gameId;
  const playerId = resolvedPlayerId || sessionRef.current.playerId;
  const lobbyId = resolvedLobbyId || sessionRef.current.lobbyId;
  const playerName =
    (resolvedPlayerName || sessionRef.current.playerName || "Player").trim() ||
    "Player";
  const lobbyName = resolvedLobbyName || sessionRef.current.lobbyName;

  const { game, events, myCardsDoc, scoreRows, setScoreRows, lobbySnap } =
    useGameData({ gameId, playerId, lobbyId });
  const [busy, setBusy] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"challenges" | "market">(
    "challenges",
  );
  const [tabBarWidth, setTabBarWidth] = useState(0);
  const [feedExpanded, setFeedExpanded] = useState(false);
  const liveBackdropOp = useRef(new Animated.Value(0)).current;
  const livePanelHeight = useRef(new Animated.Value(258)).current;
  const livePanelBottom = useRef(new Animated.Value(100)).current;
  const liveStripHeightRef = useRef(258);
  const liveExpandedMaxHRef = useRef(240);
  const liveStripScrollRef = useRef<ScrollView>(null);
  const liveOverlayScrollRef = useRef<ScrollView>(null);
  const [, bumpLiveClock] = useReducer((x: number) => x + 1, 0);
  const [liveStripAtLatest, setLiveStripAtLatest] = useState(true);
  const [liveOverlayAtLatest, setLiveOverlayAtLatest] = useState(true);

  useEffect(() => {
    const id = setInterval(() => bumpLiveClock(), 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    liveStripScrollRef.current?.scrollTo({ y: 0, animated: false });
    setLiveStripAtLatest(true);
  }, [gameId]);

  const scrollLiveStripToLatest = useCallback(() => {
    liveStripScrollRef.current?.scrollTo({ y: 0, animated: true });
    setLiveStripAtLatest(true);
  }, []);

  const onLiveStripScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      setLiveStripAtLatest(y < 8);
    },
    [],
  );

  const scrollLiveOverlayToLatest = useCallback(() => {
    liveOverlayScrollRef.current?.scrollTo({ y: 0, animated: true });
    setLiveOverlayAtLatest(true);
  }, []);

  const onLiveOverlayScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      setLiveOverlayAtLatest(y < 8);
    },
    [],
  );

  const [cardInspect, setCardInspect] = useState<null | {
    variant: "challenge" | "market";
    card: Record<string, unknown>;
  }>(null);

  const openCardInspect = useCallback(
    (payload: {
      variant: "challenge" | "market";
      card: Record<string, unknown>;
    }) => {
      GameBlur.blurActiveElementForModalWeb();
      setCardInspect(payload);
    },
    [],
  );

  const [scoreModalOpen, setScoreModalOpen] = useState(false);
  const [draftStrokes, setDraftStrokes] = useState(4);
  const [scoreBusy, setScoreBusy] = useState(false);
  /** Keys `${cardId}|${hole}` — instant “Bought” while `bankHoleOfferAction` round-trips. */
  const [optimisticMarketPurchases, setOptimisticMarketPurchases] = useState<
    Record<string, true>
  >({});
  /** Same key shape — instant “Pending” while `requestChallengeVerification` round-trips. */
  const [optimisticChallengeStarts, setOptimisticChallengeStarts] = useState<
    Record<string, true>
  >({});

  useEffect(() => {
    if (!feedExpanded) return;
    liveOverlayScrollRef.current?.scrollTo({ y: 0, animated: false });
    setLiveOverlayAtLatest(true);
  }, [feedExpanded]);

  const cards = (myCardsDoc?.cards as Record<string, unknown>[]) ?? [];
  const challenges = cards.filter((c) => isChallengeCardType(String(c.type)));
  const actions = cards.filter((c) => c.type === "action");
  const currentHole = game?.currentHole ?? 1;
  const marketOffers = actions.filter((a) =>
    isActionMarketRowCard(a, currentHole),
  );

  const marketOffersUi = useMemo(() => {
    return marketOffers.map((c) => {
      const k = marketOfferPurchaseKey(c, currentHole);
      if (optimisticMarketPurchases[k]) {
        return { ...c, pendingBank: true, offerConsumed: true };
      }
      return c;
    });
  }, [marketOffers, currentHole, optimisticMarketPurchases]);

  const challengesUi = useMemo(() => {
    return challenges.map((c) => {
      const k = marketOfferPurchaseKey(c, currentHole);
      if (optimisticChallengeStarts[k]) {
        return { ...c, verificationPending: true };
      }
      return c;
    });
  }, [challenges, currentHole, optimisticChallengeStarts]);

  useEffect(() => {
    setOptimisticMarketPurchases({});
  }, [currentHole]);

  useEffect(() => {
    setOptimisticMarketPurchases({});
  }, [gameId]);

  useEffect(() => {
    setOptimisticChallengeStarts({});
  }, [gameId]);

  useEffect(() => {
    const raw = myCardsDoc?.cards as Record<string, unknown>[] | undefined;
    if (!raw?.length) return;
    setOptimisticMarketPurchases((prev) => {
      const keys = Object.keys(prev);
      if (keys.length === 0) return prev;
      const next = { ...prev };
      let changed = false;
      for (const key of keys) {
        const pipe = key.indexOf("|");
        if (pipe < 0) continue;
        const cardId = key.slice(0, pipe);
        const hole = Number(key.slice(pipe + 1));
        if (!cardId || !Number.isFinite(hole)) continue;
        const match = raw.find(
          (c) =>
            String(c.id ?? "") === cardId &&
            Number(c.hole ?? 0) === hole &&
            isActionBought(c),
        );
        if (match) {
          delete next[key];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [myCardsDoc]);

  useEffect(() => {
    const raw = myCardsDoc?.cards as Record<string, unknown>[] | undefined;
    if (!raw?.length) return;
    setOptimisticChallengeStarts((prev) => {
      const keys = Object.keys(prev);
      if (keys.length === 0) return prev;
      const next = { ...prev };
      let changed = false;
      for (const key of keys) {
        const pipe = key.indexOf("|");
        if (pipe < 0) continue;
        const cardId = key.slice(0, pipe);
        const hole = Number(key.slice(pipe + 1));
        if (!cardId || !Number.isFinite(hole)) continue;
        const match = raw.find(
          (c) =>
            isChallengeCardType(String(c.type)) &&
            String(c.id ?? "") === cardId &&
            Number(c.hole ?? 0) === hole &&
            c.verificationPending === true,
        );
        if (match) {
          delete next[key];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [myCardsDoc]);

  const myPoints = game?.playerPoints[playerId] ?? 0;
  const isHost = lobbySnap?.hostId === playerId;

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
  }, [game?.currentHole]);

  const challengeRerollsLeft = Math.max(
    0,
    DatabaseService.rerollHandMaxUses -
      Number(myCardsDoc?.challenge_rerolls_used ?? 0),
  );
  const actionRerollsLeft = Math.max(
    0,
    DatabaseService.rerollHandMaxUses -
      Number(myCardsDoc?.action_rerolls_used ?? 0),
  );

  const claimedChallengeCount = useMemo(
    () => challenges.filter((c) => c.claimed === true).length,
    [challenges],
  );

  useEffect(() => {
    if (!gameId) return;
    for (const c of challenges) {
      if (!challengeNeedsWheelSpin(c)) continue;
      if (c.claimed !== true) continue;
      const id = String(c.id ?? "");
      if (!id) continue;
      void clearChallengeWheelLocalState(gameId, id);
    }
  }, [gameId, challenges]);

  const playedActionCount = useMemo(
    () => actions.filter(isActionCardPlayed).length,
    [actions],
  );

  const animatedBalance = useRef(new Animated.Value(0)).current;
  const balanceFlashOpacity = useRef(new Animated.Value(0)).current;
  const displayBalanceRef = useRef(0);
  const processedBalanceTargetRef = useRef<number | null>(null);
  const [displayBalance, setDisplayBalance] = useState(0);
  const [balanceFlashKind, setBalanceFlashKind] = useState<
    "gain" | "loss" | null
  >(null);

  useEffect(() => {
    processedBalanceTargetRef.current = null;
  }, [gameId, playerId]);

  useEffect(() => {
    const id = animatedBalance.addListener(({ value }) => {
      const rounded = Math.round(value);
      displayBalanceRef.current = rounded;
      setDisplayBalance(rounded);
    });
    return () => {
      animatedBalance.removeListener(id);
    };
  }, [animatedBalance]);

  useEffect(() => {
    if (!game) return;

    const target = Math.round(game.playerPoints[playerId] ?? 0);

    if (processedBalanceTargetRef.current === null) {
      processedBalanceTargetRef.current = target;
      animatedBalance.setValue(target);
      displayBalanceRef.current = target;
      setDisplayBalance(target);
      return;
    }

    if (processedBalanceTargetRef.current === target) return;

    processedBalanceTargetRef.current = target;

    balanceFlashOpacity.stopAnimation();
    animatedBalance.stopAnimation();

    const from = displayBalanceRef.current;
    const gained = target > from;
    setBalanceFlashKind(gained ? "gain" : "loss");
    balanceFlashOpacity.setValue(0);

    Animated.sequence([
      Animated.timing(balanceFlashOpacity, {
        toValue: gained ? 0.28 : 0.25,
        duration: 130,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.delay(300),
      Animated.timing(balanceFlashOpacity, {
        toValue: 0,
        duration: 560,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) setBalanceFlashKind(null);
    });

    animatedBalance.setValue(from);
    Animated.timing(animatedBalance, {
      toValue: target,
      duration: Math.min(1200, 260 + Math.abs(target - from) * 52),
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [game, playerId, myPoints]);

  const bottomOverlayHeight =
    NAV_ROW_HEIGHT + FAB_FLOAT + Math.max(insets.bottom, 10) + 24;

  function openLiveOverlay() {
    GameBlur.blurActiveElementForModalWeb();
    const maxH = Math.max(
      240,
      windowHeight - bottomOverlayHeight - Math.max(insets.top, 10) - 14,
    );
    const h0 = liveStripHeightRef.current;
    const B = bottomOverlayHeight;
    const bottomStart = B + (maxH - h0) / 2;

    liveExpandedMaxHRef.current = maxH;
    livePanelHeight.setValue(h0);
    livePanelBottom.setValue(bottomStart);
    liveBackdropOp.setValue(0);
    setFeedExpanded(true);
    requestAnimationFrame(() => {
      Animated.parallel([
        Animated.timing(liveBackdropOp, {
          toValue: 1,
          duration: 260,
          easing: Easing.out(Easing.quad),
          useNativeDriver: false,
        }),
        Animated.timing(livePanelHeight, {
          toValue: maxH,
          duration: 420,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
        Animated.timing(livePanelBottom, {
          toValue: B,
          duration: 420,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
      ]).start();
    });
  }

  function closeLiveOverlay() {
    const h1 = liveStripHeightRef.current;
    const H = liveExpandedMaxHRef.current;
    const B = bottomOverlayHeight;
    const bottomEnd = B + (H - h1) / 2;

    Animated.parallel([
      Animated.timing(liveBackdropOp, {
        toValue: 0,
        duration: 200,
        easing: Easing.in(Easing.quad),
        useNativeDriver: false,
      }),
      Animated.timing(livePanelHeight, {
        toValue: h1,
        duration: 320,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(livePanelBottom, {
        toValue: bottomEnd,
        duration: 320,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: false,
      }),
    ]).start(({ finished }) => {
      if (finished) setFeedExpanded(false);
    });
  }

  async function nextHole() {
    if (!game?.playerIds.length) return;
    setBusy("hole");
    try {
      await databaseService.nextHole(gameId, game.playerIds);
    } catch (e) {
      GameBlur.alertWeb("Hole", String(e));
    } finally {
      setBusy(null);
    }
  }

  async function startChallenge(card: Record<string, unknown>) {
    const id = String(card.id ?? "");
    const hole = Number(card.hole ?? game?.currentHole ?? 1);
    if (card.claimed === true || card.verificationPending === true) return;
    if (challengeNeedsWheelSpin(card)) {
      const spun = await hasChallengeWheelSpinDone(gameId, id);
      if (!spun) {
        router.push({
          pathname: "/wheel",
          params: {
            playerName,
            autoSpin: "1",
            gameId,
            cardId: id,
          },
        });
        return;
      }
    }
    const startKey = marketOfferPurchaseKey(card, hole);
    setOptimisticChallengeStarts((prev) =>
      prev[startKey] ? prev : { ...prev, [startKey]: true },
    );
    try {
      await databaseService.requestChallengeVerification({
        gameId,
        claimantId: playerId,
        claimantName: playerName,
        cardId: id,
        cardHole: hole,
        pointsToAward: Number(card.points ?? 0),
        cardSummary: card,
      });
    } catch (e) {
      setOptimisticChallengeStarts((prev) => {
        if (!prev[startKey]) return prev;
        const next = { ...prev };
        delete next[startKey];
        return next;
      });
      GameBlur.alertWeb("Challenge", String(e));
    }
  }

  async function buyAction(card: Record<string, unknown>) {
    const id = String(card.id ?? "");
    const hole = Number(card.hole ?? game?.currentHole ?? 1);
    const key = marketOfferPurchaseKey(card, hole);

    setOptimisticMarketPurchases((prev) =>
      prev[key] ? prev : { ...prev, [key]: true },
    );
    setBusy(`buy_${id}`);
    try {
      await databaseService.bankHoleOfferAction({
        gameId,
        playerId,
        cardId: id,
        cardHole: hole,
      });
    } catch (e) {
      setOptimisticMarketPurchases((prev) => {
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
      GameBlur.alertWeb("Buy", String(e));
    } finally {
      setBusy(null);
    }
  }

  async function rerollPressed() {
    setBusy("reroll");
    try {
      if (activeTab === "challenges") {
        await databaseService.rerollPlayerChallenges(gameId, playerId);
      } else {
        await databaseService.rerollPlayerActions(gameId, playerId);
      }
    } catch (e) {
      GameBlur.alertWeb("Reroll", String(e));
    } finally {
      setBusy(null);
    }
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

  const openScoreModal = useCallback(() => {
    GameBlur.blurActiveElementForModalWeb();
    setDraftStrokes(
      hasHoleScore && savedStrokesForHole != null ? savedStrokesForHole : 4,
    );
    setScoreModalOpen(true);
  }, [hasHoleScore, savedStrokesForHole]);

  async function submitHoleScore() {
    if (!gameId || !playerId || !game) return;
    const strokesSaved = Math.min(30, Math.max(1, Math.floor(draftStrokes)));
    setScoreBusy(true);
    try {
      await databaseService.saveHoleScore({
        gameId,
        playerId,
        playerName,
        hole: game.currentHole,
        strokes: draftStrokes,
      });
      setScoreRows((prev) => {
        const hole = game!.currentHole;
        const rest = prev.filter(
          (r) => String(r.player_id) !== playerId || Number(r.hole) !== hole,
        );
        const prior = prev.find(
          (r) => String(r.player_id) === playerId && Number(r.hole) === hole,
        );
        return [
          ...rest,
          {
            ...prior,
            id: prior?.id,
            player_id: playerId,
            player_name: playerName,
            hole,
            strokes: strokesSaved,
            game_id: gameId,
          },
        ];
      });
      setScoreModalOpen(false);
    } catch (e) {
      GameBlur.alertWeb("Could not save score", String(e));
    } finally {
      setScoreBusy(false);
    }
  }

  const fabRegistration: GameFabRegistration = useMemo(() => {
    if (!game) {
      return {
        digit: "—",
        scoredLook: false,
        caption: "Score",
        captionEntered: false,
        onPress: () => {},
        accessibilityLabel: "Loading game",
      };
    }
    return {
      digit: hasHoleScore ? String(savedStrokesForHole!) : "—",
      scoredLook: hasHoleScore,
      caption: "Score",
      captionEntered: hasHoleScore,
      onPress: openScoreModal,
      accessibilityLabel:
        hasHoleScore && savedStrokesForHole != null
          ? `Score ${savedStrokesForHole} strokes, tap to edit`
          : "Enter score for this hole",
    };
  }, [game, hasHoleScore, savedStrokesForHole, openScoreModal]);

  useRegisterGameTabFab("index", fabRegistration);

  const canReroll =
    (activeTab === "challenges" ? challengeRerollsLeft : actionRerollsLeft) >
      0 && busy === null;

  if (!game) {
    return (
      <View style={styles.loadingWrap}>
        <Text style={styles.loadingText}>Loading game…</Text>
      </View>
    );
  }

  const modeLabel = gameCurrencyLabel(game.mode, { short: true });
  const tabSliderW = tabBarWidth > 0 ? (tabBarWidth - 8) / 2 : 0;
  const tabSliderLeft = activeTab === "challenges" ? 4 : 4 + tabSliderW;

  return (
    <>
      <View style={styles.root}>
        <SafeAreaView style={styles.safe} edges={["top"]}>
          <View style={styles.headerSection}>
            <View style={styles.headerBar}>
              <Pressable
                onPress={openEndGame}
                hitSlop={12}
                style={styles.exitPress}
                accessibilityRole="button"
                accessibilityLabel="Exit to end round"
              >
                <Text style={styles.exitLabel}>Exit</Text>
              </Pressable>

              <View style={styles.headerCenter} pointerEvents="none">
                <MaterialIcons name="flag" size={18} color={GolfColors.gold} />
                <Text style={styles.headerHoleText}>
                  Hole {game.currentHole}
                </Text>
              </View>

              {isHost ? (
                <Pressable
                  onPress={nextHole}
                  disabled={busy === "hole"}
                  hitSlop={12}
                  style={[
                    styles.nextPress,
                    busy === "hole" ? styles.nextDisabled : null,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Next hole"
                >
                  <Text style={styles.nextLabel}>Next hole</Text>
                </Pressable>
              ) : (
                <View style={styles.headerTrailingSpacer} />
              )}
            </View>
          </View>

          <View style={styles.heroSection}>
            <LinearGradient
              colors={[
                "rgba(20,41,24,0.96)",
                "rgba(15,26,18,0.92)",
                "rgba(7,18,9,0.88)",
              ]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.heroCard}
            >
              <View style={[styles.heroBlob, styles.heroBlobTR]} />
              <View style={[styles.heroBlob, styles.heroBlobBL]} />

              <Animated.View
                pointerEvents="none"
                style={[
                  StyleSheet.absoluteFillObject,
                  {
                    opacity: balanceFlashOpacity,
                    backgroundColor:
                      balanceFlashKind === "gain"
                        ? BALANCE_FLASH_GAIN
                        : balanceFlashKind === "loss"
                          ? BALANCE_FLASH_LOSS
                          : "transparent",
                  },
                ]}
              />

              <View style={styles.heroInner}>
                <View>
                  <Text style={styles.heroKicker}>Your Balance</Text>
                  <View style={styles.heroPointsRow}>
                    <Text style={styles.heroPoints}>{displayBalance}</Text>
                    <Text style={styles.heroPointsUnit}>{modeLabel}</Text>
                  </View>
                </View>

                <View style={styles.heroMiniStats}>
                  <View style={styles.miniStat}>
                    <View style={[styles.miniStatIcon, styles.miniStatAccent]}>
                      <MaterialIcons
                        name="track-changes"
                        size={22}
                        color={GolfColors.gold}
                      />
                    </View>
                    <Text style={styles.miniStatValue}>
                      {claimedChallengeCount}
                    </Text>
                    <Text style={styles.miniStatCap}>Claimed</Text>
                  </View>
                  <View style={styles.miniStat}>
                    <View style={[styles.miniStatIcon, styles.miniStatPrimary]}>
                      <MaterialIcons
                        name="shopping-bag"
                        size={22}
                        color={GolfColors.mist}
                      />
                    </View>
                    <Text style={styles.miniStatValue}>
                      {playedActionCount}
                    </Text>
                    <Text style={styles.miniStatCap}>Played</Text>
                  </View>
                </View>
              </View>
            </LinearGradient>
          </View>

          {/* Tab strip + reroll — design/game_lobby/app/page.tsx */}
          <View style={styles.tabRow}>
            <View
              style={styles.tabTrack}
              onLayout={(e) => setTabBarWidth(e.nativeEvent.layout.width)}
            >
              {tabBarWidth > 0 && tabSliderW > 0 ? (
                <View
                  style={[
                    styles.tabSlider,
                    { width: tabSliderW, left: tabSliderLeft },
                  ]}
                />
              ) : null}
              <Pressable
                onPress={() => setActiveTab("challenges")}
                style={styles.tabBtn}
              >
                <MaterialIcons
                  name="track-changes"
                  size={16}
                  color={
                    activeTab === "challenges"
                      ? GolfColors.gold
                      : GolfColors.sage
                  }
                />
                <Text
                  style={[
                    styles.tabBtnText,
                    activeTab === "challenges" && styles.tabBtnTextOn,
                  ]}
                >
                  Challenges
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setActiveTab("market")}
                style={styles.tabBtn}
              >
                <MaterialIcons
                  name="shopping-bag"
                  size={16}
                  color={
                    activeTab === "market" ? GolfColors.gold : GolfColors.sage
                  }
                />
                <Text
                  style={[
                    styles.tabBtnText,
                    activeTab === "market" && styles.tabBtnTextOn,
                  ]}
                >
                  Market
                </Text>
              </Pressable>
            </View>

            <Pressable
              onPress={() => void rerollPressed()}
              disabled={!canReroll}
              style={[styles.rerollBtn, !canReroll && styles.rerollBtnOff]}
            >
              {busy === "reroll" ? (
                <View style={styles.rerollBtnBody}>
                  <ActivityIndicator
                    color={GolfColors.forestDeep}
                    size="small"
                  />
                </View>
              ) : (
                <View style={styles.rerollBtnBody}>
                  <MaterialIcons
                    name="refresh"
                    size={18}
                    color={GolfColors.forestDeep}
                  />
                </View>
              )}
            </Pressable>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[
              styles.scrollContent,
              {
                flexGrow: 1,
                justifyContent: "flex-start",
                paddingBottom: bottomOverlayHeight,
              },
            ]}
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
          >
            {activeTab === "challenges" ? (
              challengesUi.length === 0 ? (
                <Text style={styles.emptyLine}>No challenges yet.</Text>
              ) : (
                <View style={[styles.gridRow, { width: windowWidth - 40 }]}>
                  {challengesUi.map((c, i) => (
                    <View
                      key={`${String(c.id)}_${String(c.hole)}_${i}`}
                      style={[
                        styles.gridCell,
                        i >= gridLastRowStartIndex(challengesUi.length, 3)
                          ? styles.gridCellLastRow
                          : null,
                      ]}
                    >
                      <ChallengeTile
                        card={c}
                        gameId={gameId ?? ""}
                        busy={busy}
                        onInspect={() =>
                          openCardInspect({ variant: "challenge", card: c })
                        }
                        onStart={() => void startChallenge(c)}
                      />
                    </View>
                  ))}
                </View>
              )
            ) : marketOffersUi.length === 0 ? (
              <Text style={styles.emptyLine}>No market offers this hole.</Text>
            ) : (
              <View style={[styles.gridRow, { width: windowWidth - 40 }]}>
                {marketOffersUi.map((c, i) => (
                  <View
                    key={`m_${String(c.id)}_${i}`}
                    style={[
                      styles.gridCell,
                      i >= gridLastRowStartIndex(marketOffersUi.length, 3)
                        ? styles.gridCellLastRow
                        : null,
                    ]}
                  >
                    <MarketTile
                      card={c}
                      myPoints={myPoints}
                      busy={busy}
                      onInspect={() =>
                        openCardInspect({ variant: "market", card: c })
                      }
                      onBuy={() => void buyAction(c)}
                    />
                  </View>
                ))}
              </View>
            )}

            {!feedExpanded ? (
              <View style={styles.liveWrap} pointerEvents="box-none">
                <View
                  style={styles.liveCard}
                  onLayout={(e) => {
                    liveStripHeightRef.current = e.nativeEvent.layout.height;
                  }}
                >
                  <View style={styles.liveHeader}>
                    <View style={styles.liveTitleRow}>
                      <MaterialIcons
                        name="podcasts"
                        size={14}
                        color={GolfColors.gold}
                      />
                      <Text style={styles.liveTitle}>Live</Text>
                    </View>
                    <View style={styles.liveHeaderActions}>
                      {!liveStripAtLatest ? (
                        <Pressable
                          hitSlop={8}
                          onPress={scrollLiveStripToLatest}
                          accessibilityRole="button"
                          accessibilityLabel="Jump to latest events"
                        >
                          <Text style={styles.liveNow}>Now</Text>
                        </Pressable>
                      ) : null}
                      <Pressable hitSlop={8} onPress={openLiveOverlay}>
                        <Text style={styles.liveExpand}>History</Text>
                      </Pressable>
                    </View>
                  </View>
                  <View
                    style={[
                      styles.liveFeedBody,
                      { height: COLLAPSED_LIVE_FEED_BODY_HEIGHT_PX },
                    ]}
                  >
                    {events.length === 0 ? (
                      <Text style={styles.liveEmpty}>No events yet.</Text>
                    ) : (
                      <ScrollView
                        ref={liveStripScrollRef}
                        style={styles.liveStripScroll}
                        contentContainerStyle={styles.liveStripScrollContent}
                        nestedScrollEnabled
                        showsVerticalScrollIndicator
                        scrollEventThrottle={16}
                        onScroll={onLiveStripScroll}
                        keyboardShouldPersistTaps="handled"
                      >
                        {events.map((ev) => (
                          <LiveEventRow key={String(ev.id)} ev={ev} compact />
                        ))}
                      </ScrollView>
                    )}
                  </View>
                </View>
              </View>
            ) : null}
          </ScrollView>
        </SafeAreaView>

        <Modal
          visible={feedExpanded}
          transparent
          animationType="none"
          onRequestClose={closeLiveOverlay}
          onShow={GameBlur.blurActiveElementForModalWeb}
        >
          <View style={styles.liveOverlayRoot} pointerEvents="box-none">
            <Animated.View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFill,
                {
                  opacity: liveBackdropOp,
                  backgroundColor: "rgba(0,0,0,0.58)",
                },
              ]}
            />
            <Pressable
              style={[StyleSheet.absoluteFill, { zIndex: 1 }]}
              onPress={closeLiveOverlay}
              accessibilityLabel="Dismiss live feed"
            />
            <Animated.View
              style={[
                styles.liveOverlayPanel,
                {
                  bottom: livePanelBottom,
                  left: LIVE_PANEL_SIDE_INSET,
                  right: LIVE_PANEL_SIDE_INSET,
                  height: livePanelHeight,
                },
              ]}
            >
              <SafeAreaView style={styles.liveOverlaySafe} edges={["bottom"]}>
                <View style={styles.liveOverlayHeader}>
                  <View style={styles.liveTitleRow}>
                    <MaterialIcons
                      name="podcasts"
                      size={18}
                      color={GolfColors.gold}
                    />
                    <Text style={styles.liveOverlayTitle}>Live</Text>
                  </View>
                  <View style={styles.liveHeaderActions}>
                    {!liveOverlayAtLatest ? (
                      <Pressable
                        hitSlop={10}
                        onPress={scrollLiveOverlayToLatest}
                        accessibilityRole="button"
                        accessibilityLabel="Jump to latest events"
                      >
                        <Text style={styles.liveNow}>Now</Text>
                      </Pressable>
                    ) : null}
                    <Pressable hitSlop={10} onPress={closeLiveOverlay}>
                      <Text style={styles.liveExpand}>Collapse</Text>
                    </Pressable>
                  </View>
                </View>
                <ScrollView
                  ref={liveOverlayScrollRef}
                  style={styles.liveOverlayScroll}
                  contentContainerStyle={styles.liveOverlayScrollContent}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator
                  scrollEventThrottle={16}
                  onScroll={onLiveOverlayScroll}
                >
                  {events.length === 0 ? (
                    <Text style={styles.liveEmpty}>No events yet.</Text>
                  ) : (
                    events.map((ev) => (
                      <LiveEventRow key={String(ev.id)} ev={ev} />
                    ))
                  )}
                </ScrollView>
              </SafeAreaView>
            </Animated.View>
          </View>
        </Modal>
      </View>

      <HoleScoreModal
        visible={scoreModalOpen && game != null}
        holeNumber={game?.currentHole ?? 1}
        strokes={draftStrokes}
        onChangeStrokes={setDraftStrokes}
        onClose={() => setScoreModalOpen(false)}
        onSubmit={() => void submitHoleScore()}
        busy={scoreBusy}
      />

      <CardInspectModal
        inspect={cardInspect}
        gameId={gameId ?? ""}
        modeLabel={modeLabel}
        currentHole={game.currentHole}
        myPoints={myPoints}
        busy={busy}
        onClose={() => setCardInspect(null)}
        onStartChallenge={(c) => {
          setCardInspect(null);
          void startChallenge(c);
        }}
        onBuyAction={(c) => {
          setCardInspect(null);
          void buyAction(c);
        }}
      />
    </>
  );
}

function CardInspectModal({
  inspect,
  gameId,
  modeLabel,
  currentHole,
  myPoints,
  busy,
  onClose,
  onStartChallenge,
  onBuyAction,
}: {
  inspect: null | {
    variant: "challenge" | "market";
    card: Record<string, unknown>;
  };
  gameId: string;
  modeLabel: string;
  currentHole: number;
  myPoints: number;
  busy: string | null;
  onClose: () => void;
  onStartChallenge: (c: Record<string, unknown>) => void;
  onBuyAction: (c: Record<string, unknown>) => void;
}) {
  const open = inspect !== null;
  const card = inspect?.card ?? null;
  const variant = inspect?.variant ?? null;

  const [wheelClubLabel, setWheelClubLabel] = useState<string | null>(null);

  useEffect(() => {
    if (
      !open ||
      !card ||
      !gameId ||
      !challengeNeedsWheelSpin(card) ||
      card.claimed === true
    ) {
      setWheelClubLabel(null);
      return;
    }
    const cid = String(card.id ?? "");
    let cancelled = false;
    void getChallengeWheelClub(gameId, cid).then((v) => {
      if (!cancelled) setWheelClubLabel(v);
    });
    return () => {
      cancelled = true;
    };
  }, [open, card, gameId]);

  const title = card ? String(card.title ?? "") : "";
  const description = card ? String(card.description ?? "") : "";
  const holeNum = Math.min(
    36,
    Math.max(1, Number(card?.hole ?? currentHole ?? 1)),
  );

  let body: ReactNode = null;

  if (card && variant === "challenge") {
    const claimed = card.claimed === true;
    const pending = card.verificationPending === true;
    const pts = Number(card.points ?? 1);
    const stars = starCountFromPoints(card.points);
    const wheel = challengeNeedsWheelSpin(card);

    body = (
      <>
        <View style={styles.inspectBadgeRow}>
          <View style={styles.inspectBadge}>
            <Text style={styles.inspectBadgeText}>Challenge</Text>
          </View>
          {claimed ? (
            <View style={[styles.inspectBadge, styles.inspectBadgeMuted]}>
              <Text style={styles.inspectBadgeTextMuted}>Completed</Text>
            </View>
          ) : pending ? (
            <View style={[styles.inspectBadge, styles.inspectBadgePending]}>
              <Text style={styles.inspectBadgeTextPending}>Pending</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.inspectHero}>
          <View style={styles.inspectIconCircle}>
            <MaterialIcons
              name="sports-golf"
              size={36}
              color={GolfColors.gold}
            />
          </View>
          <Text style={styles.inspectTitle}>{title}</Text>
        </View>
        <ScrollView
          style={styles.inspectDescScroll}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.inspectDesc}>{description}</Text>
        </ScrollView>
        <View style={styles.inspectMeta}>
          <Text style={styles.inspectMetaLine}>
            <Text style={styles.inspectMetaLabel}>Reward </Text>
            <Text style={styles.inspectMetaValue}>
              +{pts} {modeLabel}
            </Text>
          </Text>
          <Text style={styles.inspectMetaLine}>
            <Text style={styles.inspectMetaLabel}>Hole </Text>
            <Text style={styles.inspectMetaValue}>{holeNum}</Text>
          </Text>
          <Text style={styles.inspectMetaLine}>
            <Text style={styles.inspectMetaLabel}>Difficulty </Text>
            <Text style={styles.inspectMetaValue}>{stars} / 3</Text>
          </Text>
          {wheel && wheelClubLabel && !claimed ? (
            <View style={styles.inspectWheelClubBanner}>
              <MaterialIcons name="casino" size={16} color={GolfColors.gold} />
              <Text style={styles.inspectWheelClubText}>
                Your club:{" "}
                <Text style={styles.inspectWheelClubValue}>
                  {wheelClubLabel}
                </Text>
              </Text>
            </View>
          ) : null}
          {wheel && !wheelClubLabel ? (
            <Text style={styles.inspectMetaHint}>
              Starts with the Wheel of Doom — spin first, then tap Start again
              to send for verification.
            </Text>
          ) : null}
        </View>
        {claimed ? null : pending ? (
          <Text style={styles.inspectFooterHint}>
            Waiting for another player to mark this challenge succeeded or
            failed.
          </Text>
        ) : (
          <Pressable
            onPress={() => onStartChallenge(card)}
            disabled={busy !== null}
            style={[
              styles.inspectPrimaryBtn,
              busy !== null && { opacity: 0.5 },
            ]}
          >
            <Text style={styles.inspectPrimaryBtnText}>Start</Text>
          </Pressable>
        )}
      </>
    );
  } else if (card && variant === "market") {
    const bought = isActionBought(card);
    const cost = Math.min(9999, Math.max(0, Number(card.points ?? 0)));
    const attack = isAttackActionCard(card);
    const stars = starCountFromPoints(card.points);
    const canAfford = myPoints >= cost;

    body = (
      <>
        <View style={styles.inspectBadgeRow}>
          <View style={styles.inspectBadge}>
            <Text style={styles.inspectBadgeText}>Market</Text>
          </View>
          {attack ? (
            <View style={styles.inspectBadge}>
              <Text style={styles.inspectBadgeText}>Attack</Text>
            </View>
          ) : null}
          {bought ? (
            <View style={[styles.inspectBadge, styles.inspectBadgeMuted]}>
              <Text style={styles.inspectBadgeTextMuted}>Purchased</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.inspectHero}>
          <View style={styles.inspectIconCircle}>
            <MaterialIcons
              name={attack ? "bolt" : "eco"}
              size={36}
              color={attack ? GolfColors.danger : GolfColors.mist}
            />
          </View>
          <Text style={styles.inspectTitle}>{title}</Text>
        </View>
        <ScrollView
          style={styles.inspectDescScroll}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.inspectDesc}>{description}</Text>
        </ScrollView>
        <View style={styles.inspectMeta}>
          <Text style={styles.inspectMetaLine}>
            <Text style={styles.inspectMetaLabel}>Cost </Text>
            <Text style={styles.inspectMetaValue}>
              {cost} {modeLabel}
            </Text>
          </Text>
          <Text style={styles.inspectMetaLine}>
            <Text style={styles.inspectMetaLabel}>Hole </Text>
            <Text style={styles.inspectMetaValue}>{holeNum}</Text>
          </Text>
          <Text style={styles.inspectMetaLine}>
            <Text style={styles.inspectMetaLabel}>Your balance </Text>
            <Text style={styles.inspectMetaValue}>
              {myPoints} {modeLabel}
            </Text>
          </Text>
          <Text style={styles.inspectMetaLine}>
            <Text style={styles.inspectMetaLabel}>Tier </Text>
            <Text style={styles.inspectMetaValue}>{stars} / 3</Text>
          </Text>
        </View>
        {bought ? null : canAfford ? (
          <Pressable
            onPress={() => onBuyAction(card)}
            disabled={busy !== null}
            style={[
              styles.inspectPrimaryBtn,
              busy !== null && { opacity: 0.5 },
            ]}
          >
            <Text style={styles.inspectPrimaryBtnText}>Buy</Text>
          </Pressable>
        ) : (
          <Text style={styles.inspectFooterHint}>
            Not enough {modeLabel} to buy this action.
          </Text>
        )}
      </>
    );
  }

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      onShow={GameBlur.blurActiveElementForModalWeb}
    >
      <Pressable style={styles.inspectBackdrop} onPress={onClose}>
        <Pressable
          style={styles.inspectSheet}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.inspectAccentBar} />
          {body}
          <View style={styles.inspectActionsRow}>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={styles.inspectCloseText}>Close</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ChallengeTile({
  card,
  gameId,
  busy,
  onInspect,
  onStart,
}: {
  card: Record<string, unknown>;
  gameId: string;
  busy: string | null;
  onInspect: () => void;
  onStart: () => void;
}) {
  const claimed = card.claimed === true;
  const pending = card.verificationPending === true;
  const pts = Number(card.points ?? 1);
  const stars = starCountFromPoints(card.points);
  const needsWheel = challengeNeedsWheelSpin(card);

  const [wheelClub, setWheelClub] = useState<string | null>(null);

  const loadWheelClub = useCallback(async () => {
    if (!needsWheel || !gameId || claimed) {
      setWheelClub(null);
      return;
    }
    const id = String(card.id ?? "");
    const club = await getChallengeWheelClub(gameId, id);
    setWheelClub(club);
  }, [needsWheel, gameId, claimed, card.id]);

  useFocusEffect(
    useCallback(() => {
      void loadWheelClub();
    }, [loadWheelClub]),
  );

  return (
    <Pressable
      onPress={onInspect}
      style={({ pressed }) => [
        styles.tilePressable,
        pressed ? styles.tileInspectPressed : null,
      ]}
    >
      <View
        style={[
          styles.tile,
          pending && !claimed ? styles.tileChallengePending : null,
        ]}
      >
        <View
          style={[
            styles.tileRibbon,
            claimed && styles.tileRibbonClaimed,
            pending && !claimed && styles.tileRibbonPending,
          ]}
        >
          <Text
            style={[
              styles.tileRibbonText,
              claimed && styles.tileRibbonTextInverse,
            ]}
          >
            +{pts}
          </Text>
        </View>

        <View style={styles.tileStars}>
          {[0, 1, 2].map((i) => (
            <MaterialIcons
              key={i}
              name={i < stars ? "star" : "star-border"}
              size={12}
              color={i < stars ? GolfColors.gold : "rgba(107,152,114,0.35)"}
            />
          ))}
        </View>

        <View style={styles.tileIconWrap}>
          <View
            style={[
              styles.tileIconBg,
              claimed
                ? styles.tileIconBgClaimed
                : pending
                  ? styles.tileIconBgPending
                  : styles.tileIconBgIdle,
            ]}
          >
            <MaterialIcons
              name="sports-golf"
              size={26}
              color={
                claimed
                  ? GolfColors.gold
                  : pending
                    ? GolfColors.gold
                    : GolfColors.mist
              }
            />
          </View>
        </View>

        <Text style={styles.tileTitle} numberOfLines={2}>
          {String(card.title ?? "")}
        </Text>

        {needsWheel && wheelClub && !claimed ? (
          <View style={styles.tileWheelClub}>
            <Text style={styles.tileWheelClubKicker} numberOfLines={1}>
              Wheel club
            </Text>
            <Text style={styles.tileWheelClubName} numberOfLines={1}>
              {wheelClub}
            </Text>
          </View>
        ) : null}

        <View style={styles.tileFooter}>
          {claimed ? (
            <View style={styles.tileStatusDone}>
              <MaterialIcons name="check" size={14} color={GolfColors.gold} />
              <Text style={styles.tileStatusDoneText}>Done</Text>
            </View>
          ) : pending ? (
            <View style={styles.tileStatusPending}>
              <Text style={styles.tileStatusPendingText}>Pending</Text>
            </View>
          ) : (
            <Pressable
              onPress={onStart}
              disabled={busy !== null}
              style={busy !== null ? { opacity: 0.5 } : undefined}
            >
              <View
                style={[
                  styles.tilePrimaryBtn,
                  busy !== null && { opacity: 0.5 },
                ]}
              >
                <Text style={styles.tilePrimaryBtnText}>Start</Text>
              </View>
            </Pressable>
          )}
        </View>
      </View>
    </Pressable>
  );
}

function MarketTile({
  card,
  myPoints,
  busy,
  onInspect,
  onBuy,
}: {
  card: Record<string, unknown>;
  myPoints: number;
  busy: string | null;
  onInspect: () => void;
  onBuy: () => void;
}) {
  const bought = isActionBought(card);
  const cost = Math.min(9999, Math.max(0, Number(card.points ?? 0)));
  const attack = isAttackActionCard(card);
  const stars = starCountFromPoints(card.points);
  const canAfford = myPoints >= cost;

  return (
    <Pressable
      onPress={onInspect}
      style={({ pressed }) => [
        styles.tilePressable,
        pressed ? styles.tileInspectPressed : null,
      ]}
    >
      <View
        style={[
          styles.tile,
          bought ? styles.tileBought : null,
          !bought && !canAfford ? { opacity: 0.55 } : null,
        ]}
      >
        <View style={[styles.tileRibbon, bought && styles.tileRibbonClaimed]}>
          <Text
            style={[
              styles.tileRibbonText,
              bought && styles.tileRibbonTextInverse,
            ]}
          >
            -{cost}
          </Text>
        </View>

        <View style={styles.tileStars}>
          {[0, 1, 2].map((i) => (
            <MaterialIcons
              key={i}
              name={i < stars ? "star" : "star-border"}
              size={12}
              color={i < stars ? GolfColors.gold : "rgba(107,152,114,0.35)"}
            />
          ))}
        </View>

        <View style={styles.tileIconWrap}>
          <View
            style={[
              styles.tileIconBg,
              bought ? styles.tileIconBgClaimed : styles.tileIconBgIdle,
            ]}
          >
            <MaterialIcons
              name={attack ? "bolt" : "eco"}
              size={26}
              color={
                attack
                  ? GolfColors.danger
                  : bought
                    ? GolfColors.gold
                    : GolfColors.mist
              }
            />
          </View>
        </View>

        <Text style={styles.tileTitle} numberOfLines={2}>
          {String(card.title ?? "")}
        </Text>

        <View style={styles.tileFooter}>
          {bought ? (
            <View style={styles.tileStatusDone}>
              <Text style={styles.tileStatusDoneText}>Bought</Text>
            </View>
          ) : canAfford ? (
            <Pressable
              onPress={onBuy}
              disabled={busy !== null}
              style={busy !== null ? { opacity: 0.5 } : undefined}
            >
              <View
                style={[
                  styles.tilePrimaryBtn,
                  busy !== null && { opacity: 0.5 },
                ]}
              >
                <Text style={styles.tilePrimaryBtnText}>Buy</Text>
              </View>
            </Pressable>
          ) : (
            <View style={styles.tilePoor}>
              <Text style={styles.tilePoorText}>Not enough</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

function LiveEventRow({
  ev,
  compact,
}: {
  ev: Record<string, unknown>;
  compact?: boolean;
}) {
  const eventType = String(ev.event_type ?? "");
  const variant = liveEventIconVariant(eventType);
  const copy = buildLiveEventCopy(ev);
  const ts = ev.timestamp ?? ev.created_at;
  const rel = formatShortRelativeTime(ts);

  return (
    <View style={[styles.liveRow, compact ? styles.liveRowCompact : null]}>
      <View
        style={[
          styles.liveIconBubble,
          { backgroundColor: variant.bubbleColor },
        ]}
      >
        <MaterialIcons
          name={variant.icon as keyof typeof MaterialIcons.glyphMap}
          size={14}
          color={variant.iconColor}
        />
      </View>
      <View style={styles.liveRowBody}>
        <Text
          style={styles.liveMessageText}
          numberOfLines={compact ? 2 : undefined}
        >
          {copy.kind === "system" ? (
            <>
              <Text style={styles.liveBody}>{copy.line}</Text>
              {copy.accent ? (
                <Text style={styles.liveAccent}>{copy.accent}</Text>
              ) : null}
            </>
          ) : (
            <>
              <Text style={styles.liveName}>{copy.name}</Text>
              <Text style={styles.liveBody}> {copy.before}</Text>
              {copy.accent ? (
                <Text style={styles.liveAccent}>{copy.accent}</Text>
              ) : null}
              {copy.after ? (
                <Text style={styles.liveBody}>{copy.after}</Text>
              ) : null}
            </>
          )}
        </Text>
      </View>
      <Text style={styles.liveTime}>{rel}</Text>
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
  },
  loadingText: {
    fontFamily: Font.regular,
    fontSize: 15,
    color: GolfColors.sage,
  },
  headerSection: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 10,
  },
  headerBar: {
    position: "relative",
    minHeight: 44,
    justifyContent: "center",
  },
  exitPress: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    zIndex: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  exitLabel: {
    fontFamily: Font.semiBold,
    fontSize: 14,
    color: GolfColors.mist,
  },
  headerCenter: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  headerHoleText: {
    fontFamily: Font.bold,
    fontSize: 17,
    color: "#FFFFFF",
    letterSpacing: -0.2,
  },
  nextPress: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  nextDisabled: { opacity: 0.45 },
  nextLabel: {
    fontFamily: Font.semiBold,
    fontSize: 14,
    color: GolfColors.gold,
  },
  headerTrailingSpacer: {
    position: "absolute",
    right: 0,
    width: 72,
    height: 44,
  },
  heroSection: {
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  heroCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(42,80,48,0.85)",
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 24,
    overflow: "hidden",
    backgroundColor: "rgba(15,26,18,0.92)",
  },
  heroBlob: {
    position: "absolute",
    borderRadius: 999,
    opacity: 0.35,
  },
  heroBlobTR: {
    width: 120,
    height: 120,
    top: -40,
    right: -30,
    backgroundColor: "rgba(212,175,55,0.12)",
  },
  heroBlobBL: {
    width: 96,
    height: 96,
    bottom: -28,
    left: -20,
    backgroundColor: "rgba(107,152,114,0.14)",
  },
  heroInner: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  heroKicker: {
    fontFamily: Font.bold,
    fontSize: 10,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: `${GolfColors.sage}EE`,
    marginBottom: 6,
  },
  heroPointsRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
  },
  heroPoints: {
    fontFamily: Font.black,
    fontSize: 48,
    color: "#FFFFFF",
    letterSpacing: -1,
  },
  heroPointsUnit: {
    fontFamily: Font.medium,
    fontSize: 18,
    color: GolfColors.mist,
  },
  heroMiniStats: {
    flexDirection: "row",
    gap: 16,
  },
  miniStat: {
    alignItems: "center",
    minWidth: 56,
  },
  miniStatIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  miniStatAccent: {
    backgroundColor: "rgba(212,175,55,0.18)",
  },
  miniStatPrimary: {
    backgroundColor: "rgba(184,212,191,0.12)",
  },
  miniStatValue: {
    fontFamily: Font.bold,
    fontSize: 18,
    color: "#FFFFFF",
  },
  miniStatCap: {
    fontFamily: Font.regular,
    fontSize: 9,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: `${GolfColors.sage}FF`,
    marginTop: 2,
  },
  tabRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  tabTrack: {
    flex: 1,
    flexDirection: "row",
    position: "relative",
    padding: 4,
    borderRadius: 18,
    backgroundColor: "rgba(107,152,114,0.12)",
    borderWidth: 1,
    borderColor: "rgba(42,80,48,0.55)",
  },
  tabSlider: {
    position: "absolute",
    top: 4,
    bottom: 4,
    borderRadius: 14,
    backgroundColor: "rgba(20,41,24,0.92)",
    borderWidth: 1,
    borderColor: "rgba(42,80,48,0.65)",
  },
  tabBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    zIndex: 1,
  },
  tabBtnText: {
    fontFamily: Font.semiBold,
    fontSize: 13,
    color: GolfColors.sage,
  },
  tabBtnTextOn: {
    color: "#FFFFFF",
  },
  rerollBtn: {
    position: "relative",
    overflow: "hidden",
    borderRadius: 12,
    backgroundColor: GolfColors.gold,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    minWidth: 52,
  },
  rerollBtnOff: {
    opacity: 0.48,
  },
  rerollBtnBody: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: { flex: 1, minHeight: 0 },
  scrollContent: {
    paddingHorizontal: 20,
  },
  gridRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
  },
  /** Three equal columns: padding creates 10px gutters (avoids iOS `gap` + `flexWrap` bugs). */
  gridCell: {
    width: "33.33333%",
    paddingHorizontal: 5,
    paddingBottom: 10,
  },
  gridCellLastRow: {
    paddingBottom: 0,
  },
  tilePressable: {
    width: "100%",
  },
  emptyLine: {
    fontFamily: Font.regular,
    fontSize: 14,
    color: "rgba(255,255,255,0.55)",
    marginBottom: 8,
  },
  tile: {
    height: 188,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(42,80,48,0.55)",
    backgroundColor: "rgba(30,46,30,0.45)",
    paddingHorizontal: 8,
    paddingTop: 28,
    paddingBottom: 10,
    marginBottom: 2,
    overflow: "hidden",
  },
  tileBought: {
    borderColor: "rgba(212,175,55,0.45)",
    backgroundColor: "rgba(30,62,46,0.4)",
  },
  tileChallengePending: {
    borderColor: "rgba(212,175,55,0.42)",
    backgroundColor: "rgba(40,52,34,0.55)",
  },
  tileRibbon: {
    position: "absolute",
    top: 0,
    right: 0,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderBottomLeftRadius: 14,
    backgroundColor: "rgba(212,175,55,0.22)",
  },
  tileRibbonClaimed: {
    backgroundColor: GolfColors.gold,
  },
  tileRibbonPending: {
    backgroundColor: "rgba(212,175,55,0.38)",
  },
  tileRibbonText: {
    fontFamily: Font.black,
    fontSize: 13,
    color: GolfColors.gold,
  },
  tileRibbonTextInverse: {
    color: GolfColors.forestDeep,
  },
  tileStars: {
    position: "absolute",
    top: 10,
    left: 8,
    flexDirection: "row",
    gap: 2,
  },
  tileIconWrap: {
    alignItems: "center",
    paddingVertical: 6,
  },
  tileIconBg: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  tileIconBgIdle: {
    backgroundColor: "rgba(107,152,114,0.15)",
  },
  tileIconBgClaimed: {
    backgroundColor: "rgba(212,175,55,0.18)",
  },
  tileIconBgPending: {
    backgroundColor: "rgba(212,175,55,0.22)",
  },
  tileTitle: {
    fontFamily: Font.bold,
    fontSize: 13,
    color: "#FFFFFF",
    textAlign: "center",
    lineHeight: 16,
    minHeight: 32,
  },
  tileWheelClub: {
    marginTop: 6,
    alignSelf: "stretch",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "rgba(212,175,55,0.1)",
    borderWidth: 1,
    borderColor: "rgba(212,175,55,0.28)",
  },
  tileWheelClubKicker: {
    fontFamily: Font.semiBold,
    fontSize: 9,
    letterSpacing: 0.6,
    color: GolfColors.sage,
    textTransform: "uppercase",
  },
  tileWheelClubName: {
    fontFamily: Font.bold,
    fontSize: 13,
    color: GolfColors.gold,
    textAlign: "center",
  },
  tileFooter: {
    marginTop: "auto",
    paddingTop: 8,
  },
  tilePrimaryBtn: {
    borderRadius: 12,
    backgroundColor: GolfColors.gold,
    paddingVertical: 10,
    alignItems: "center",
  },
  tilePrimaryBtnText: {
    fontFamily: Font.bold,
    fontSize: 12,
    color: GolfColors.forestDeep,
  },
  tileStatusDone: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 12,
    paddingVertical: 10,
    backgroundColor: "rgba(212,175,55,0.15)",
  },
  tileStatusDoneText: {
    fontFamily: Font.bold,
    fontSize: 12,
    color: GolfColors.gold,
  },
  tileStatusPending: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    paddingVertical: 10,
    backgroundColor: "rgba(212,175,55,0.08)",
    borderWidth: 1,
    borderColor: "rgba(212,175,55,0.28)",
  },
  tileStatusPendingText: {
    fontFamily: Font.bold,
    fontSize: 12,
    color: "rgba(233,200,120,0.98)",
    letterSpacing: 0.4,
  },
  tilePoor: {
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: "rgba(107,152,114,0.12)",
  },
  tilePoorText: {
    fontFamily: Font.bold,
    fontSize: 12,
    color: GolfColors.sage,
  },
  liveWrap: {
    marginTop: 14,
    width: "100%",
  },
  liveCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(42,80,48,0.65)",
    backgroundColor: "rgba(20,41,24,0.94)",
    overflow: "hidden",
  },
  liveHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(42,80,48,0.56)",
    backgroundColor: "rgba(107,152,114,0.08)",
  },
  liveTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  liveTitle: {
    fontFamily: Font.bold,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: GolfColors.sage,
  },
  liveHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  liveExpand: {
    fontFamily: Font.semiBold,
    fontSize: 12,
    color: GolfColors.gold,
  },
  liveNow: {
    fontFamily: Font.semiBold,
    fontSize: 12,
    color: GolfColors.mist,
  },
  liveStripScroll: {
    flex: 1,
  },
  liveStripScrollContent: {
    flexGrow: 1,
    paddingBottom: 4,
  },
  liveEmpty: {
    fontFamily: Font.regular,
    fontSize: 13,
    color: "rgba(255,255,255,0.45)",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  liveFeedBody: {
    overflow: "hidden",
    justifyContent: "flex-start",
  },
  liveRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(42,80,48,0.48)",
  },
  /** Collapsed strip — tighter vertical padding. */
  liveRowCompact: {
    paddingVertical: 8,
  },
  liveRowBody: {
    flex: 1,
    minWidth: 0,
  },
  liveIconBubble: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(212,175,55,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  liveMessageText: {
    fontFamily: Font.regular,
    fontSize: 14,
    lineHeight: 19,
    color: "rgba(255,255,255,0.88)",
  },
  liveBody: {
    fontFamily: Font.regular,
    fontSize: 14,
    color: "rgba(255,255,255,0.88)",
  },
  liveAccent: {
    fontFamily: Font.semiBold,
    fontSize: 14,
    color: GolfColors.gold,
  },
  liveTime: {
    fontFamily: Font.regular,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.2,
    color: "rgba(184,212,191,0.65)",
    flexShrink: 0,
    marginLeft: 6,
    alignSelf: "flex-start",
    paddingTop: 2,
  },
  liveName: {
    fontFamily: Font.semiBold,
    fontSize: 14,
    color: "#FFFFFF",
  },
  liveOverlayRoot: {
    flex: 1,
  },
  liveOverlayPanel: {
    position: "absolute",
    backgroundColor: "rgba(18,34,24,0.98)",
    borderWidth: 1,
    borderColor: "rgba(212,175,55,0.35)",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    overflow: "hidden",
    zIndex: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.42,
    shadowRadius: 32,
    elevation: 28,
  },
  liveOverlaySafe: {
    flex: 1,
  },
  liveOverlayHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(42,80,48,0.56)",
    backgroundColor: "rgba(107,152,114,0.1)",
  },
  liveOverlayTitle: {
    fontFamily: Font.bold,
    fontSize: 13,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: GolfColors.sage,
  },
  liveOverlayScroll: {
    flex: 1,
  },
  liveOverlayScrollContent: {
    flexGrow: 1,
    justifyContent: "flex-start",
    paddingBottom: 8,
  },
  tileInspectPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.985 }],
  },
  inspectBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    paddingHorizontal: 22,
  },
  inspectSheet: {
    maxHeight: "88%",
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: "rgba(212,175,55,0.55)",
    backgroundColor: "rgba(15,26,18,0.98)",
    overflow: "hidden",
    shadowColor: GolfColors.gold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 16,
    paddingBottom: 16,
  },
  inspectAccentBar: {
    height: 4,
    backgroundColor: GolfColors.gold,
    opacity: 0.95,
  },
  inspectBadgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 18,
    paddingTop: 14,
  },
  inspectBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: "rgba(212,175,55,0.14)",
    borderWidth: 1,
    borderColor: "rgba(212,175,55,0.35)",
  },
  inspectBadgeText: {
    fontFamily: Font.bold,
    fontSize: 11,
    letterSpacing: 0.8,
    color: GolfColors.gold,
    textTransform: "uppercase",
  },
  inspectBadgeMuted: {
    backgroundColor: "rgba(107,152,114,0.15)",
    borderColor: "rgba(107,152,114,0.35)",
  },
  inspectBadgeTextMuted: {
    fontFamily: Font.bold,
    fontSize: 11,
    color: GolfColors.sage,
    textTransform: "uppercase",
  },
  inspectBadgePending: {
    backgroundColor: "rgba(212,175,55,0.12)",
    borderColor: "rgba(212,175,55,0.45)",
  },
  inspectBadgeTextPending: {
    fontFamily: Font.bold,
    fontSize: 11,
    color: "rgba(233,200,120,0.98)",
    textTransform: "uppercase",
  },
  inspectHero: {
    alignItems: "center",
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 8,
  },
  inspectIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: "rgba(107,152,114,0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(212,175,55,0.25)",
  },
  inspectTitle: {
    fontFamily: Font.bold,
    fontSize: 20,
    color: "#FFFFFF",
    textAlign: "center",
    lineHeight: 26,
  },
  inspectDescScroll: {
    maxHeight: 220,
    paddingHorizontal: 18,
    marginBottom: 12,
  },
  inspectDesc: {
    fontFamily: Font.regular,
    fontSize: 15,
    lineHeight: 22,
    color: "rgba(184,212,191,0.95)",
  },
  inspectMeta: {
    paddingHorizontal: 18,
    gap: 8,
    marginBottom: 14,
  },
  inspectMetaLine: {
    fontFamily: Font.regular,
    fontSize: 13,
    lineHeight: 18,
    color: "rgba(255,255,255,0.88)",
  },
  inspectMetaLabel: {
    fontFamily: Font.regular,
    color: GolfColors.sage,
  },
  inspectMetaValue: {
    fontFamily: Font.semiBold,
    color: "#FFFFFF",
  },
  inspectMetaHint: {
    fontFamily: Font.regular,
    fontSize: 12,
    lineHeight: 17,
    color: "rgba(212,175,55,0.88)",
    marginTop: 4,
  },
  inspectWheelClubBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "rgba(212,175,55,0.1)",
    borderWidth: 1,
    borderColor: "rgba(212,175,55,0.3)",
  },
  inspectWheelClubText: {
    fontFamily: Font.regular,
    fontSize: 14,
    color: "rgba(255,255,255,0.9)",
    flex: 1,
  },
  inspectWheelClubValue: {
    fontFamily: Font.bold,
    color: GolfColors.gold,
  },
  inspectFooterHint: {
    fontFamily: Font.regular,
    fontSize: 13,
    textAlign: "center",
    color: GolfColors.sage,
    paddingHorizontal: 18,
    marginBottom: 12,
  },
  inspectPrimaryBtn: {
    marginHorizontal: 18,
    borderRadius: 12,
    backgroundColor: GolfColors.gold,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 8,
  },
  inspectPrimaryBtnText: {
    fontFamily: Font.bold,
    fontSize: 14,
    color: GolfColors.forestDeep,
  },
  inspectActionsRow: {
    flexDirection: "row",
    justifyContent: "center",
    paddingTop: 4,
    paddingHorizontal: 18,
  },
  inspectCloseText: {
    fontFamily: Font.semiBold,
    fontSize: 14,
    color: GolfColors.gold,
    paddingVertical: 8,
  },
});
