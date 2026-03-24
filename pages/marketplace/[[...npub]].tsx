/* eslint-disable @next/next/no-img-element */

import HomeFeed from "@/components/home/home-feed";
import { GetServerSideProps } from "next";
import { OgMetaProps, DEFAULT_OG } from "@/components/og-head";
import { nip19 } from "nostr-tools";
import {
  fetchShopProfileByPubkeyFromDb,
  fetchProfilePubkeyByNameSlug,
} from "@/utils/db/db-service";

type MarketplacePageProps = {
  ogMeta: OgMetaProps;
  focusedPubkey: string;
  setFocusedPubkey: (value: string) => void;
  selectedSection: string;
  setSelectedSection: (value: string) => void;
};

function shopEventToOgMeta(
  shopEvent: import("@/utils/types/types").NostrEvent,
  urlPath: string
): OgMetaProps {
  try {
    const content = JSON.parse(shopEvent.content);
    return {
      title: content.name ? `${content.name} Shop` : "Milk Market Shop",
      description: content.about || "Check out this shop on Milk Market!",
      image: content.ui?.picture || "/milk-market.png",
      url: urlPath,
    };
  } catch {
    return {
      ...DEFAULT_OG,
      title: "Milk Market Shop",
      description: "Check out this shop on Milk Market!",
      url: urlPath,
    };
  }
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { npub } = context.query;
  const identifier = Array.isArray(npub) ? npub[0] : npub;

  if (!identifier) {
    return { props: { ogMeta: DEFAULT_OG } };
  }

  const urlPath = `/marketplace/${identifier}`;

  try {
    let pubkey: string | null = null;

    if (identifier.startsWith("npub1")) {
      try {
        const decoded = nip19.decode(identifier);
        if (decoded.type === "npub") {
          pubkey = decoded.data as string;
        }
      } catch {}
    } else {
      pubkey = await fetchProfilePubkeyByNameSlug(identifier);
    }

    if (pubkey) {
      const shopEvent = await fetchShopProfileByPubkeyFromDb(pubkey);
      if (shopEvent) {
        return { props: { ogMeta: shopEventToOgMeta(shopEvent, urlPath) } };
      }
    }
  } catch (error) {
    console.error("SSR OG fetch error for marketplace:", error);
  }

  return {
    props: {
      ogMeta: {
        ...DEFAULT_OG,
        title: "Milk Market Shop",
        description: "Check out this shop on Milk Market!",
        url: urlPath,
      },
    },
  };
};

export default function SellerView({
  focusedPubkey,
  setFocusedPubkey,
  selectedSection,
  setSelectedSection,
}: MarketplacePageProps) {
  return (
    <>
      {!focusedPubkey && (
        <div className="flex h-auto w-full items-center justify-center bg-black bg-cover bg-center pt-20">
          <img
            src="/free-milk.png"
            alt="Milk Market Banner"
            className="max-h-[300px] w-full items-center justify-center object-contain py-8"
          />
        </div>
      )}
      <div
        className={`flex h-full min-h-screen flex-col bg-white ${
          focusedPubkey ? "pt-20" : ""
        }`}
      >
        <HomeFeed
          focusedPubkey={focusedPubkey}
          setFocusedPubkey={setFocusedPubkey}
          selectedSection={selectedSection}
          setSelectedSection={setSelectedSection}
        />
      </div>
    </>
  );
}
