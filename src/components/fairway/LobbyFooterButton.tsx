import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Font } from "@/theme/fonts";

const GOLD = "#D4AF37";

type Props = {
  variant: "primary" | "danger";
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  /** Primary only: play icon before label (legacy `Icons.play_arrow_rounded`). */
  showPlayIcon?: boolean;
  accessibilityLabel?: string;
};

/**
 * Lobby footer actions matching `golf-app-legacy` `lib/widgets/app_button.dart`
 * visuals (border, fill, glow). Paint lives on an inner `View` so backgrounds
 * reliably show on RN Web / Android; `Pressable` only handles hit targets.
 */
export function LobbyFooterButton({
  variant,
  label,
  onPress,
  disabled = false,
  loading = false,
  showPlayIcon = false,
  accessibilityLabel,
}: Props) {
  const busy = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: busy }}
      onPress={() => {
        if (busy) return;
        onPress();
      }}
      style={styles.hit}
      android_ripple={
        variant === "primary"
          ? { color: "rgba(212, 175, 55, 0.14)" }
          : { color: "rgba(255, 82, 82, 0.14)" }
      }
    >
      {({ pressed }) => {
        const primary = variant === "primary";
        const faceStyle = primary
          ? [
              styles.face,
              busy ? styles.primaryFaceDisabled : styles.primaryFace,
            ]
          : [styles.face, styles.dangerFace];
        const pressedStyle =
          pressed && !busy ? styles.facePressed : null;

        return (
          <View style={[...faceStyle, pressedStyle]}>
            {loading ? (
              <ActivityIndicator
                color={
                  primary
                    ? "rgba(212, 175, 55, 0.55)"
                    : "rgba(255, 82, 82, 0.45)"
                }
                size="small"
              />
            ) : (
              <View style={styles.row}>
                {primary && showPlayIcon ? (
                  <MaterialIcons
                    name="play-arrow"
                    size={18}
                    color={GOLD}
                  />
                ) : null}
                <Text
                  style={primary ? styles.primaryLabel : styles.dangerLabel}
                >
                  {label}
                </Text>
              </View>
            )}
          </View>
        );
      }}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: {
    alignSelf: "stretch",
  },
  face: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  facePressed: {
    opacity: 0.97,
    transform: [{ scale: 0.97 }],
  },
  /** Legacy primary `AppButton` (gold border + glow). */
  primaryFace: {
    borderWidth: 1.5,
    borderColor: "rgba(212, 175, 55, 0.6)",
    backgroundColor: "rgba(212, 175, 55, 0.08)",
    shadowColor: GOLD,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 20,
    elevation: 10,
  },
  primaryFaceDisabled: {
    borderWidth: 1.5,
    borderColor: "rgba(212, 175, 55, 0.25)",
    backgroundColor: "rgba(212, 175, 55, 0.03)",
    shadowOpacity: 0,
    elevation: 0,
  },
  /** Legacy danger `AppButton` (`Colors.redAccent` @ 0.05 / 0.7 border). */
  dangerFace: {
    borderWidth: 1,
    borderColor: "rgba(255, 82, 82, 0.7)",
    backgroundColor: "rgba(255, 82, 82, 0.05)",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  primaryLabel: {
    fontFamily: Font.semiBold,
    fontSize: 15,
    fontWeight: "normal",
    letterSpacing: 0.5,
    color: GOLD,
  },
  dangerLabel: {
    fontFamily: Font.semiBold,
    fontSize: 15,
    fontWeight: "normal",
    letterSpacing: 0.5,
    color: "#FF5252",
  },
});
