import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useFocusEffect } from "expo-router";

export type GameFabRegistration = {
  digit: string;
  scoredLook: boolean;
  caption: string;
  captionEntered: boolean;
  onPress: () => void;
  accessibilityLabel: string;
};

export type GameTabRouteName =
  "index" | "inventory" | "scorecard" | "verifications";

type GameShellValue = {
  setFabForRoute: (route: GameTabRouteName, reg: GameFabRegistration) => void;
  clearFabForRoute: (route: GameTabRouteName) => void;
  getFabForRoute: (route: GameTabRouteName) => GameFabRegistration | undefined;
};

const GameShellContext = createContext<GameShellValue | null>(null);

export function GameShellProvider({ children }: { children: ReactNode }) {
  const [fabByRoute, setFabByRoute] = useState<
    Partial<Record<GameTabRouteName, GameFabRegistration>>
  >({});

  const setFabForRoute = useCallback(
    (route: GameTabRouteName, reg: GameFabRegistration) => {
      setFabByRoute((prev) => ({ ...prev, [route]: reg }));
    },
    [],
  );

  const clearFabForRoute = useCallback((route: GameTabRouteName) => {
    setFabByRoute((prev) => {
      if (prev[route] == null) return prev;
      const next = { ...prev };
      delete next[route];
      return next;
    });
  }, []);

  const getFabForRoute = useCallback(
    (route: GameTabRouteName) => fabByRoute[route],
    [fabByRoute],
  );

  const value = useMemo(
    () => ({
      setFabForRoute,
      clearFabForRoute,
      getFabForRoute,
    }),
    [setFabForRoute, clearFabForRoute, getFabForRoute],
  );

  return (
    <GameShellContext.Provider value={value}>
      {children}
    </GameShellContext.Provider>
  );
}

export function useGameShell() {
  const ctx = useContext(GameShellContext);
  if (!ctx) {
    throw new Error("useGameShell must be used within GameShellProvider");
  }
  return ctx;
}

/** While this screen is focused, exposes FAB state to the shared session tab bar. */
export function useRegisterGameTabFab(
  routeName: GameTabRouteName,
  registration: GameFabRegistration,
) {
  const { setFabForRoute, clearFabForRoute } = useGameShell();

  useFocusEffect(
    useCallback(() => {
      setFabForRoute(routeName, registration);
      return () => clearFabForRoute(routeName);
    }, [routeName, registration, setFabForRoute, clearFabForRoute]),
  );
}
