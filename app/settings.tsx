import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { GolfChrome } from "@/components/fairway/GolfChrome";

export default function SettingsScreen() {
  return (
    <GolfChrome>
      <SafeAreaView className="flex-1" edges={["top"]}>
        <View className="flex-row items-center border-b border-[#2A5030]/80 px-4 py-3">
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="chevron-back" size={22} color="#D4AF37" />
          </Pressable>
          <Text className="font-sans flex-1 text-center text-lg font-bold text-white">
            Settings
          </Text>
          <View style={{ width: 22 }} />
        </View>
        <View className="flex-1 items-center justify-center px-8">
          <Text className="font-sans text-center text-base text-white/70">
            Settings coming soon
          </Text>
        </View>
      </SafeAreaView>
    </GolfChrome>
  );
}
