import { useContext, useState, useMemo } from "react";
import { CommunityContext } from "@/utils/context/context";
import CommunityCard from "@/components/communities/CommunityCard";
import { Spinner, Input, Divider } from "@heroui/react";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";

const CommunitiesDiscoveryPage = () => {
  const { communities, isLoading } = useContext(CommunityContext);
  const { pubkey } = useContext(SignerContext);
  const [searchQuery, setSearchQuery] = useState("");

  const { myCommunities, otherCommunities } = useMemo(() => {
    const all = Array.from(communities.values());
    const my = pubkey ? all.filter((c) => c.pubkey === pubkey) : [];
    const others = pubkey ? all.filter((c) => c.pubkey !== pubkey) : all;
    return { myCommunities: my, otherCommunities: others };
  }, [communities, pubkey]);

  const filteredOtherCommunities = useMemo(() => {
    if (!searchQuery) {
      return otherCommunities;
    }
    return otherCommunities.filter(
      (community) =>
        community.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        community.description.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [otherCommunities, searchQuery]);

  return (
    <div className="bg-light-bg dark:bg-dark-bg flex min-h-screen flex-col pt-24 md:pb-20">
      <div className="container mx-auto max-w-7xl px-4">
        {isLoading && communities.size === 0 ? (
          <div className="flex justify-center pt-10">
            <Spinner label="Loading communities..." />
          </div>
        ) : (
          <>
            {/* --- Main Heading and Search Bar (Centered) --- */}
            <h1 className="text-light-text dark:text-dark-text mb-4 text-center text-4xl font-bold">
              Discover Communities
            </h1>
            <div className="mb-8 flex justify-center">
              <Input
                isClearable
                aria-label="Search"
                placeholder="Search communities..."
                value={searchQuery}
                onClear={() => setSearchQuery("")}
                onValueChange={setSearchQuery}
                className="max-w-md"
                startContent={
                  <MagnifyingGlassIcon className="text-default-400 pointer-events-none h-5 w-5 flex-shrink-0" />
                }
              />
            </div>

            {/* --- User's Pinned Communities (Conditional) --- */}
            {myCommunities.length > 0 && (
              <div className="mb-12">
                <h2 className="text-light-text dark:text-dark-text mb-4 text-2xl font-bold">
                  My Community 📌
                </h2>
                <div className="flex flex-wrap gap-6">
                  {myCommunities.map((community) => (
                    <CommunityCard key={community.id} community={community} />
                  ))}
                </div>
                <Divider className="my-8" />
              </div>
            )}

            {/* --- Grid of Other Communities --- */}
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredOtherCommunities.map((community) => (
                <CommunityCard key={community.id} community={community} />
              ))}
            </div>

            {/* --- Message for No Search Results --- */}
            {!isLoading &&
              filteredOtherCommunities.length === 0 &&
              searchQuery && (
                <div className="text-light-text/80 dark:text-dark-text/80 mt-10 text-center">
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
