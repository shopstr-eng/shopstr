import { Stack } from "expo-router";

import { AppProviders } from "@/components/app-providers";

export { ErrorBoundary } from "expo-router";

export const unstable_settings = {
  initialRouteName: "(tabs)",
};

export default function RootLayout() {
  return (
    <AppProviders>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="sign-in"
          options={{ title: "Seller Sign In", headerBackTitle: "Back" }}
        />
        <Stack.Screen
          name="email-auth"
          options={{ title: "Email Access", headerBackTitle: "Back" }}
        />
        <Stack.Screen
          name="nsec-import"
          options={{ title: "Import nsec", headerBackTitle: "Back" }}
        />
        <Stack.Screen
          name="nsec-create"
          options={{ title: "Create seller key", headerBackTitle: "Back" }}
        />
        <Stack.Screen
          name="phase-one-check"
          options={{ title: "Phase 1 Check", headerBackTitle: "Back" }}
        />
        <Stack.Screen
          name="stripe-connect-return"
          options={{ title: "Stripe Connect", headerShown: false }}
        />
      </Stack>
    </AppProviders>
  );
}
