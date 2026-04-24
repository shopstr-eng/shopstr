import { Redirect, Tabs, type Href } from "expo-router";

import LoadingScreen from "@/components/loading-screen";
import { useSessionStore } from "@/stores/session-store";
import { sellerThemeTokens } from "@/theme/tokens";

export default function SellerTabsLayout() {
  const hydrated = useSessionStore((state) => state.hydrated);
  const session = useSessionStore((state) => state.session);

  if (!hydrated) {
    return <LoadingScreen message="Loading seller workspace..." />;
  }

  if (!session) {
    return <Redirect href={"/sign-in" as Href} />;
  }

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: sellerThemeTokens.background },
        headerTintColor: sellerThemeTokens.text,
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: sellerThemeTokens.background },
        tabBarActiveTintColor: sellerThemeTokens.primary,
        tabBarInactiveTintColor: sellerThemeTokens.mutedText,
        tabBarStyle: { backgroundColor: sellerThemeTokens.surface },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Dashboard",
          tabBarLabel: "Dashboard",
        }}
      />
      <Tabs.Screen
        name="listings"
        options={{
          title: "Listings",
          tabBarLabel: "Listings",
        }}
      />
      <Tabs.Screen
        name="storefront"
        options={{
          title: "Stall",
          tabBarLabel: "Stall",
        }}
      />
    </Tabs>
  );
}
