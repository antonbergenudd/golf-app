import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { GolfChrome } from "@/components/fairway/GolfChrome";
import { AppButton } from "@/components/ui/AppButton";

const CLUBS = [
  "Sandwedge",
  "Pitch",
  "9",
  "8",
  "7",
  "6",
  "5",
  "4",
  "3 wood",
  "Driver",
];

export default function WheelScreen() {
  const p = useLocalSearchParams<{
    playerName?: string;
    autoSpin?: string;
  }>();
  const playerName = p.playerName ? String(p.playerName) : undefined;
  const auto = p.autoSpin === "1" || p.autoSpin === "true";

  const [spinning, setSpinning] = useState(false);
  const [pick, setPick] = useState<string | null>(null);

  useEffect(() => {
    if (auto) {
      const t = setTimeout(spin, 500);
      return () => clearTimeout(t);
    }
  }, [auto]);

  function spin() {
    if (spinning) return;
    setSpinning(true);
    setPick(null);
    const idx = Math.floor(Math.random() * CLUBS.length);
    setTimeout(() => {
      setPick(CLUBS[idx] ?? CLUBS[0]);
      setSpinning(false);
    }, 2200);
  }

  const title = playerName ? `${playerName}'s Wheel` : "Wheel of Doom";

  return (
    <GolfChrome>
      <SafeAreaView className="flex-1" edges={["top", "bottom"]}>
        <View className="flex-row items-center border-b border-[#2A5030]/80 px-4 py-3">
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="chevron-back" size={22} color="#D4AF37" />
          </Pressable>
          <Text className="font-sans flex-1 text-center text-lg font-bold text-white">
            {title}
          </Text>
          <View style={{ width: 22 }} />
        </View>

        <View className="flex-1 items-center justify-center px-8">
          <Text className="font-sans mb-8 text-center text-[15px] leading-relaxed text-[#C8DCC9]">
            {playerName
              ? `${playerName} must use the club shown below.`
              : "Spin for a random club."}
          </Text>

          <View className="mb-10 h-56 w-56 items-center justify-center rounded-full border-4 border-[#D4AF37]/40 bg-[#142918]">
            <Text className="font-sans text-center text-5xl">🎯</Text>
            {pick ? (
              <Text className="font-sans mt-4 text-center text-2xl font-black text-[#D4AF37]">
                {pick}
              </Text>
            ) : (
              <Text className="font-sans mt-4 text-sm text-white/50">
                {spinning ? "Spinning…" : "Tap spin"}
              </Text>
            )}
          </View>

          <AppButton
            label={spinning ? "Spinning…" : "Spin"}
            onPress={spin}
            loading={spinning}
          />
        </View>
      </SafeAreaView>
    </GolfChrome>
  );
}
