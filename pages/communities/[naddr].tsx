import { useContext, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { nip19 } from "nostr-tools";
import { CommunityContext } from "@/utils/context/context";
import { Community } from "@/utils/types/types";
import MilkMarketSpinner from "@/components/utility-components/mm-spinner";
import CommunityFeed from "@/components/communities/CommunityFeed";
import { sanitizeUrl } from "@braintree/sanitize-url";
import { GetServerSideProps } from "next";
import { OgMetaProps, DEFAULT_OG } from "@/components/og-head";
import { fetchCommunityByPubkeyAndIdentifier } from "@/utils/db/db-service";
import { parseCommunityEvent } from "@/utils/parsers/community-parser-functions";

type CommunityPageProps = {
  ogMeta: OgMetaProps;
};

export const getServerSideProps: GetServerSideProps<
  CommunityPageProps
> = async (context) => {
  const { naddr } = context.query;
  const naddrStr = typeof naddr === "string" ? naddr : "";

  if (!naddrStr) {
    return { props: { ogMeta: DEFAULT_OG } };
  }

  try {
    const decoded = nip19.decode(naddrStr);
    if (decoded.type === "naddr") {
      const { pubkey, identifier } = decoded.data;
      const event = await fetchCommunityByPubkeyAndIdentifier(
        pubkey,
        identifier
      );
      if (event) {
        const community = parseCommunityEvent(event);
        if (community) {
          return {
            props: {
              ogMeta: {
                title: community.name || "Milk Market Community",
                description:
                  community.description ||
                  "Check out this community on Milk Market!",
                image: community.image || "/milk-market.png",
                url: `/communities/${naddrStr}`,
              },
            },
          };
        }
      }
    }
  } catch (error) {
    console.error("SSR OG fetch error for community:", error);
  }

  return {
    props: {
      ogMeta: {
        ...DEFAULT_OG,
        title: "Milk Market Community",
        description: "Check out this community on Milk Market!",
        url: `/communities/${naddrStr}`,
      },
    },
  };
};

const SingleCommunityPage = () => {
  const router = useRouter();
  const { naddr } = router.query;
  const { communities } = useContext(CommunityContext);
  const [community, setCommunity] = useState<Community | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (naddr && typeof naddr === "string" && communities.size > 0) {
      try {
        const decoded = nip19.decode(naddr);
        if (decoded.type === "naddr") {
          const { pubkey, identifier } = decoded.data;
          for (const c of communities.values()) {
            if (c.pubkey === pubkey && c.d === identifier) {
              setCommunity(c);
              break;
            }
          }
        }
      } catch (e) {
        console.error("Failed to decode naddr:", e);
      } finally {
        setIsLoading(false);
      }
    } else if (communities.size > 0) {
      setIsLoading(false);
    }
  }, [naddr, communities]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-white">
        <MilkMarketSpinner label="Loading Community..." />
      </div>
    );
  }

  if (!community) {
    return (
      <div className="flex h-screen items-center justify-center bg-white">
        <p className="text-xl font-bold text-black">Community not found.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-white pt-20">
      <div className="container mx-auto max-w-3xl px-4 py-8">
        {/* Community Header - Neo-brutalist Banner */}
        <div className="shadow-neo mb-8 overflow-hidden rounded-lg border-4 border-black">
          {community.image ? (
            <div
              className="relative h-48 w-full bg-cover bg-center"
              style={{
                backgroundImage: `url(${sanitizeUrl(community.image)})`,
              }}
            >
              <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/50"></div>
            </div>
          ) : (
            <div className="flex h-48 w-full items-center justify-center bg-gray-200">
              <p className="text-2xl font-bold tracking-wide text-gray-600 uppercase">
                Community Banner
              </p>
            </div>
          )}
        </div>

        <h1 className="mb-2 text-4xl font-bold text-black">{community.name}</h1>
        <p className="mb-8 text-lg text-gray-700">{community.description}</p>

        {/* Community Feed */}
        <div className="mt-8">
          <CommunityFeed community={community} />
        </div>
      </div>
    </div>
  );
};

export default SingleCommunityPage;
