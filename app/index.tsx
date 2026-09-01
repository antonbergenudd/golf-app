import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useCallback, useEffect, useId, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import Svg, { Defs, G, LinearGradient as SvgLinearGradient, Stop, Text as SvgText } from "react-native-svg";
import { SafeAreaView } from "react-native-safe-area-context";

import { GolfChrome } from "@/components/fairway/GolfChrome";
import { Font } from "@/theme/fonts";
import { databaseService } from "@/services/databaseService";
import {
  clearGameSession,
  loadGameSession,
  type GameSession,
} from "@/services/gameSession";

/** Legacy `GolfColors.mist` @ 0.9 alpha — Fairway kicker */
const mist = "rgba(184,212,191,0.9)";

/** Legacy `_buildHero` title TextStyle + ShaderMask stops */
const HERO_TITLE_SIZE = 44;
const HERO_TITLE_LINE_HEIGHT = HERO_TITLE_SIZE * 1.02;

export default function HomeScreen() {
  const [session, setSession] = useState<GameSession | null>(null);
  const [resuming, setResuming] = useState(false);

  const refreshSession = useCallback(async () => {
    const s = await loadGameSession();
    setSession(s);
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const dismissResume = async () => {
    await clearGameSession();
    setSession(null);
  };

  const resume = async () => {
    const s = session;
    if (!s || resuming) return;
    setResuming(true);
    try {
      const lobby = await databaseService.getLobbyById(s.lobbyId);
      if (!lobby || lobby.status === "closed") {
        await clearGameSession();
        setSession(null);
        Alert.alert("Unavailable", "That lobby is no longer available.");
        return;
      }
      if (lobby.status === "completed") {
        await clearGameSession();
        setSession(null);
        Alert.alert("Ended", "That round has already ended.");
        return;
      }
      if (!lobby.players.some((p) => p.id === s.playerId)) {
        await clearGameSession();
        setSession(null);
        Alert.alert("Unavailable", "You are no longer in that lobby.");
        return;
      }

      const gid = lobby.gameId ?? s.gameId ?? undefined;
      if (lobby.status === "active" && gid) {
        router.push({
          pathname: "/game/[gameId]",
          params: {
            gameId: gid,
            playerId: s.playerId,
            playerName: s.playerName,
            lobbyId: lobby.id,
            lobbyCode: lobby.code,
            lobbyName: lobby.name,
          },
        });
      } else {
        router.push({
          pathname: "/lobby/[lobbyId]",
          params: {
            lobbyId: lobby.id,
            playerId: s.playerId,
            playerName: s.playerName,
          },
        });
      }
      const refreshed = await loadGameSession();
      setSession(refreshed);
    } catch (e) {
      Alert.alert("Resume failed", String(e));
    } finally {
      setResuming(false);
    }
  };

  return (
    <GolfChrome>
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <ScrollView
          style={styles.scrollView}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scrollContent}
          showsHorizontalScrollIndicator={false}
        >
          <View style={styles.homeMainColumn}>
            <View style={styles.heroStack}>
            <HeroEmblem />
            <View style={{ height: 28 }} />
            <Text style={styles.heroFairway}>Fairway</Text>
            <View style={{ height: 6 }} />
            <GradientTitle />
            <View style={{ height: 14 }} />
            <Text style={styles.heroBody}>
              A laid-back party round with cards that bend the rules — easy to
              scan, hard to put down.
            </Text>
            </View>

            {session != null && (
            <>
              <View style={{ height: 22 }} />
              <ResumeSessionCard
                session={session}
                resuming={resuming}
                onResume={resume}
                onDismiss={dismissResume}
              />
            </>
            )}

            <View style={{ height: 32 }} />

            <GameTile
            variant="host"
            title="Host a round"
            subtitle="Create a lobby, share the code, deal the chaos."
            hint="Best for the friend who brought the speaker"
            onPress={() => router.push("/create")}
            />

            <View style={{ height: 10 }} />

            <GameTile
            variant="join"
            title="Join with code"
            subtitle="Already have a lobby? Slip in and grab your bag."
            hint="Quick entry — no account drama"
            onPress={() => router.push("/join")}
            />

            <View style={{ height: 28 }} />
            <Text style={styles.heroFooter}>Cards · twists · bragging rights</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </GolfChrome>
  );
}

function HeroEmblem() {
  return (
    <View style={[styles.heroEmblemOuter, { width: 124, height: 124 }]}>
      <View
        style={{
          position: "absolute",
          width: 124,
          height: 124,
          borderRadius: 62,
          borderWidth: 10,
          borderColor: "rgba(212,175,55,0.12)",
        }}
      />
      <View
        style={{
          width: 100,
          height: 100,
          borderRadius: 50,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.45,
          shadowRadius: 20,
          elevation: 12,
        }}
      >
        <LinearGradient
          colors={["#1E3D26", "#122818"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            width: 100,
            height: 100,
            borderRadius: 50,
            borderWidth: 1.4,
            borderColor: "rgba(212,175,55,0.45)",
            alignItems: "center",
            justifyContent: "center",
            shadowColor: "#D4AF37",
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.22,
            shadowRadius: 28,
            elevation: 14,
          }}
        >
          <MaterialIcons name="golf-course" size={44} color="#D4AF37" />
        </LinearGradient>
      </View>
    </View>
  );
}

function GradientTitle() {
  const { width: screenW } = useWindowDimensions();
  const gradId = `hero_${useId().replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  const w = Math.max(0, screenW - 48);
  const h = Math.ceil(HERO_TITLE_LINE_HEIGHT + 6);

  return (
    <View style={{ width: "100%", alignItems: "center", height: h }}>
      <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        <Defs>
          <SvgLinearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#FFF6D4" />
            <Stop offset="50%" stopColor="#D4AF37" />
            <Stop offset="100%" stopColor="#B8922A" />
          </SvgLinearGradient>
        </Defs>
        <G transform={`translate(${w / 2}, ${h / 2})`}>
          <SvgText
            fill={`url(#${gradId})`}
            fontFamily={Font.black}
            fontSize={HERO_TITLE_SIZE}
            fontWeight="normal"
            letterSpacing={-1.2}
            textAnchor="middle"
            alignmentBaseline="central"
          >
            Chaos
          </SvgText>
        </G>
      </Svg>
    </View>
  );
}

function ResumeSessionCard({
  session,
  resuming,
  onResume,
  onDismiss,
}: {
  session: GameSession;
  resuming: boolean;
  onResume: () => void;
  onDismiss: () => void;
}) {
  const code = session.lobbyCode.trim().toUpperCase();
  const codeLine =
    code.length > 0 ? `Code ${code}` : "Tap to return to your lobby or game";

  return (
    <Pressable
      onPress={resuming ? undefined : onResume}
      disabled={resuming}
      android_ripple={{ color: "rgba(212,175,55,0.12)" }}
      style={({ pressed }) => [
        styles.resumeCardOuter,
        pressed && !resuming ? styles.resumeCardOuterPressed : null,
      ]}
    >
      <View style={styles.resumeCardSurface}>
        <MaterialIcons name="replay" size={28} color="rgba(212,175,55,0.95)" />
        <View style={styles.resumeTextCol}>
          <Text style={styles.tileTitle}>Resume your round</Text>
          <View style={{ height: 4 }} />
          <Text style={styles.tileSubtitle}>{codeLine}</Text>
        </View>
        {resuming ? (
          <View style={styles.resumeSpinnerWrap}>
            <ActivityIndicator size="small" color="#D4AF37" />
          </View>
        ) : (
          <Pressable
            onPress={(e) => {
              e?.stopPropagation?.();
              onDismiss();
            }}
            hitSlop={12}
            accessibilityLabel="Forget this round"
          >
            <MaterialIcons name="close" size={22} color="rgba(255,255,255,0.45)" />
          </Pressable>
        )}
      </View>
    </Pressable>
  );
}

function GameTile({
  variant,
  title,
  subtitle,
  hint,
  onPress,
}: {
  variant: "host" | "join";
  title: string;
  subtitle: string;
  hint: string;
  onPress: () => void;
}) {
  const host = variant === "host";
  const [pressed, setPressed] = useState(false);

  const inner = (
    <View style={styles.tileInner}>
      <View
        style={[
          styles.tileIconWrap,
          host
            ? {
                backgroundColor: "rgba(0,0,0,0.2)",
                borderColor: "rgba(212,175,55,0.35)",
              }
            : {
                backgroundColor: "#1C2E22",
                borderColor: "rgba(255,255,255,0.08)",
              },
        ]}
      >
        <MaterialIcons
          name={host ? "add" : "group-add"}
          size={24}
          color={host ? "#D4AF37" : "#7FA386"}
        />
      </View>
      <View style={{ width: 12 }} />
      <View style={styles.tileTextCol}>
        <Text style={styles.tileTitle}>{title}</Text>
        <View style={{ height: 4 }} />
        <Text style={styles.tileSubtitle}>{subtitle}</Text>
        <View style={{ height: 6 }} />
        <Text style={styles.tileHint}>{hint}</Text>
      </View>
      <View style={{ width: 4 }} />
      <MaterialIcons
        name="arrow-forward"
        size={24}
        color={host ? "rgba(212,175,55,0.9)" : "rgba(255,255,255,0.35)"}
      />
    </View>
  );

  return (
    <View
      style={[
        styles.tileShadow,
        host && {
          shadowColor: "#D4AF37",
          shadowOpacity: pressed ? 0.06 : 0.14,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 0 },
        },
      ]}
    >
      <Pressable
        onPress={onPress}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        android_ripple={{ color: "rgba(212,175,55,0.12)" }}
        style={[
          { transform: [{ scale: pressed ? 0.98 : 1 }] },
          styles.pressAnim,
        ]}
      >
        {host ? (
          <LinearGradient
            colors={["rgba(212,175,55,0.14)", "rgba(20,38,26,0.92)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[
              styles.tileGrad,
              {
                backgroundColor: "rgba(20,38,26,0.92)",
                borderWidth: 1.35,
                borderColor: "rgba(212,175,55,0.55)",
              },
            ]}
          >
            {inner}
          </LinearGradient>
        ) : (
          <View
            style={[
              styles.tileGrad,
              {
                backgroundColor: "rgba(15,26,18,0.88)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.12)",
              },
            ]}
          >
            {inner}
          </View>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  heroFairway: {
    fontFamily: Font.semiBold,
    textAlign: "center",
    fontSize: 13,
    fontWeight: "normal",
    letterSpacing: 3.2,
    color: mist,
    textTransform: "uppercase",
  },
  heroBody: {
    fontFamily: Font.regular,
    maxWidth: 448,
    paddingHorizontal: 8,
    textAlign: "center",
    fontSize: 15,
    fontWeight: "normal",
    lineHeight: 15 * 1.45,
    color: "rgba(255,255,255,0.78)",
    alignSelf: "center",
  },
  heroFooter: {
    fontFamily: Font.regular,
    textAlign: "center",
    fontSize: 12,
    lineHeight: 12 * 1.4,
    letterSpacing: 0.6,
    color: "rgba(107,152,114,0.85)",
  },
  tileTitle: {
    fontFamily: Font.bold,
    fontSize: 16,
    fontWeight: "normal",
    letterSpacing: -0.15,
    color: "#FFFFFF",
  },
  tileSubtitle: {
    fontFamily: Font.regular,
    fontSize: 12.5,
    lineHeight: 12.5 * 1.38,
    fontWeight: "normal",
    color: "rgba(255,255,255,0.72)",
  },
  tileHint: {
    fontFamily: Font.regular,
    fontSize: 10.5,
    fontStyle: "italic",
    fontWeight: "normal",
    color: "rgba(107,152,114,0.95)",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 24,
  },
  homeMainColumn: {
    flex: 1,
    justifyContent: "center",
  },
  heroStack: {
    marginTop: 8,
    alignItems: "center",
  },
  heroEmblemOuter: {
    alignItems: "center",
    justifyContent: "center",
  },
  resumeTextCol: {
    marginLeft: 12,
    minWidth: 0,
    flex: 1,
  },
  resumeSpinnerWrap: {
    padding: 8,
  },
  resumeCardOuter: {
    alignSelf: "stretch",
  },
  resumeCardOuterPressed: {
    opacity: 0.92,
  },
  resumeCardSurface: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 22,
    borderWidth: 1.2,
    borderColor: "rgba(212,175,55,0.4)",
    backgroundColor: "rgba(20,38,26,0.96)",
    paddingLeft: 16,
    paddingTop: 14,
    paddingBottom: 14,
    paddingRight: 10,
    overflow: "hidden",
    shadowColor: "#D4AF37",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.14,
    shadowRadius: 20,
    elevation: 8,
  },
  tileShadow: {
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
    elevation: 12,
  },
  pressAnim: {
    borderRadius: 20,
    overflow: "hidden",
  },
  tileGrad: {
    borderRadius: 20,
    overflow: "hidden",
  },
  tileInner: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 14,
    paddingTop: 13,
    paddingBottom: 13,
    paddingRight: 12,
  },
  tileTextCol: {
    minWidth: 0,
    flex: 1,
  },
  tileIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
