import { Tabs } from "expo-router";

import { sellerThemeTokens } from "@/theme/tokens";

export default function SellerTabsLayout() {
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
          title: "Storefront",
          tabBarLabel: "Storefront",
        }}
      />
    </Tabs>
  );
}
