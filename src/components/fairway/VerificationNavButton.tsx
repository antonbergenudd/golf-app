import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import type { StyleProp, TextStyle } from "react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Font } from "@/theme/fonts";

const GolfColors = {
  sage: "#6B9872",
  gold: "#D4AF37",
  /** High-contrast “unread” accent on the dark tab bar. */
  notify: "#E85D4C",
};

type Props = {
  pendingCount: number;
  onPress: () => void;
  /** When true, icon and label use active (gold) styling like other tab items. */
  active?: boolean;
  iconColor?: string;
  labelStyle?: StyleProp<TextStyle>;
};

export function VerificationNavButton({
  pendingCount,
  onPress,
  active = false,
  iconColor = GolfColors.sage,
  labelStyle,
}: Props) {
  const showBadge = pendingCount > 0;
  const countLabel =
    pendingCount > 99 ? "99+" : String(Math.max(0, pendingCount));
  const accessibilityLabel = showBadge
    ? `Challenge verifications, ${pendingCount} pending`
    : "Challenge verifications";

  const resolvedIconColor = active ? GolfColors.gold : iconColor;

  return (
    <Pressable
      style={styles.navItem}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <View style={styles.iconWrap}>
        <MaterialIcons name="fact-check" size={22} color={resolvedIconColor} />
        {showBadge ? (
          <View style={styles.badge} accessibilityElementsHidden>
            <Text style={styles.badgeText}>{countLabel}</Text>
          </View>
        ) : null}
      </View>
      <Text
        style={[styles.navLabel, active && styles.navLabelActive, labelStyle]}
      >
        Verifications
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  navItem: {
    alignItems: "center",
    justifyContent: "center",
    minWidth: 52,
    paddingBottom: 4,
    gap: 4,
    overflow: "visible",
  },
  iconWrap: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    width: 26,
    height: 26,
    overflow: "visible",
  },
  /** Single pending — same pill as multi-count so the badge is easy to spot on the tab bar. */
  badge: {
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
  badgeText: {
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
});
