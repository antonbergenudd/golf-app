import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import {
  useGlobalSearchParams,
  useLocalSearchParams,
  usePathname,
  useSegments,
} from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { databaseService } from "@/services/databaseService";
import { loadGameSession } from "@/services/gameSession";
import { Font } from "@/theme/fonts";
import {
  formatVictimAttackOutcome,
  parseAttackOutcomeFromEvent,
} from "@/utils/attackOutcomeMessages";
import { blurActiveElementForModalWeb } from "@/utils/blurForModalWeb";
import { paramFirst, resolveSessionGameId } from "@/utils/resolveSessionGameId";

const GolfColors = {
  gold: "#D4AF37",
  forestDeep: "#071209",
  danger: "#FF5252",
};

/** Events older than this before the current game session began are treated as backlog (no modal). */
const ATTACK_EVENT_BACKLOG_MS = 90_000;

function parseGameEventTimestampMs(ev: Record<string, unknown>): number | null {
  const raw = ev.timestamp ?? ev.created_at;
  if (raw == null) return null;
  if (raw instanceof Date) return raw.getTime();
  const t = Date.parse(String(raw));
  return Number.isFinite(t) ? t : null;
}

function gameEventData(ev: Record<string, unknown>): Record<string, unknown> {
  const raw = ev.event_data ?? ev.eventData;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw === "string") {
    try {
      const m = JSON.parse(raw) as unknown;
      if (m && typeof m === "object" && !Array.isArray(m)) {
        return m as Record<string, unknown>;
      }
    } catch {
      /* ignore */
    }
  }
  return {};
}

function attackTargetPlayerId(d: Record<string, unknown>): string {
  const v = d.targetPlayerId ?? d.target_player_id;
  return v != null ? String(v).trim() : "";
}

function attackCardTitleFromEventData(d: Record<string, unknown>): string {
  const v = d.attackCardTitle ?? d.attack_card_title;
  return v != null ? String(v).trim() : "";
}

function gameEventType(ev: Record<string, unknown>): string {
  return String(ev.event_type ?? ev.eventType ?? "");
}

function gameEventActorId(ev: Record<string, unknown>): string {
  return String(ev.player_id ?? ev.playerId ?? "").trim();
}

/**
 * Full-screen alert for the **target** of an inventory attack. Lives next to
 * `_layout.tsx` so Metro always resolves the import; stays mounted for all game tabs.
 */
export function VictimAttackModalHost() {
  const local = useLocalSearchParams() as Record<string, unknown>;
  const global = useGlobalSearchParams() as Record<string, unknown>;
  const pathname = usePathname();
  const segments = useSegments();

  const sessionRef = useRef({ gameId: "", playerId: "" });

  const resolvedGameId =
    resolveSessionGameId({ local, global, pathname, segments }).trim();
  const resolvedPlayerId =
    paramFirst(local.playerId) || paramFirst(global.playerId);

  if (resolvedGameId) sessionRef.current.gameId = resolvedGameId;
  if (resolvedPlayerId) sessionRef.current.playerId = resolvedPlayerId;

  const gameId = resolvedGameId || sessionRef.current.gameId;
  const playerIdFromParams =
    resolvedPlayerId || sessionRef.current.playerId;

  const [sessionPlayerId, setSessionPlayerId] = useState("");
  const [events, setEvents] = useState<Record<string, unknown>[]>([]);
  const [victimAttackModal, setVictimAttackModal] = useState<{
    title: string;
    body: string;
  } | null>(null);
  const seenGameEventIdsRef = useRef<Set<string>>(new Set());
  const sessionStartMsRef = useRef(Date.now());

  const effectivePlayerId =
    playerIdFromParams.trim() || sessionPlayerId.trim();

  useEffect(() => {
    if (!gameId) {
      setSessionPlayerId("");
      return;
    }
    let cancelled = false;
    void loadGameSession().then((s) => {
      if (cancelled) return;
      const pid = s?.playerId?.trim();
      if (!pid) {
        setSessionPlayerId("");
        return;
      }
      const sg = (s?.gameId ?? "").trim();
      if (sg && sg !== gameId.trim()) {
        setSessionPlayerId("");
        return;
      }
      setSessionPlayerId(pid);
    });
    return () => {
      cancelled = true;
    };
  }, [gameId]);

  useEffect(() => {
    seenGameEventIdsRef.current = new Set();
    sessionStartMsRef.current = Date.now();
    setVictimAttackModal(null);
  }, [gameId]);

  useEffect(() => {
    if (!gameId) return;
    let active = true;
    const u = databaseService.subscribeGameEvents(gameId, (ev) => {
      if (active) setEvents(ev);
    });
    return () => {
      active = false;
      u();
    };
  }, [gameId]);

  useEffect(() => {
    if (!effectivePlayerId) return;

    const sessionStart = sessionStartMsRef.current;
    const backlogCutoff = sessionStart - ATTACK_EVENT_BACKLOG_MS;

    for (const ev of events) {
      const id = String(ev.id ?? "");
      if (!id || seenGameEventIdsRef.current.has(id)) continue;

      if (gameEventType(ev) !== "attack_resolved") {
        seenGameEventIdsRef.current.add(id);
        continue;
      }

      const d = gameEventData(ev);
      const target = attackTargetPlayerId(d);
      if (target !== effectivePlayerId) {
        seenGameEventIdsRef.current.add(id);
        continue;
      }

      if (gameEventActorId(ev) === effectivePlayerId) {
        seenGameEventIdsRef.current.add(id);
        continue;
      }

      const ts = parseGameEventTimestampMs(ev);
      if (ts != null && ts < backlogCutoff) {
        seenGameEventIdsRef.current.add(id);
        continue;
      }

      seenGameEventIdsRef.current.add(id);

      const attackerName = String(ev.player_name ?? "Someone");
      const attackTitle = attackCardTitleFromEventData(d) || "Action";

      const outcome = parseAttackOutcomeFromEvent(d.outcome);
      const copy =
        outcome != null
          ? formatVictimAttackOutcome(outcome, attackerName, attackTitle)
          : {
              title: `${attackerName} targeted you`,
              body: `They used “${attackTitle}”.`,
            };

      blurActiveElementForModalWeb();
      setVictimAttackModal(copy);
      break;
    }
  }, [events, effectivePlayerId]);

  if (!gameId || !effectivePlayerId) return null;

  return (
    <Modal
      visible={victimAttackModal !== null}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => setVictimAttackModal(null)}
    >
      <View style={styles.victimAttackRoot} pointerEvents="box-none">
        <Pressable
          style={styles.victimAttackBackdrop}
          onPress={() => setVictimAttackModal(null)}
          accessibilityLabel="Dismiss"
        />
        <SafeAreaView style={styles.victimAttackSafe} edges={["top", "bottom"]}>
          <View style={styles.victimAttackSheet}>
            <MaterialIcons name="bolt" size={44} color={GolfColors.danger} />
            <Text style={styles.victimAttackTitle}>
              {victimAttackModal?.title ?? ""}
            </Text>
            <Text style={styles.victimAttackBody}>
              {victimAttackModal?.body ?? ""}
            </Text>
            <Pressable
              style={styles.victimAttackDismiss}
              onPress={() => setVictimAttackModal(null)}
              accessibilityRole="button"
              accessibilityLabel="Got it"
            >
              <Text style={styles.victimAttackDismissText}>Got it</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  victimAttackRoot: {
    flex: 1,
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.78)",
  },
  victimAttackBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  victimAttackSafe: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 22,
  },
  victimAttackSheet: {
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "rgba(255,82,82,0.45)",
    backgroundColor: "rgba(15,26,18,0.98)",
    paddingHorizontal: 22,
    paddingVertical: 26,
    alignItems: "center",
    gap: 14,
    shadowColor: GolfColors.danger,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 18,
  },
  victimAttackTitle: {
    fontFamily: Font.bold,
    fontSize: 20,
    color: "#FFFFFF",
    textAlign: "center",
    lineHeight: 26,
  },
  victimAttackBody: {
    fontFamily: Font.regular,
    fontSize: 16,
    lineHeight: 24,
    color: "rgba(184,212,191,0.96)",
    textAlign: "center",
  },
  victimAttackDismiss: {
    alignSelf: "stretch",
    marginTop: 8,
    borderRadius: 14,
    backgroundColor: GolfColors.gold,
    paddingVertical: 14,
    alignItems: "center",
  },
  victimAttackDismissText: {
    fontFamily: Font.bold,
    fontSize: 15,
    color: GolfColors.forestDeep,
  },
});
