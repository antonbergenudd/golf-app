import {
  Tabs,
  useGlobalSearchParams,
  useLocalSearchParams,
  usePathname,
  useSegments,
} from "expo-router";
import { Platform, StyleSheet, View } from "react-native";

import { GameSessionTabBar } from "@/components/fairway/GameSessionTabBar";
import { GolfChrome } from "@/components/fairway/GolfChrome";
import { GameShellProvider } from "@/context/GameShellContext";
import { resolveSessionGameId } from "@/utils/resolveSessionGameId";

export default function GameSessionLayout() {
  const local = useLocalSearchParams() as Record<string, unknown>;
  const global = useGlobalSearchParams() as Record<string, unknown>;
  const pathname = usePathname();
  const segments = useSegments();
  const sessionGameId = resolveSessionGameId({
    local,
    global,
    pathname,
    segments,
  });

  return (
    <GolfChrome>
      <GameShellProvider>
        <View style={styles.flex}>
          <Tabs
            detachInactiveScreens={Platform.OS === "web"}
            tabBar={(props) => (
              <GameSessionTabBar {...props} sessionGameId={sessionGameId} />
            )}
            screenOptions={{
              headerShown: false,
              /**
               * Web: lazy-mount so inactive routes are not in the tree (avoids merged tab UIs).
               * Native: eager mount (`lazy: false`) so tab screens stay mounted and subscriptions stay stable.
               */
              lazy: Platform.OS === "web",
              /**
               * Native: `none` — no opacity layer; z-order is enough.
               * Web: `fade` with 0ms timing — still uses the fade `sceneStyleInterpolator` so inactive
               * scenes get `opacity: 0`. With `animation: "none"` that interpolator is off, and another
               * tab (e.g. Inventory) can flash through transparent areas or stacking quirks.
               */
              animation: Platform.OS === "web" ? "fade" : "none",
              ...(Platform.OS === "web"
                ? {
                    transitionSpec: {
                      animation: "timing",
                      config: { duration: 0 },
                    },
                  }
                : {}),
              /**
               * Transparent so `GolfChrome` gradient + ambient blobs show through.
               * Web tab isolation uses lazy + detachInactiveScreens + flex overflow, not opaque scenes.
               */
              sceneStyle: { backgroundColor: "transparent" },
              tabBarStyle: {
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                elevation: 0,
                borderTopWidth: 0,
                backgroundColor: "transparent",
              },
            }}
          >
            <Tabs.Screen name="index" options={{ title: "Game" }} />
            <Tabs.Screen name="inventory" options={{ title: "Inventory" }} />
            <Tabs.Screen name="scorecard" options={{ title: "Lobby" }} />
            <Tabs.Screen
              name="verifications"
              options={{ title: "Verifications" }}
            />
          </Tabs>
        </View>
      </GameShellProvider>
    </GolfChrome>
  );
}

const styles = StyleSheet.create({
  /** No fill here — `GolfChrome` paints backdrop + blobs behind this stack. Web clips stray layers. */
  flex: {
    flex: 1,
    overflow: Platform.OS === "web" ? "hidden" : "visible",
  },
});
