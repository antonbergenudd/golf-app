import { LinearGradient } from "expo-linear-gradient";
import { ReactNode } from "react";
import { View } from "react-native";

export function GolfChrome({ children }: { children: ReactNode }) {
  return (
    <View className="flex-1 bg-[#071209]">
      <LinearGradient
        colors={["#153220", "#0B1A0E", "#050A07"]}
        locations={[0, 0.5, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
      />
      <View className="pointer-events-none absolute inset-0 opacity-30">
        <LinearGradient
          colors={["rgba(212,175,55,0.18)", "transparent"]}
          style={{ position: "absolute", left: "10%", top: "-10%", width: 200, height: 200, borderRadius: 100 }}
        />
      </View>
      {children}
    </View>
  );
}
