/* eslint-disable @next/next/no-img-element */

import { useEffect } from "react";
import HomeFeed from "@/components/home/home-feed";
import { GetServerSideProps } from "next";
import { OgMetaProps, DEFAULT_OG } from "@/components/og-head";
import { nip19 } from "nostr-tools";
import {
  fetchShopProfileByPubkeyFromDb,
  fetchProfilePubkeyByNameSlug,
} from "@/utils/db/db-service";
import { NostrEvent } from "@/utils/types/types";

type MarketplacePageProps = {
  ogMeta: OgMetaProps;
  focusedPubkey: string;
  setFocusedPubkey: (value: string) => void;
  selectedSection: string;
  setSelectedSection: (value: string) => void;
};

function shopEventToOgMeta(
  shopEvent: NostrEvent,
  urlPath: string
): OgMetaProps {
  try {
    const content = JSON.parse(shopEvent.content);
    return {
      title: content.name ? `${content.name} Shop` : "Shopstr Shop",
      description: content.about || "Check out this shop on Shopstr!",
      image: content.ui?.picture || "/shopstr-2000x2000.png",
      url: urlPath,
    };
  } catch {
    return {
      ...DEFAULT_OG,
      title: "Shopstr Shop",
      description: "Check out this shop on Shopstr!",
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
        title: "Shopstr Shop",
        description: "Check out this shop on Shopstr!",
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
  useEffect(() => {
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("sf_seller_pubkey");
      sessionStorage.removeItem("sf_shop_slug");
      localStorage.removeItem("sf_seller_pubkey");
      localStorage.removeItem("sf_shop_slug");
    }
  }, []);

  return (
    <>
      {!focusedPubkey && (
        <div className="flex h-auto w-full items-center justify-center bg-white bg-cover bg-center pt-20 dark:bg-black">
          <img
            src="/shop-freely-light.png"
            alt="Shopstr Banner"
            className="hidden max-h-[210px] w-full items-center justify-center object-cover dark:hidden sm:flex"
          />
          <img
            src="/shop-freely-dark.png"
            alt="Shopstr Banner"
            className="hidden max-h-[210px] w-full items-center justify-center object-cover sm:hidden dark:sm:flex"
          />
          <img
            src="/shop-freely-light-sm.png"
            alt="Shopstr Banner"
            className="flex max-h-[210px] w-full items-center justify-center object-cover pb-4 dark:hidden sm:hidden"
          />
          <img
            src="/shop-freely-dark-sm.png"
            alt="Shopstr Banner"
            className="hidden max-h-[210px] w-full items-center justify-center object-cover pb-4 dark:flex dark:sm:hidden"
          />
        </div>
      )}
      <div
        className={`flex h-full min-h-screen flex-col bg-light-bg dark:bg-dark-bg ${
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
