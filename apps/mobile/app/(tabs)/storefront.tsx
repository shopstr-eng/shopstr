import { StyleSheet, Text, View } from "react-native";

import { sellerThemeTokens } from "@/theme/tokens";

const storefrontSections = [
  "Branding and profile basics",
  "Policy and shipping details",
  "Storefront sections and layout",
  "Seller onboarding and status",
];

export default function StorefrontScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Storefront placeholder</Text>
      <Text style={styles.description}>
        This tab will become the seller-facing storefront editor once the shared
        domain and form logic are expanded in the next phase.
      </Text>
      <View style={styles.card}>
        {storefrontSections.map((section) => (
          <View key={section} style={styles.sectionRow}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.sectionText}>{section}</Text>
          </View>
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
    gap: 12,
  },
  sectionRow: {
    flexDirection: "row",
    gap: 10,
  },
  bullet: {
    color: sellerThemeTokens.primary,
    fontSize: 18,
    fontWeight: "800",
  },
  sectionText: {
    color: sellerThemeTokens.text,
    fontSize: 15,
    lineHeight: 22,
    flex: 1,
  },
});
