import { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { FairwayAmbientShapes, FairwayBackdrop } from "./FairwayBackdrop";

/** Opaque session shell base — tab scenes and chrome root use this so web/native match. */
export const GOLF_CHROME_SESSION_BASE = "#071209";

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
    backgroundColor: GOLF_CHROME_SESSION_BASE,
    /** Clip fairway decor that sits past the viewport (negative left/right); avoids horizontal scroll on web. */
    overflow: "hidden",
  },
});
