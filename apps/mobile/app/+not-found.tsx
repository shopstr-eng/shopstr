import { Link, Stack } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { sellerThemeTokens } from "@/theme/tokens";

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Not found" }} />
      <View style={styles.container}>
        <Text style={styles.title}>This route does not exist.</Text>
        <Link href="/" style={styles.link}>
          Return to the seller dashboard
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: sellerThemeTokens.background,
    padding: 24,
    gap: 16,
  },
  title: {
    color: sellerThemeTokens.text,
    fontSize: 24,
    fontWeight: "800",
    textAlign: "center",
  },
  link: {
    backgroundColor: sellerThemeTokens.primary,
    color: sellerThemeTokens.surface,
    borderRadius: 14,
    overflow: "hidden",
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontWeight: "700",
  },
});
