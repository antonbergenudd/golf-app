import { Slot } from "expo-router";
import { StyleSheet, View } from "react-native";

import { VictimAttackModalHost } from "./[gameId]/_VictimAttackModalHost";

/**
 * Wraps every `/game/...` screen so the victim attack alert mounts even when the
 * active route is the legacy `game/[gameId].tsx` leaf (tabs layout is only under `game/[gameId]/`).
 */
export default function GameBranchLayout() {
  return (
    <View style={styles.fill}>
      <VictimAttackModalHost />
      <Slot />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
