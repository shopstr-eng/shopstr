import React from "react";
import { Community } from "@/utils/types/types";
import { useRouter } from "next/router";
import { nip19 } from "nostr-tools";
import { sanitizeUrl } from "@braintree/sanitize-url";
import { ArrowLongRightIcon } from "@heroicons/react/24/outline";

interface CommunityCardProps {
  community: Community;
}

const CommunityCard: React.FC<CommunityCardProps> = ({ community }) => {
  const router = useRouter();

  const handleVisit = () => {
    const naddr = nip19.naddrEncode({
      identifier: community.d,
      pubkey: community.pubkey,
      kind: 34550,
    });
    router.push(`/communities/${naddr}`);
  };

  return (
    <div className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#111] transition-transform duration-300 hover:-translate-y-1 hover:shadow-xl">
      {/* Grey Banner Header */}
      <div className="relative h-32 w-full overflow-hidden bg-[#18181b]">
        <div className="absolute inset-0 bg-gradient-to-bl from-shopstr-purple/40 via-[#18181b] to-shopstr-yellow/10 opacity-80"></div>
      </div>

      {/* Overlapping Icon */}
      <div className="absolute left-6 top-20 flex h-20 w-20 items-center justify-center rounded-2xl border-4 border-[#111] bg-[#1a1a1a]">
        <div className="h-full w-full overflow-hidden rounded-xl">
          <img
            alt={community.name}
            className="h-full w-full object-cover"
            src={sanitizeUrl(community.image)}
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col px-6 pb-6 pt-12">
        <span className="mb-3 w-fit rounded bg-white/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">
          Community
        </span>
        <h4 className="mb-3 text-xl font-bold text-white line-clamp-1">
          {community.name}
        </h4>
        <p className="mb-6 line-clamp-3 text-sm text-gray-400">
          {community.description}
        </p>
        <button
          onClick={handleVisit}
          className="mt-auto flex w-full items-center justify-center gap-2 rounded-xl border-2 border-transparent bg-yellow-400 py-3 text-xs font-black uppercase tracking-widest text-black shadow-[2px_2px_0px_0px_#ffffff] transition-all hover:bg-yellow-500 hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
        >
          Visit <ArrowLongRightIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

export default CommunityCard;
