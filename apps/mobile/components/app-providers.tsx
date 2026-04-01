import { DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import type { PropsWithChildren } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

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

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <SafeAreaProvider>
      <ThemeProvider value={sellerNavigationTheme}>
        <StatusBar style="dark" />
        {children}
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
