import { useEffect, useRef } from "react";
import { Animated, Easing, Platform, StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useRealtimeConnected } from "@/hooks/useRealtimeConnected";
import { Font } from "@/theme/fonts";

/**
 * Thin bar under the status bar shown while the realtime connection is down —
 * so a player on patchy course signal knows the app is waiting on the network,
 * not frozen. Mounted once for the whole game session.
 */
export function ReconnectingBanner() {
  const connected = useRealtimeConnected();
  const insets = useSafeAreaInsets();
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: connected ? 0 : 1,
      duration: 200,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [connected, anim]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.bar,
        {
          paddingTop: insets.top + 6,
          opacity: anim,
          transform: [
            {
              translateY: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [-8, 0],
              }),
            },
          ],
        },
      ]}
    >
      <Text style={styles.text}>Reconnecting…</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    alignItems: "center",
    paddingBottom: 6,
    backgroundColor: "rgba(212,175,55,0.16)",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(212,175,55,0.4)",
    ...Platform.select({ web: { backdropFilter: "blur(6px)" } }),
  },
  text: {
    fontFamily: Font.semiBold,
    fontSize: 12,
    letterSpacing: 0.4,
    color: "#E7C766",
  },
});
