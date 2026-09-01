/**
 * Live activity feed — copy and visuals aligned with design/game_lobby game screen.
 */

export function formatShortRelativeTime(
  iso: unknown,
  nowMs: number = Date.now(),
): string {
  const ms = parseEventTimestampMs(iso);
  if (ms === null) return "—";
  const diffSec = Math.floor((nowMs - ms) / 1000);
  if (diffSec < 12) return "now";
  if (diffSec < 60) return `${diffSec}s`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 48) return `${diffHr}h`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d`;
}

function parseEventTimestampMs(iso: unknown): number | null {
  if (iso == null) return null;
  if (iso instanceof Date) return iso.getTime();
  const s = String(iso);
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

function eventData(ev: Record<string, unknown>): Record<string, unknown> {
  return (ev.event_data as Record<string, unknown>) ?? {};
}

export type LiveEventIconVariant = {
  icon: string;
  bubbleColor: string;
  iconColor: string;
};

/** Visual variant per event — mirrors design (trophy / zap / …). */
export function liveEventIconVariant(eventType: string): LiveEventIconVariant {
  switch (eventType) {
    case "challenge_claimed":
    case "challenge_verification_confirmed":
      return {
        icon: "emoji-events",
        bubbleColor: "rgba(212,175,55,0.22)",
        iconColor: "#D4AF37",
      };
    case "challenge_verification_requested":
      return {
        icon: "hourglass-empty",
        bubbleColor: "rgba(107,152,114,0.22)",
        iconColor: "#6B9872",
      };
    case "challenge_verification_failed":
      return {
        icon: "thumb-down",
        bubbleColor: "rgba(255,82,82,0.16)",
        iconColor: "#FF8A80",
      };
    case "hole_changed":
      return {
        icon: "flag",
        bubbleColor: "rgba(107,152,114,0.18)",
        iconColor: "#7FA386",
      };
    case "passive_effect_resolved":
      return {
        icon: "flash-on",
        bubbleColor: "rgba(255,82,82,0.18)",
        iconColor: "#FF7070",
      };
    case "attack_resolved":
      return {
        icon: "bolt",
        bubbleColor: "rgba(255,82,82,0.2)",
        iconColor: "#FF8A80",
      };
    default:
      return {
        icon: "radio-button-checked",
        bubbleColor: "rgba(212,175,55,0.14)",
        iconColor: "#D4AF37",
      };
  }
}

export type LiveEventCopy =
  | {
      kind: "system";
      line: string;
      accent?: string;
    }
  | {
      kind: "player";
      name: string;
      before: string;
      accent?: string;
      after?: string;
    };

export function buildLiveEventCopy(ev: Record<string, unknown>): LiveEventCopy {
  const type = String(ev.event_type ?? "");
  const d = eventData(ev);
  const name = String(ev.player_name ?? "Someone");

  if (String(ev.player_id ?? "") === "system") {
    if (type === "hole_changed") {
      const hole = String(d.newHole ?? "?");
      return {
        kind: "system",
        line: "Now on hole ",
        accent: hole,
      };
    }
    return {
      kind: "system",
      line: type.replace(/_/g, " ") || "Update",
    };
  }

  switch (type) {
    case "challenge_verification_requested": {
      const title = d.title != null ? String(d.title) : "Challenge";
      const deputy = d.deputyName != null ? String(d.deputyName) : "";
      if (deputy) {
        return {
          kind: "player",
          name,
          before: "attempts ",
          accent: title,
          after: ` · Fighter: ${deputy}`,
        };
      }
      return {
        kind: "player",
        name,
        before: "attempts ",
        accent: title,
      };
    }
    case "challenge_claimed": {
      const pts = Number(d.pointsAwarded ?? 0);
      const verifiedBy = d.verifiedBy != null ? String(d.verifiedBy) : "";
      if (pts > 0 && verifiedBy) {
        return {
          kind: "player",
          name,
          before: "completed · ",
          accent: `+${pts}`,
          after: ` · ${verifiedBy}`,
        };
      }
      if (pts > 0) {
        return {
          kind: "player",
          name,
          before: "completed ",
          accent: `+${pts} pts`,
        };
      }
      return {
        kind: "player",
        name,
        before: "challenge completed",
      };
    }
    case "challenge_verification_confirmed": {
      const title = d.title != null ? String(d.title) : "Challenge";
      return {
        kind: "player",
        name,
        before: "confirmed ",
        accent: title,
      };
    }
    case "challenge_verification_failed": {
      const title = d.title != null ? String(d.title) : "Challenge";
      return {
        kind: "player",
        name,
        before: "marked ",
        accent: title,
        after: " failed",
      };
    }
    case "attack_resolved": {
      const atkTitle =
        d.attackCardTitle != null ? String(d.attackCardTitle) : "Action";
      const victim =
        d.targetPlayerName != null ? String(d.targetPlayerName) : "a player";
      return {
        kind: "player",
        name,
        before: "played ",
        accent: atkTitle,
        after: ` on ${victim}`,
      };
    }
    case "passive_effect_resolved": {
      const cardTitle =
        d.cardTitle != null ? String(d.cardTitle) : "Card effect";
      const wr = d.wheelResult;
      const spin =
        wr != null && typeof wr === "object"
          ? String((wr as Record<string, unknown>).label ?? "")
          : wr != null
            ? String(wr)
            : "";
      if (spin) {
        return {
          kind: "player",
          name,
          before: "resolved ",
          accent: cardTitle,
          after: ` · ${spin}`,
        };
      }
      return {
        kind: "player",
        name,
        before: "resolved ",
        accent: cardTitle,
      };
    }
    default:
      return {
        kind: "player",
        name,
        before: type.replace(/_/g, " ") || "Event",
      };
  }
}
