import React, { useContext, useState, useMemo, useEffect } from "react";
import { CommunityContext } from "@/utils/context/context";
import CommunityCard from "@/components/communities/CommunityCard";
import { Spinner, Input } from "@nextui-org/react";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import { UserGroupIcon } from "@heroicons/react/24/outline";

const CommunitiesDiscoveryPage = () => {
  const { communities, isLoading } = useContext(CommunityContext);
  const { pubkey } = useContext(SignerContext);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { myCommunities, otherCommunities } = useMemo(() => {
    const all = Array.from(communities.values());
    const my = pubkey ? all.filter((c) => c.pubkey === pubkey) : [];
    const others = pubkey ? all.filter((c) => c.pubkey !== pubkey) : all;
    return { myCommunities: my, otherCommunities: others };
  }, [communities, pubkey]);

  const filteredOtherCommunities = useMemo(() => {
    if (!debouncedQuery) {
      return otherCommunities;
    }
    return otherCommunities.filter(
      (community) =>
        community.name.toLowerCase().includes(debouncedQuery.toLowerCase()) ||
        community.description
          .toLowerCase()
          .includes(debouncedQuery.toLowerCase())
    );
  }, [otherCommunities, debouncedQuery]);

  return (
    <div className="flex min-h-screen flex-col bg-[#050505] pt-32 md:pb-20">
      <div className="container mx-auto max-w-7xl px-4">
        {isLoading && communities.size === 0 ? (
          <div className="flex justify-center pt-10">
            <Spinner label="Loading communities..." color="warning" />
          </div>
        ) : (
          <>
            {/* --- Header --- */}
            <div className="mb-16 flex flex-col items-center">
              <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-shopstr-yellow text-shopstr-yellow">
                <UserGroupIcon className="h-8 w-8" />
              </div>
              <h1 className="mb-8 text-center text-4xl font-black uppercase tracking-tighter text-white md:text-6xl">
                Discover{" "}
                <span className="text-shopstr-yellow">Communities</span>
              </h1>

              <Input
                isClearable
                aria-label="Search"
                placeholder="Search communities..."
                value={searchQuery}
                onClear={() => setSearchQuery("")}
                onValueChange={setSearchQuery}
                classNames={{
                  base: "max-w-xl w-full",
                  inputWrapper:
                    "h-14 bg-[#111] border border-white/10 rounded-xl data-[hover=true]:bg-[#1a1a1a] group-data-[focus=true]:bg-[#1a1a1a]",
                  input:
                    "text-white placeholder:text-gray-500 text-base md:text-lg",
                  clearButton: "text-gray-400",
                }}
                startContent={
                  <MagnifyingGlassIcon className="pointer-events-none mr-2 h-6 w-6 flex-shrink-0 text-gray-500" />
                }
              />
            </div>
            <div className="mb-12 border-t border-white/10"></div>

            {/* --- User's Pinned Communities (Conditional) --- */}
            {myCommunities.length > 0 && (
              <div className="mb-12">
                <div className="mb-6 flex items-center justify-center gap-2 md:justify-start">
                  <h2 className="text-xl font-bold uppercase text-white">
                    My Community
                  </h2>
                  <span className="text-xl">📌</span>
                </div>
                <div className="flex flex-wrap justify-center gap-6 md:justify-start">
                  {myCommunities.map((community) => (
                    <CommunityCard key={community.id} community={community} />
                  ))}
                </div>
              </div>
            )}

            {/* --- Grid of Other Communities --- */}
            <div className="grid auto-rows-fr grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredOtherCommunities.map((community) => (
                <CommunityCard key={community.id} community={community} />
              ))}
            </div>

            {/* --- Message for No Search Results --- */}
            {!isLoading &&
              filteredOtherCommunities.length === 0 &&
              searchQuery && (
                <div className="mt-10 text-center text-gray-500">
                  <p>No communities match your search.</p>
                </div>
              )}
          </>
        )}
      </div>
    </div>
  );
};

export default CommunitiesDiscoveryPage;
