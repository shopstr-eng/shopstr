import { StyleSheet, Text, View } from "react-native";

import {
  ActionButton,
  EmptyState,
  ScreenScrollView,
  ScreenTitle,
  SellerCard,
  StatusPill,
} from "@/components/seller-ui";
import LoadingScreen from "@/components/loading-screen";
import { useSellerListings } from "@/hooks/use-seller-bootstrap";
import { getErrorMessage } from "@/lib/error-utils";
import { useSessionStore } from "@/stores/session-store";
import { sellerThemeTokens } from "@/theme/tokens";

function formatPrice(price: number | null, currency: string | null): string {
  if (price === null || !currency) {
    return "No price tag";
  }

  return `${price.toFixed(2)} ${currency}`;
}

export default function ListingsScreen() {
  const session = useSessionStore((state) => state.session);
  const listingsQuery = useSellerListings(session?.pubkey);

  if (!session) {
    return null;
  }

  if (listingsQuery.isLoading && !listingsQuery.data) {
    return <LoadingScreen message="Loading seller listings..." />;
  }

  if (listingsQuery.isError && !listingsQuery.data) {
    return (
      <ScreenScrollView>
        <ScreenTitle
          eyebrow="Seller listings"
          title="Listings unavailable"
          description="The read-only seller listing overview could not be loaded yet."
        />
        <SellerCard title="Could not load seller listings">
          <Text style={styles.errorText}>
            {getErrorMessage(
              listingsQuery.error,
              "Seller listings could not be loaded right now."
            )}
          </Text>
          <ActionButton
            label="Retry listings"
            onPress={async () => {
              await listingsQuery.refetch();
            }}
            variant="secondary"
            loading={listingsQuery.isFetching}
          />
        </SellerCard>
      </ScreenScrollView>
    );
  }

  return (
    <ScreenScrollView>
      <ScreenTitle
        eyebrow="Seller listings"
        title="Read-only listing overview"
        description="Phase 2 intentionally stops at visibility. Listing CRUD, password gates, and publish controls land in the next phase."
      />

      <SellerCard
        title="Current listing count"
        description="The data comes from cached product events and is filtered by the current seller pubkey."
      >
        <Text style={styles.countText}>
          {listingsQuery.data?.length ?? 0} listings
        </Text>
        {listingsQuery.isError ? (
          <Text style={styles.errorText}>
            {getErrorMessage(
              listingsQuery.error,
              "Seller listings may be stale because the refresh failed."
            )}
          </Text>
        ) : null}
      </SellerCard>

      {!listingsQuery.data || listingsQuery.data.length === 0 ? (
        <EmptyState
          title="No seller listings yet"
          description="Your current seller account has no cached listings. Phase 3 will add native product create/edit/publish flows."
        />
      ) : (
        listingsQuery.data.map((listing) => (
          <SellerCard
            key={listing.id}
            title={listing.title}
            description={`Primary category: ${listing.primaryCategory ?? "Uncategorized"}`}
          >
            <View style={styles.rowBetween}>
              <Text style={styles.metaLabel}>Status</Text>
              <StatusPill
                tone={listing.status === "active" ? "success" : "warning"}
                label={listing.status}
              />
            </View>
            <View style={styles.rowBetween}>
              <Text style={styles.metaLabel}>Price</Text>
              <Text style={styles.metaValue}>
                {formatPrice(listing.price, listing.currency)}
              </Text>
            </View>
            <View style={styles.rowBetween}>
              <Text style={styles.metaLabel}>Created</Text>
              <Text style={styles.metaValue}>
                {new Date(listing.createdAt * 1000).toLocaleDateString()}
              </Text>
            </View>
            <View style={styles.categoriesWrap}>
              {listing.categories.length > 0 ? (
                listing.categories.map((category) => (
                  <View
                    key={`${listing.id}-${category}`}
                    style={styles.categoryChip}
                  >
                    <Text style={styles.categoryChipText}>{category}</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.metaValue}>No categories tagged</Text>
              )}
            </View>
          </SellerCard>
        ))
      )}
    </ScreenScrollView>
  );
}

const styles = StyleSheet.create({
  countText: {
    color: sellerThemeTokens.text,
    fontSize: 30,
    fontWeight: "800",
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
  },
  metaLabel: {
    color: sellerThemeTokens.mutedText,
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  metaValue: {
    color: sellerThemeTokens.text,
    fontSize: 15,
    fontWeight: "600",
  },
  errorText: {
    color: sellerThemeTokens.danger,
    fontSize: 14,
    lineHeight: 20,
  },
  categoriesWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: sellerThemeTokens.subduedSurface,
  },
  categoryChipText: {
    color: sellerThemeTokens.text,
    fontSize: 12,
    fontWeight: "700",
  },
});
