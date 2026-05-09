export type GameMode = "classic" | "beer_run";

export function parseGameMode(value: unknown): GameMode {
  if (value === "beer_run") return "beer_run";
  return "classic";
}

export function gameModeValue(mode: GameMode): string {
  return mode === "beer_run" ? "beer_run" : "classic";
}

export function gameModeName(mode: GameMode): string {
  return mode === "beer_run" ? "Beer Run" : "Classic";
}

export function gameCurrencyLabel(
  mode: GameMode,
  opts?: { short?: boolean; amount?: number },
): string {
  const short = opts?.short ?? false;
  if (mode === "beer_run") return short ? "sips" : "sips";
  if (opts?.amount === 1) return "point";
  return short ? "pts" : "points";
}

export function gameBankTitle(mode: GameMode): string {
  return mode === "beer_run" ? "Beer Bank" : "Bank";
}
