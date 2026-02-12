import React, { useContext, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { nip19 } from "nostr-tools";
import { CommunityContext } from "@/utils/context/context";
import { Community } from "@/utils/types/types";
import { Spinner } from "@nextui-org/react";
import CommunityFeed from "@/components/communities/CommunityFeed";
import { sanitizeUrl } from "@braintree/sanitize-url";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";

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
      <div className="flex h-screen items-center justify-center bg-[#050505]">
        <Spinner label="Loading Community..." color="warning" />
      </div>
    );
  }

  if (!community) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#050505] text-white">
        <p>Community not found</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#050505] pb-20 pt-20">
      {/* Back Link */}
      <div className="container mx-auto mb-6 max-w-4xl px-4">
        <button
          onClick={() => router.push("/communities")}
          className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gray-500 transition-colors hover:text-white"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Back to Communities
        </button>
      </div>

      <div className="container mx-auto max-w-4xl px-4">
        {/* Community Header */}
        <div className="relative mb-12 overflow-hidden rounded-3xl border border-white/10 bg-[#111]">
          {/* Banner with Red Gradient overlay matching screenshot */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-shopstr-purple/20 via-[#111]/80 to-[#111]"></div>

          {/* Centered Logo */}
          <div className="absolute left-1/2 top-12 md:top-24 z-10 flex h-24 w-24 md:h-32 md:w-32 -translate-x-1/2 items-center justify-center rounded-3xl border-[6px] border-[#111] bg-[#1a1a1a] shadow-2xl">
            <img
              src={sanitizeUrl(community.image)}
              alt={community.name}
              className="h-full w-full rounded-2xl object-cover"
            />
          </div>

          {/* Info */}
          <div className="px-6 md:px-8 pb-10 pt-40 md:pt-60 text-center">
            <h1 className="mb-2 text-2xl md:text-4xl font-black uppercase tracking-tighter text-white">
              {community.name}
            </h1>
            <p className="mx-auto max-w-2xl text-base md:text-lg text-gray-400 leading-relaxed">
              {community.description}
            </p>
          </div>
        </div>

        {/* Feed Section Header */}
        <div className="mb-6 flex items-center justify-between border-b-2 border-shopstr-yellow/50 pb-2">
          <h2 className="text-lg md:text-xl font-black uppercase text-white">
            Discussion
          </h2>
          <div className="flex gap-2">
            <span className="rounded-lg bg-[#222] px-3 py-1 text-xs font-bold uppercase text-white">
              Latest
            </span>
            <span className="cursor-pointer rounded-lg px-3 py-1 text-xs font-bold uppercase text-gray-500 hover:text-white">
              Top
            </span>
          </div>
        </div>

        {/* Community Feed */}
        <CommunityFeed community={community} />
      </div>
    </div>
  );
};

export default SingleCommunityPage;
