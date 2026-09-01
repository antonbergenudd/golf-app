import { useEffect } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

/**
 * Legacy route: verifications live under the game session tabs so the bottom bar
 * stays visible. Old links to `/verifications` redirect here.
 */
export default function VerificationsRedirectScreen() {
  const p = useLocalSearchParams();

  useEffect(() => {
    const gameId = String(p.gameId ?? "");
    if (!gameId) {
      router.replace("/");
      return;
    }
    router.replace({
      pathname: "/game/[gameId]/verifications",
      params: {
        gameId,
        playerId: String(p.playerId ?? ""),
        lobbyId: String(p.lobbyId ?? ""),
        playerName: String(p.playerName ?? "Player"),
        lobbyName: String(p.lobbyName ?? ""),
      },
    });
  }, [p.gameId, p.playerId, p.lobbyId, p.playerName, p.lobbyName]);

  return <View style={{ flex: 1 }} />;
}
