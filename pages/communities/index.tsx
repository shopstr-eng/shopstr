import { useContext, useState, useMemo } from "react";
import { CommunityContext } from "@/utils/context/context";
import CommunityCard from "@/components/communities/CommunityCard";
import { Input, Divider } from "@nextui-org/react";
import MilkMarketSpinner from "@/components/utility-components/mm-spinner";
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
    <div className="flex min-h-screen flex-col bg-white pb-20 pt-24">
      <div className="container mx-auto max-w-7xl px-4">
        {isLoading && communities.size === 0 ? (
          <div className="flex justify-center pt-10">
            <MilkMarketSpinner label="Loading communities..." />
          </div>
        ) : (
          <>
            {/* --- Main Heading and Search Bar (Centered) --- */}
            <h1 className="mb-6 text-center text-5xl font-bold text-black">
              Discover Communities
            </h1>
            <div className="mb-12 flex justify-center">
              <Input
                isClearable
                aria-label="Search"
                placeholder="Search communities..."
                value={searchQuery}
                onClear={() => setSearchQuery("")}
                onValueChange={setSearchQuery}
                className="max-w-lg"
                classNames={{
                  input: "text-black font-medium",
                  inputWrapper:
                    "border-4 border-black shadow-neo bg-white rounded-lg h-14",
                }}
                startContent={
                  <MagnifyingGlassIcon className="pointer-events-none h-5 w-5 flex-shrink-0 text-black" />
                }
              />
            </div>

            {/* --- User's Pinned Communities (Conditional) --- */}
            {myCommunities.length > 0 && (
              <div className="mb-12">
                <h2 className="mb-6 text-3xl font-bold text-black">
                  My Community 📌
                </h2>
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {myCommunities.map((community) => (
                    <CommunityCard key={community.id} community={community} />
                  ))}
                </div>
                <Divider className="my-12 h-1 bg-black" />
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
                <div className="mt-10 text-center text-gray-700">
                  <p className="text-lg">No communities match your search.</p>
                </div>
              )}
          </>
        )}
      </div>
    </div>
  );
};

export default CommunitiesDiscoveryPage;
