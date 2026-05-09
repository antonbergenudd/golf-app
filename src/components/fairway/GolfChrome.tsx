import { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { FairwayAmbientShapes, FairwayBackdrop } from "./FairwayBackdrop";

/** Legacy `GolfThemedBody`: scaffold + backdrop + ambient shapes + content. */
export function GolfChrome({ children }: { children: ReactNode }) {
  return (
    <View style={styles.root}>
      <FairwayBackdrop />
      <FairwayAmbientShapes />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#071209",
  },
});
