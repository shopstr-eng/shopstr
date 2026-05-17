import { useContext, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { nip19 } from "nostr-tools";
import { CommunityContext } from "@/utils/context/context";
import { Community } from "@/utils/types/types";
import { Spinner } from "@heroui/react";
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
                title: community.name || "Shopstr Community",
                description:
                  community.description ||
                  "Check out this community on Shopstr!",
                image: community.image || "/shopstr-2000x2000.png",
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
        title: "Shopstr Community",
        description: "Check out this community on Shopstr!",
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
      <div className="flex h-screen items-center justify-center">
        <Spinner label="Loading Community..." />
      </div>
    );
  }

  if (!community) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p>Community not found.</p>
      </div>
    );
  }

  return (
    <div className="bg-light-bg dark:bg-dark-bg flex min-h-screen flex-col pt-20">
      <div className="container mx-auto max-w-3xl px-4">
        <div
          className="dark:bg-dark-fg relative mb-8 h-48 w-full rounded-lg bg-cover bg-center"
          style={{ backgroundImage: `url(${sanitizeUrl(community.image)})` }}
        >
          <div className="absolute inset-0 rounded-lg bg-black/30"></div>
        </div>
        <h1 className="text-light-text dark:text-dark-text text-4xl font-bold">
          {community.name}
        </h1>
        <p className="text-light-text/80 dark:text-dark-text/80 mt-2 text-lg">
          {community.description}
        </p>

        <div className="mt-8">
          <CommunityFeed community={community} />
        </div>
      </div>
    </div>
  );
};

export default SingleCommunityPage;
