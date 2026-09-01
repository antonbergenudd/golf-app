import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import {
  useGlobalSearchParams,
  useLocalSearchParams,
  usePathname,
  useSegments,
} from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  useGameShell,
  type GameFabRegistration,
  type GameTabRouteName,
} from "@/context/GameShellContext";
import { useGameInventoryBagCount } from "@/hooks/useGameInventoryBagCount";
import { useGamePendingVerificationCount } from "@/hooks/useGamePendingVerificationCount";
import { Font } from "@/theme/fonts";
import { paramFirst, resolveSessionGameId } from "@/utils/resolveSessionGameId";

import { VerificationNavButton } from "./VerificationNavButton";

const GolfColors = {
  gold: "#D4AF37",
  sage: "#6B9872",
  mist: "#B8D4BF",
  forestDeep: "#071209",
  /** Same accent as verification badge — “you have bag items”. */
  notify: "#E85D4C",
};

const FAB_FLOAT = 28;

const idleFab: GameFabRegistration = {
  digit: "—",
  scoredLook: false,
  caption: "Score",
  captionEntered: false,
  onPress: () => {},
  accessibilityLabel: "Score",
};

type GameSessionTabBarProps = BottomTabBarProps & {
  /** From `game/[gameId]` layout — always set so hooks work when tab-level params omit `gameId`. */
  sessionGameId?: string;
};

export function GameSessionTabBar({
  state,
  navigation,
  sessionGameId: sessionGameIdFromLayout,
}: GameSessionTabBarProps) {
  const insets = useSafeAreaInsets();
  const { getFabForRoute } = useGameShell();
  const activeRoute = state.routes[state.index];
  const name = (activeRoute?.name ?? "index") as GameTabRouteName;
  const fab = getFabForRoute(name) ?? idleFab;

  const local = useLocalSearchParams() as Record<string, unknown>;
  const global = useGlobalSearchParams() as Record<string, unknown>;
  const pathname = usePathname();
  const segments = useSegments();
  const gameId =
    (sessionGameIdFromLayout && sessionGameIdFromLayout.trim()) ||
    resolveSessionGameId({ local, global, pathname, segments });

  const viewerPlayerId =
    paramFirst(local.playerId) || paramFirst(global.playerId);

  const pendingVerificationCount = useGamePendingVerificationCount(
    gameId,
    viewerPlayerId,
  );

  const inventoryBagCount = useGameInventoryBagCount(gameId, viewerPlayerId);

  const go = (routeName: GameTabRouteName) => {
    navigation.navigate(routeName);
  };

  return (
    <View
      style={[
        styles.bottomNav,
        { paddingBottom: Math.max(insets.bottom, 10) },
      ]}
    >
      <Pressable
        style={styles.navItem}
        onPress={() => go("index")}
        accessibilityRole="button"
        accessibilityLabel="Game"
      >
        <MaterialIcons
          name="flag"
          size={22}
          color={name === "index" ? GolfColors.gold : GolfColors.sage}
        />
        <Text
          style={[
            styles.navLabel,
            name === "index" ? styles.navLabelActive : null,
          ]}
        >
          Game
        </Text>
      </Pressable>

      <Pressable
        style={styles.navItem}
        onPress={() => go("inventory")}
        accessibilityRole="button"
        accessibilityLabel={
          inventoryBagCount > 0
            ? `Inventory, ${inventoryBagCount} cards in bag`
            : "Inventory"
        }
      >
        <View style={styles.inventoryIconWrap}>
          <MaterialIcons
            name="layers"
            size={22}
            color={name === "inventory" ? GolfColors.gold : GolfColors.sage}
          />
          {inventoryBagCount > 0 ? (
            <View style={styles.inventoryBadge} accessibilityElementsHidden>
              <Text style={styles.inventoryBadgeText}>
                {inventoryBagCount > 99 ? "99+" : String(inventoryBagCount)}
              </Text>
            </View>
          ) : null}
        </View>
        <Text
          style={[
            styles.navLabel,
            name === "inventory" ? styles.navLabelActive : null,
          ]}
        >
          Inventory
        </Text>
      </Pressable>

      <View style={styles.fabSlot}>
        <Pressable
          style={({ pressed }) => [
            pressed && styles.fabOuterPressed,
          ]}
          onPress={fab.onPress}
          accessibilityLabel={fab.accessibilityLabel}
          accessibilityRole="button"
        >
          <View
            style={[
              styles.fabOuter,
              fab.scoredLook ? styles.fabOuterScored : styles.fabOuterPending,
            ]}
          >
            <Text
              style={[
                styles.fabDigit,
                !fab.scoredLook && styles.fabDigitPlaceholder,
              ]}
            >
              {fab.digit}
            </Text>
          </View>
        </Pressable>
        <Text
          style={[
            styles.fabCaption,
            fab.captionEntered
              ? styles.fabCaptionEntered
              : styles.fabCaptionPrompt,
          ]}
        >
          {fab.caption}
        </Text>
      </View>

      <Pressable
        style={styles.navItem}
        onPress={() => go("scorecard")}
        accessibilityRole="button"
        accessibilityLabel="Lobby scorecard"
      >
        <MaterialIcons
          name="people"
          size={22}
          color={name === "scorecard" ? GolfColors.gold : GolfColors.sage}
        />
        <Text
          style={[
            styles.navLabel,
            name === "scorecard" ? styles.navLabelActive : null,
          ]}
        >
          Lobby
        </Text>
      </Pressable>

      {/** Above `fabSlot` (zIndex 40) so the verification badge is not hidden under the FAB. */}
      <View style={styles.verificationSlot}>
        <VerificationNavButton
          pendingCount={pendingVerificationCount}
          active={name === "verifications"}
          onPress={() => go("verifications")}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
    overflow: "visible",
  },
  navItem: {
    alignItems: "center",
    justifyContent: "center",
    minWidth: 52,
    paddingBottom: 4,
    gap: 4,
    overflow: "visible",
  },
  inventoryIconWrap: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    width: 26,
    height: 26,
    overflow: "visible",
  },
  inventoryBadge: {
    position: "absolute",
    top: -5,
    right: -12,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: GolfColors.notify,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(26,42,26,0.94)",
  },
  inventoryBadgeText: {
    fontFamily: Font.bold,
    fontSize: 10,
    color: "#FFFFFF",
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
    flexShrink: 0,
    overflow: "visible",
  },
  /** Tab bar FAB overlaps neighbors; keep Verifications (and badge) on top. */
  verificationSlot: {
    zIndex: 50,
    overflow: "visible",
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
    opacity: 0.92,
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
    color: "rgba(184,212,191,0.75)",
  },
});
