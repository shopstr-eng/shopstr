import { useContext, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { nip19 } from "nostr-tools";
import { CommunityContext } from "@/utils/context/context";
import { Community } from "@/utils/types/types";
import { Spinner } from "@heroui/react";
import CommunityFeed from "@/components/communities/CommunityFeed";
import { sanitizeUrl } from "@braintree/sanitize-url";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";

const SingleCommunityPage = () => {
  const router = useRouter();
  const { naddr } = router.query;
  const { communities, isLoading: areCommunitiesLoading } =
    useContext(CommunityContext);
  const [community, setCommunity] = useState<Community | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!router.isReady) return;

    if (!naddr || typeof naddr !== "string") {
      setIsLoading(false);
      return;
    }

    if (communities.size === 0) {
      if (!areCommunitiesLoading) {
        setIsLoading(false);
      }
      return;
    }

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
  }, [naddr, communities, areCommunitiesLoading, router.isReady]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#050505]">
        <Spinner label="Loading Community..." color="warning" />
      </div>
    );
  }

  if (!community) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#050505] px-4 text-white">
        <div className="max-w-md rounded-2xl border border-white/10 bg-[#111] p-10 text-center shadow-2xl">
          <h1 className="mb-3 text-3xl font-black tracking-tighter text-white uppercase">
            Community not found
          </h1>
          <p className="mb-6 text-gray-400">
            This community does not exist or is not available from the current
            relays.
          </p>
          <button
            type="button"
            onClick={() => router.push("/communities")}
            className="bg-shopstr-yellow rounded-xl px-6 py-3 text-sm font-black tracking-widest text-black uppercase transition hover:bg-yellow-300"
          >
            Back to communities
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#050505] pt-20 pb-20">
      {/* Back Link */}
      <div className="container mx-auto mb-6 max-w-4xl px-4">
        <button
          onClick={() => router.push("/communities")}
          className="flex items-center gap-2 text-xs font-bold tracking-widest text-gray-500 uppercase transition-colors hover:text-white"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Back to Communities
        </button>
      </div>

      <div className="container mx-auto max-w-4xl px-4">
        {/* Community Header */}
        <div className="relative mb-12 overflow-hidden rounded-3xl border border-white/10 bg-[#111]">
          {/* Banner with Red Gradient overlay matching screenshot */}
          <div className="from-shopstr-purple/20 absolute inset-0 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] via-[#111]/80 to-[#111]"></div>

          {/* Centered Logo */}
          <div className="absolute top-12 left-1/2 z-10 flex h-24 w-24 -translate-x-1/2 items-center justify-center rounded-3xl border-[6px] border-[#111] bg-[#1a1a1a] shadow-2xl md:top-24 md:h-32 md:w-32">
            <img
              src={sanitizeUrl(community.image)}
              alt={community.name}
              className="h-full w-full rounded-2xl object-cover"
            />
          </div>

          {/* Info */}
          <div className="px-6 pt-40 pb-10 text-center md:px-8 md:pt-60">
            <h1 className="mb-2 text-2xl font-black tracking-tighter text-white uppercase md:text-4xl">
              {community.name}
            </h1>
            <p className="mx-auto max-w-2xl text-base leading-relaxed text-gray-400 md:text-lg">
              {community.description}
            </p>
          </div>
        </div>

        {/* Feed Section Header */}
        <div className="border-shopstr-yellow/50 mb-6 flex items-center justify-between border-b-2 pb-2">
          <h2 className="text-lg font-black text-white uppercase md:text-xl">
            Discussion
          </h2>
          <div className="flex gap-2">
            <span className="rounded-lg bg-[#222] px-3 py-1 text-xs font-bold text-white uppercase">
              Latest
            </span>
            <span className="cursor-pointer rounded-lg px-3 py-1 text-xs font-bold text-gray-500 uppercase hover:text-white">
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
