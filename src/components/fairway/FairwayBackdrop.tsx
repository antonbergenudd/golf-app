import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";

/**
 * Matches legacy `GolfBackdrop`: diagonal base gradient + two radial glows + bottom vignette.
 */
export function FairwayBackdrop() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient
        colors={["#153220", "#0B1A0E", "#050A07"]}
        locations={[0, 0.5, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[StyleSheet.absoluteFill, { backgroundColor: "#153220" }]}
      />
      <Svg
        width="100%"
        height="100%"
        style={StyleSheet.absoluteFill}
        preserveAspectRatio="none"
      >
        <Defs>
          <RadialGradient
            id="fairwayGoldRadial"
            cx="55%"
            cy="2.5%"
            rx="115%"
            ry="115%"
            fx="55%"
            fy="2.5%"
          >
            <Stop
              offset="0%"
              stopColor="rgb(212,175,55)"
              stopOpacity={46 / 255}
            />
            <Stop offset="100%" stopColor="rgb(212,175,55)" stopOpacity={0} />
          </RadialGradient>
          <RadialGradient
            id="fairwayTealRadial"
            cx="0%"
            cy="92%"
            rx="100%"
            ry="100%"
            fx="0%"
            fy="92%"
          >
            <Stop
              offset="0%"
              stopColor="rgb(74,138,158)"
              stopOpacity={31 / 255}
            />
            <Stop offset="100%" stopColor="rgb(74,138,158)" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#fairwayGoldRadial)" />
        <Rect width="100%" height="100%" fill="url(#fairwayTealRadial)" />
      </Svg>
      {/* Bottom vignette — matches Flutter begin bottomCenter → end topCenter, stops 0 / 0.55 */}
      <LinearGradient
        colors={["rgba(0,0,0,0.55)", "rgba(0,0,0,0)"]}
        locations={[0, 0.55]}
        start={{ x: 0.5, y: 1 }}
        end={{ x: 0.5, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

/**
 * Matches legacy `GolfAmbientShapes`: three soft gold blobs (IgnorePointer).
 */
export function FairwayAmbientShapes() {
  const { height: h } = useWindowDimensions();

  const blobs: {
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
    size: number;
    opacity: number;
  }[] = [
    { top: h * 0.06, right: -24, size: 160, opacity: 0.06 },
    { top: h * 0.35, left: -40, size: 200, opacity: 0.045 },
    { bottom: h * 0.12, right: -10, size: 140, opacity: 0.055 },
  ];

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {blobs.map((b, i) => (
        <View
          key={i}
          style={{
            position: "absolute",
            ...(b.top !== undefined ? { top: b.top } : {}),
            ...(b.bottom !== undefined ? { bottom: b.bottom } : {}),
            ...(b.left !== undefined ? { left: b.left } : {}),
            ...(b.right !== undefined ? { right: b.right } : {}),
            width: b.size,
            height: b.size,
            borderRadius: b.size / 2,
            backgroundColor: `rgba(212,175,55,${b.opacity})`,
          }}
        />
      ))}
    </View>
  );
}
