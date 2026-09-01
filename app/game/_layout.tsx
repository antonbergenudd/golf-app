import { Slot } from "expo-router";
import { StyleSheet, View } from "react-native";

import { ReconnectingBanner } from "@/components/fairway/ReconnectingBanner";
import { VictimAttackModalHost } from "@/components/fairway/VictimAttackModalHost";

/**
 * Wraps every `/game/...` screen so the session-wide chrome (attack alert,
 * reconnecting banner) mounts once regardless of which tab is active.
 */
export default function GameBranchLayout() {
  return (
    <View style={styles.fill}>
      <Slot />
      <VictimAttackModalHost />
      <ReconnectingBanner />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
