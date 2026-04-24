import { useContext } from "react";
import { StorefrontColorScheme } from "@/utils/types/types";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import StallFeed from "@/components/stall/stall-feed";

interface StorefrontMyListingsProps {
  shopPubkey: string;
  colors: StorefrontColorScheme;
}

export default function StorefrontMyListings({
  shopPubkey,
  colors,
}: StorefrontMyListingsProps) {
  const { isLoggedIn, pubkey: userPubkey } = useContext(SignerContext);

  if (!isLoggedIn || userPubkey !== shopPubkey) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center py-24 text-center">
        <h2
          className="font-heading text-2xl font-bold"
          style={{ color: colors.text }}
        >
          Page Not Found
        </h2>
        <p className="mt-2 text-sm" style={{ color: colors.text + "99" }}>
          This page doesn&apos;t exist.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 pt-4 pb-8" style={{ color: colors.text }}>
      <StallFeed />
    </div>
  );
}
