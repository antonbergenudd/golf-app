import { Ionicons } from "@expo/vector-icons";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Font } from "@/theme/fonts";

const GolfColors = {
  gold: "#D4AF37",
  mist: "#B8D4BF",
};

type MaterialName = React.ComponentProps<typeof MaterialIcons>["name"];

type Props = {
  onBack: () => void;
  centerIcon: MaterialName;
  title: string;
  /** Optional right action — same absolute slot as “Next hole” on the game header. */
  rightSlot?: ReactNode;
};

/**
 * Same shell as `app/game/[gameId]/index.tsx` header (`headerSection` / `headerBar`):
 * 44px bar, absolute leading / centered title / trailing balance.
 */
export function GameSessionSubscreenHeader({
  onBack,
  centerIcon,
  title,
  rightSlot,
}: Props) {
  return (
    <View style={styles.headerSection}>
      <View style={styles.headerBar}>
        <Pressable
          onPress={onBack}
          hitSlop={12}
          style={styles.leadingSlot}
          accessibilityRole="button"
          accessibilityLabel="Back to game"
        >
          <Ionicons name="chevron-back" size={22} color={GolfColors.mist} />
          <Text style={styles.leadingLabel}>Back</Text>
        </Pressable>

        <View style={styles.headerCenter} pointerEvents="none">
          <MaterialIcons name={centerIcon} size={18} color={GolfColors.gold} />
          <Text style={styles.title}>{title}</Text>
        </View>

        {rightSlot != null ? (
          <View style={styles.trailingSlot}>{rightSlot}</View>
        ) : (
          <View style={styles.trailingSpacer} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
  leadingSlot: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    zIndex: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  leadingLabel: {
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
  title: {
    fontFamily: Font.bold,
    fontSize: 17,
    color: "#FFFFFF",
    letterSpacing: -0.2,
  },
  trailingSpacer: {
    position: "absolute",
    right: 0,
    width: 72,
    height: 44,
  },
  trailingSlot: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 2,
    flexDirection: "row",
    alignItems: "center",
  },
});
