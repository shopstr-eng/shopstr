import { StorefrontColorScheme } from "@/utils/types/types";
import { Community } from "@/utils/types/types";
import { sanitizeUrl } from "@braintree/sanitize-url";
import CommunityFeed from "@/components/communities/CommunityFeed";
import MilkMarketSpinner from "@/components/utility-components/mm-spinner";

interface StorefrontCommunityProps {
  shopPubkey: string;
  community: Community | null;
  colors: StorefrontColorScheme;
  isLoading: boolean;
}

export default function StorefrontCommunity({
  community,
  colors,
  isLoading,
}: StorefrontCommunityProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <MilkMarketSpinner />
      </div>
    );
  }

  if (!community) {
    return (
      <div className="py-24 text-center">
        <p className="text-lg opacity-50">No community has been created yet.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <div
        className="mb-8 overflow-hidden rounded-lg border-2"
        style={{ borderColor: colors.primary + "44" }}
      >
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
          <div
            className="flex h-48 w-full items-center justify-center"
            style={{
              backgroundColor: colors.secondary + "11",
            }}
          >
            <p className="text-2xl font-bold uppercase tracking-wide opacity-40">
              Community
            </p>
          </div>
        )}
      </div>

      <h1
        className="font-heading mb-2 text-4xl font-bold"
        style={{ color: "var(--sf-text)" }}
      >
        {community.name}
      </h1>
      <p className="font-body mb-8 text-lg opacity-70">
        {community.description}
      </p>

      <div className="mt-8">
        <CommunityFeed community={community} />
      </div>
    </div>
  );
}
