import React, { useContext, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { nip19 } from "nostr-tools";
import { CommunityContext } from "@/utils/context/context";
import { Community } from "@/utils/types/types";
import { Spinner } from "@nextui-org/react";
import CommunityFeed from "@/components/communities/CommunityFeed";
import { sanitizeUrl } from "@braintree/sanitize-url";

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
          // Find the community by pubkey and d-tag
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
    <div className="flex min-h-screen flex-col bg-light-bg pt-20 dark:bg-dark-bg">
      <div className="container mx-auto max-w-3xl px-4">
        {/* Community Header */}
        <div
          className="relative mb-8 h-48 w-full rounded-lg bg-cover bg-center dark:bg-dark-fg"
          style={{ backgroundImage: `url(${sanitizeUrl(community.image)})` }}
        >
          <div className="absolute inset-0 rounded-lg bg-black/30"></div>
        </div>
        <h1 className="text-4xl font-bold text-light-text dark:text-dark-text">
          {community.name}
        </h1>
        <p className="mt-2 text-lg text-light-text/80 dark:text-dark-text/80">
          {community.description}
        </p>

        {/* Community Feed */}
        <div className="mt-8">
          <CommunityFeed community={community} />
        </div>
      </div>
    </div>
  );
};

export default SingleCommunityPage;
