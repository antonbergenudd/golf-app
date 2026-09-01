import { Ionicons } from "@expo/vector-icons";
import { router, useGlobalSearchParams, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { GolfChrome } from "@/components/fairway/GolfChrome";
import { AppButton } from "@/components/ui/AppButton";
import { Font } from "@/theme/fonts";
import { persistChallengeWheelSpin } from "@/utils/challengeWheelStorage";
import { paramFirst } from "@/utils/resolveSessionGameId";

const CLUBS = [
  "Sandwedge",
  "Pitch",
  "9",
  "8",
  "7",
  "6",
  "5",
  "4",
  "3 wood",
  "Driver",
];

/** Enough tiles for max scroll index (~9 full cycles × 10 clubs + index). */
const STRIP_TILES = 110;

export default function WheelScreen() {
  const local = useLocalSearchParams() as Record<string, unknown>;
  const global = useGlobalSearchParams() as Record<string, unknown>;

  const playerNameRaw =
    paramFirst(local.playerName) || paramFirst(global.playerName);
  const playerName = playerNameRaw ? String(playerNameRaw) : undefined;
  const autoSpinRaw =
    paramFirst(local.autoSpin) || paramFirst(global.autoSpin);
  const auto = autoSpinRaw === "1" || autoSpinRaw === "true";
  const gameId =
    paramFirst(local.gameId) || paramFirst(global.gameId);
  const cardId =
    paramFirst(local.cardId) || paramFirst(global.cardId);

  const { width: screenW } = useWindowDimensions();
  const horizontalPad = 24;
  const viewW = Math.max(280, screenW - horizontalPad * 2);
  const itemW = Math.min(104, Math.floor(viewW / 3.2));
  const itemH = 76;

  const translateX = useRef(new Animated.Value(0)).current;
  const spinToken = useRef(0);

  const [phase, setPhase] = useState<"idle" | "spinning" | "result">("idle");
  const [pick, setPick] = useState<string | null>(null);

  const strip = useMemo(
    () =>
      Array.from({ length: STRIP_TILES }, (_, i) => ({
        key: i,
        label: CLUBS[i % CLUBS.length]!,
      })),
    [],
  );

  useEffect(() => {
    if (phase !== "idle") return;
    const centerOffset = viewW / 2 - itemW / 2;
    translateX.setValue(centerOffset);
  }, [viewW, itemW, translateX, phase]);

  const spin = useCallback(() => {
    if (phase !== "idle") return;

    const token = ++spinToken.current;
    setPhase("spinning");
    setPick(null);

    const winIdx = Math.floor(Math.random() * CLUBS.length);
    const chosenLabel = CLUBS[winIdx]!;
    const fullLoops = 5 + Math.floor(Math.random() * 5);
    const winGlobalIdx = fullLoops * CLUBS.length + winIdx;

    const centerOffset = viewW / 2 - itemW / 2;
    const startX = centerOffset;
    const endX = centerOffset - winGlobalIdx * itemW;

    translateX.setValue(startX);

    Animated.timing(translateX, {
      toValue: endX,
      duration: 5200,
      easing: Easing.bezier(0.12, 0.85, 0.22, 1),
      useNativeDriver: Platform.OS === "ios" || Platform.OS === "android",
    }).start(({ finished }) => {
      if (!finished || spinToken.current !== token) return;
      setPick(chosenLabel);
      setPhase("result");
      void persistChallengeWheelSpin(gameId, cardId, chosenLabel);
    });
  }, [phase, translateX, viewW, itemW, gameId, cardId]);

  const autoTriggered = useRef(false);
  useEffect(() => {
    if (!auto) return;
    const t = setTimeout(() => {
      void spin();
    }, 450);
    return () => clearTimeout(t);
  }, [auto, spin]);

  const title = playerName ? `${playerName}'s Wheel` : "Wheel of Doom";

  const canSpin = phase === "idle";

  return (
    <GolfChrome>
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="chevron-back" size={22} color="#D4AF37" />
          </Pressable>
          <Text style={styles.headerTitle}>{title}</Text>
          <View style={{ width: 22 }} />
        </View>

        <View style={[styles.body, { paddingHorizontal: horizontalPad }]}>
          <Text style={styles.blurb}>
            {playerName
              ? `${playerName} must use the club you land on.`
              : "Spin once — your club is picked at random."}
          </Text>

          <View style={[styles.window, { width: viewW, height: itemH + 28 }]}>
            <View style={[styles.fadeLeft, styles.noPointerEvents]} />
            <View style={[styles.fadeRight, styles.noPointerEvents]} />
            <View style={[styles.pointerTop, styles.noPointerEvents]} />
            <View style={[styles.clip, { width: viewW, height: itemH + 12 }]}>
              <Animated.View
                style={[
                  styles.strip,
                  {
                    transform: [{ translateX }],
                  },
                ]}
              >
                {strip.map(({ key, label }) => (
                  <View
                    key={key}
                    style={[styles.tile, { width: itemW, height: itemH }]}
                  >
                    <Text style={styles.tileEmoji}>🏌️</Text>
                    <Text style={styles.tileLabel} numberOfLines={1}>
                      {label}
                    </Text>
                  </View>
                ))}
              </Animated.View>
            </View>
          </View>

          {phase === "spinning" ? (
            <Text style={styles.status}>Finding your club…</Text>
          ) : (
            <Text style={styles.statusMuted}>
              {canSpin ? "Tap spin to shuffle the bag." : ""}
            </Text>
          )}

          {canSpin ? (
            <AppButton label="Spin" onPress={spin} />
          ) : phase === "spinning" ? (
            <View style={styles.spinPlaceholder} />
          ) : null}
        </View>

        <Modal
          visible={phase === "result"}
          transparent
          animationType="fade"
          onRequestClose={() => router.back()}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.modalKicker}>Wheel of Doom</Text>
              <Text style={styles.modalTitle}>
                Your club is{" "}
                <Text style={styles.modalPick}>{pick ?? "—"}</Text>
              </Text>
              <Text style={styles.modalHint}>
                Tap OK to return — you only spin once for this challenge.
              </Text>
              <AppButton label="OK" onPress={() => router.back()} />
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </GolfChrome>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(42,80,48,0.8)",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: {
    flex: 1,
    fontFamily: Font.bold,
    fontSize: 17,
    color: "#FFFFFF",
    textAlign: "center",
  },
  body: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 24,
  },
  blurb: {
    fontFamily: Font.regular,
    fontSize: 15,
    lineHeight: 22,
    color: "#C8DCC9",
    textAlign: "center",
    marginBottom: 28,
    paddingHorizontal: 8,
  },
  window: {
    position: "relative",
    marginBottom: 20,
  },
  fadeLeft: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 36,
    zIndex: 2,
    backgroundColor: "rgba(20,41,24,0.92)",
  },
  fadeRight: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: 36,
    zIndex: 2,
    backgroundColor: "rgba(20,41,24,0.92)",
  },
  noPointerEvents: {
    pointerEvents: "none",
  },
  pointerTop: {
    position: "absolute",
    top: -2,
    alignSelf: "center",
    left: "50%",
    marginLeft: -10,
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderBottomWidth: 12,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: "#D4AF37",
    zIndex: 3,
  },
  clip: {
    overflow: "hidden",
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "rgba(212,175,55,0.45)",
    backgroundColor: "#0F1A12",
  },
  strip: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  tile: {
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 6,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: "rgba(42,80,48,0.55)",
    backgroundColor: "#142918",
  },
  tileEmoji: {
    fontSize: 22,
    marginBottom: 4,
  },
  tileLabel: {
    fontFamily: Font.semiBold,
    fontSize: 13,
    color: "#FFFFFF",
    textAlign: "center",
  },
  status: {
    fontFamily: Font.medium,
    fontSize: 15,
    color: "#D4AF37",
    marginBottom: 18,
    minHeight: 22,
  },
  statusMuted: {
    fontFamily: Font.medium,
    fontSize: 14,
    color: "rgba(184,212,191,0.55)",
    marginBottom: 18,
    minHeight: 22,
    textAlign: "center",
  },
  spinPlaceholder: {
    height: 56,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  modalCard: {
    borderRadius: 18,
    paddingHorizontal: 22,
    paddingVertical: 26,
    backgroundColor: "#142918",
    borderWidth: 1,
    borderColor: "rgba(42,80,48,0.85)",
    gap: 16,
  },
  modalKicker: {
    fontFamily: Font.bold,
    fontSize: 11,
    letterSpacing: 2,
    color: "#6B9872",
    textTransform: "uppercase",
    textAlign: "center",
  },
  modalTitle: {
    fontFamily: Font.black,
    fontSize: 22,
    color: "#FFFFFF",
    textAlign: "center",
    lineHeight: 30,
  },
  modalPick: {
    color: "#D4AF37",
  },
  modalHint: {
    fontFamily: Font.regular,
    fontSize: 14,
    color: "rgba(184,212,191,0.78)",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 4,
  },
});
