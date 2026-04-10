import { DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { QueryClientProvider } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import type { PropsWithChildren } from "react";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import LoadingScreen from "@/components/loading-screen";
import { queryClient } from "@/lib/query-client";
import { useSessionStore } from "@/stores/session-store";
import { sellerThemeTokens } from "@/theme/tokens";

const sellerNavigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: sellerThemeTokens.primary,
    background: sellerThemeTokens.background,
    card: sellerThemeTokens.surface,
    text: sellerThemeTokens.text,
    border: sellerThemeTokens.border,
    notification: sellerThemeTokens.accent,
  },
};

function SessionBootstrap({ children }: PropsWithChildren) {
  const hydrated = useSessionStore((state) => state.hydrated);
  const hydrate = useSessionStore((state) => state.hydrate);

  useEffect(() => {
    hydrate().catch((error) => {
      console.error("Failed to restore seller session:", error);
    });
  }, [hydrate]);

  if (!hydrated) {
    return <LoadingScreen message="Restoring seller session..." />;
  }

  return children;
}

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider value={sellerNavigationTheme}>
          <StatusBar style="dark" />
          <SessionBootstrap>{children}</SessionBootstrap>
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
