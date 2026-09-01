import "./nativewind-setup";
import "../global.css";

import {
  Roboto_400Regular,
  Roboto_500Medium,
  Roboto_600SemiBold,
  Roboto_700Bold,
  Roboto_900Black,
  useFonts,
} from "@expo-google-fonts/roboto";
import { type ErrorBoundaryProps, Stack, router } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import { ensureAuthSession } from "@/lib/auth";
import { clearGameSession } from "@/services/gameSession";

void SplashScreen.preventAutoHideAsync();
// Warm the anonymous session early so create/join don't wait on it.
void ensureAuthSession();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Roboto_400Regular,
    Roboto_500Medium,
    Roboto_600SemiBold,
    Roboto_700Bold,
    Roboto_900Black,
  });

  useEffect(() => {
    if (fontsLoaded) {
      void SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: "slide_from_right",
          contentStyle: {
            backgroundColor: "#071209",
            flex: 1,
          },
        }}
      />
    </SafeAreaProvider>
  );
}

/**
 * Expo Router renders this instead of hard-crashing when any screen throws
 * during render. Catches the broad "undefined is not an object" class that
 * would otherwise kill a release build (App Store rejections cite crashes).
 * Does not catch native module crashes.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <SafeAreaProvider>
      <SafeAreaView
        style={{ flex: 1, backgroundColor: "#071209" }}
        edges={["top", "bottom"]}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: "center",
            padding: 28,
          }}
        >
          <Text
            style={{
              color: "#D4AF37",
              fontSize: 22,
              fontWeight: "700",
              marginBottom: 10,
            }}
          >
            Something went wrong
          </Text>
          <Text
            style={{
              color: "rgba(255,255,255,0.8)",
              fontSize: 15,
              lineHeight: 22,
            }}
          >
            The round hit a snag. Try again, or head back to the start.
          </Text>
          <Text
            style={{
              color: "rgba(255,255,255,0.4)",
              fontSize: 12,
              marginTop: 14,
              fontFamily: "Roboto_400Regular",
            }}
          >
            {String(error?.message ?? error ?? "Unknown error")}
          </Text>

          <View style={{ height: 28 }} />
          <Pressable
            onPress={retry}
            accessibilityRole="button"
            style={{
              backgroundColor: "#D4AF37",
              borderRadius: 14,
              paddingVertical: 15,
              alignItems: "center",
            }}
          >
            <Text style={{ color: "#071209", fontWeight: "700", fontSize: 15 }}>
              Try again
            </Text>
          </Pressable>
          <View style={{ height: 12 }} />
          <Pressable
            onPress={() => {
              void clearGameSession();
              router.replace("/");
            }}
            accessibilityRole="button"
            style={{
              borderWidth: 1,
              borderColor: "rgba(212,175,55,0.4)",
              borderRadius: 14,
              paddingVertical: 15,
              alignItems: "center",
            }}
          >
            <Text style={{ color: "#D4AF37", fontWeight: "600", fontSize: 15 }}>
              Back to start
            </Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
