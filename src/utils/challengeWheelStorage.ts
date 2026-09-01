import AsyncStorage from "@react-native-async-storage/async-storage";

export function challengeWheelDoneKey(gameId: string, cardId: string) {
  return `challenge_wheel_done_${gameId}_${cardId}`;
}

export function challengeWheelClubKey(gameId: string, cardId: string) {
  return `challenge_wheel_club_${gameId}_${cardId}`;
}

/** Persists spin completion + chosen club for Wheel of Doom challenges (local only). */
export async function persistChallengeWheelSpin(
  gameId: string,
  cardId: string,
  clubLabel: string,
) {
  const gid = gameId.trim();
  const cid = cardId.trim();
  const club = clubLabel.trim();
  if (!gid || !cid || !club) return;
  await AsyncStorage.multiSet([
    [challengeWheelDoneKey(gid, cid), "1"],
    [challengeWheelClubKey(gid, cid), club],
  ]);
}

export async function clearChallengeWheelLocalState(
  gameId: string,
  cardId: string,
) {
  await AsyncStorage.multiRemove([
    challengeWheelDoneKey(gameId, cardId),
    challengeWheelClubKey(gameId, cardId),
  ]);
}

export async function getChallengeWheelClub(
  gameId: string,
  cardId: string,
): Promise<string | null> {
  return AsyncStorage.getItem(challengeWheelClubKey(gameId, cardId));
}

export async function hasChallengeWheelSpinDone(
  gameId: string,
  cardId: string,
): Promise<boolean> {
  const v = await AsyncStorage.getItem(challengeWheelDoneKey(gameId, cardId));
  return v != null && v !== "";
}
