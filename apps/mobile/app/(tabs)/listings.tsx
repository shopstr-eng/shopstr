import { StyleSheet, Text, View } from "react-native";

import { CATEGORIES } from "@milk-market/domain";

import { sellerThemeTokens } from "@/theme/tokens";

export default function ListingsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Listings placeholder</Text>
      <Text style={styles.description}>
        Phase 2 will turn this into the seller catalog manager. For now it
        confirms Expo Router tabs and shared imports are wired correctly.
      </Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Planned seller actions</Text>
        {[
          "View seller listings",
          "Create or edit products",
          "Publish or unpublish inventory",
          `Start with categories like ${CATEGORIES.slice(0, 3).join(", ")}`,
        ].map((item) => (
          <Text key={item} style={styles.listItem}>
            • {item}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: sellerThemeTokens.background,
    padding: 20,
    gap: 16,
  },
  title: {
    color: sellerThemeTokens.text,
    fontSize: 26,
    fontWeight: "800",
  },
  description: {
    color: sellerThemeTokens.mutedText,
    fontSize: 16,
    lineHeight: 24,
  },
  card: {
    backgroundColor: sellerThemeTokens.surface,
    borderColor: sellerThemeTokens.border,
    borderWidth: 1,
    borderRadius: 18,
    padding: 18,
    gap: 10,
  },
  cardTitle: {
    color: sellerThemeTokens.text,
    fontSize: 18,
    fontWeight: "700",
  },
  listItem: {
    color: sellerThemeTokens.text,
    fontSize: 15,
    lineHeight: 22,
  },
});
