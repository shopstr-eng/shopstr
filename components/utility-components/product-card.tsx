import React, { useContext, useState } from "react";
import {
  Chip,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
} from "@nextui-org/react";
import Link from "next/link";
import {
  ArrowTopRightOnSquareIcon,
  EllipsisVerticalIcon,
} from "@heroicons/react/24/outline";
import { RawEventModal, EventIdModal } from "./modals/event-modals";
import { nip19 } from "nostr-tools";
import { getLocalStorageData } from "@/utils/nostr/nostr-helper-functions";
import { locationAvatar } from "./dropdowns/location-dropdown";
import ImageCarousel from "./image-carousel";
import CompactPriceDisplay from "./display-monetary-info";
import { ProductData } from "@/utils/parsers/product-parser-functions";
import { ProfileWithDropdown } from "./profile/profile-dropdown";
import { useRouter } from "next/router";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";

export default function ProductCard({
  productData,
  onProductClick,
  href,
}: {
  productData: ProductData;
  onProductClick?: (productId: ProductData, e?: React.MouseEvent) => void;
  href?: string | null;
}) {
  const [showRawEventModal, setShowRawEventModal] = useState(false);
  const [showEventIdModal, setShowEventIdModal] = useState(false);

  const router = useRouter();
  const { pubkey: userPubkey } = useContext(SignerContext);
  if (!productData) return null;

  const isZapsnag =
    productData.d === "zapsnag" || productData.categories?.includes("zapsnag");

  const isExpired = productData.expiration
    ? Date.now() / 1000 > productData.expiration
    : false;

  const handleNjumpClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const { relays } = getLocalStorageData();
      const targetRelays =
        relays.length > 0
          ? relays.slice(0, 3)
          : ["wss://relay.damus.io", "wss://nos.lol", "wss://relay.primal.net"];
      const nevent = nip19.neventEncode({
        id: productData.id,
        author: productData.pubkey,
        relays: targetRelays,
      });
      window.open(`https://njump.me/${nevent}`, "_blank");
    } catch (err) {
      // console.error("Failed to generate njump link", err);
    }
  };

  const content = (
    <div
      className="flex h-full flex-col cursor-pointer"
      onClick={(e) => {
        onProductClick && onProductClick(productData, e);
      }}
    >
      <div className="relative w-full">
        <ImageCarousel
          images={productData.images}
          classname="w-full h-[300px] rounded-t-2xl"
          showThumbs={false}
        />
        {/* Overlay Badges */}
        <div className="absolute top-3 right-3 z-10 flex gap-2">
          {isExpired && (
            <Chip color="warning" size="sm" variant="solid">
              Outdated
            </Chip>
          )}
          {productData.status === "active" && (
            <Chip
              size="sm"
              classNames={{
                base: "bg-green-500/90 border border-green-400 shadow-sm",
                content:
                  "text-white font-bold uppercase text-[10px] tracking-wider",
              }}
            >
              Active
            </Chip>
          )}
          {productData.status === "sold" && (
            <Chip
              size="sm"
              classNames={{
                base: "bg-red-500/90 border border-red-400 shadow-sm",
                content:
                  "text-white font-bold uppercase text-[10px] tracking-wider",
              }}
            >
              Sold
            </Chip>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4">
        {router.pathname !== "/" && (
          <>
            <div className="mb-3 flex items-start justify-between gap-2">
              <h2 className="line-clamp-1 text-lg font-bold text-white transition-colors group-hover:text-yellow-400">
                {productData.title}
              </h2>
              {isZapsnag && productData.pubkey === userPubkey && (
                <button
                  onClick={handleNjumpClick}
                  className="text-zinc-400 hover:text-white"
                  title="Track Sales on Nostr"
                >
                  <ArrowTopRightOnSquareIcon className="ml-1 h-4 w-4" />
                </button>
              )}
              {productData.rawEvent && (
                <Dropdown
                  classNames={{
                    content: "bg-[#161616] border border-zinc-800 rounded-xl",
                  }}
                >
                  <DropdownTrigger>
                    <button className="-mt-1 -mr-2 p-2 text-zinc-500 hover:text-white">
                      <EllipsisVerticalIcon className="h-6 w-6" />
                    </button>
                  </DropdownTrigger>
                  <DropdownMenu aria-label="Event Actions" variant="flat">
                    <DropdownItem
                      key="view-raw"
                      onPress={() => setShowRawEventModal(true)}
                    >
                      View Raw Event
                    </DropdownItem>
                    <DropdownItem
                      key="view-id"
                      onPress={() => setShowEventIdModal(true)}
                    >
                      View Event ID
                    </DropdownItem>
                  </DropdownMenu>
                </Dropdown>
              )}
            </div>

            <div className="mb-6">
              <ProfileWithDropdown
                pubkey={productData.pubkey}
                dropDownKeys={
                  productData.pubkey === userPubkey
                    ? ["shop_profile"]
                    : ["shop", "inquiry", "copy_npub"]
                }
              />
            </div>

            <div className="mt-auto flex items-center justify-between gap-3">
              {productData.location && (
                <div className="flex min-w-0 flex-1 items-center gap-1 rounded-lg bg-zinc-800/80 px-3 py-2 text-xs font-medium text-zinc-400">
                  <span className="shrink-0">
                    {locationAvatar(productData.location)}
                  </span>
                  <span className="truncate">{productData.location}</span>
                </div>
              )}

              <div className="ml-auto flex min-w-fit shrink-0 items-center whitespace-nowrap rounded-lg bg-[#27272a] border border-zinc-700 px-3 py-2 text-xs font-bold text-white shadow-sm">
                {!isZapsnag ? (
                  <CompactPriceDisplay monetaryInfo={productData} />
                ) : (
                  <span className="text-shopstr-yellow">
                    ⚡ {productData.price}
                  </span>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );

  return (
    <div
      className={`group relative mx-auto w-full max-w-[320px] rounded-2xl border border-zinc-800 bg-[#18181b] transition-all duration-300 hover:-translate-y-1 hover:border-4 hover:border-white hover:shadow-2xl`}
    >
      <div className="h-full w-full overflow-hidden rounded-2xl">
        {href ? (
          <Link href={href} className="block">
            {content}
          </Link>
        ) : (
          content
        )}
      </div>
      <RawEventModal
        isOpen={showRawEventModal}
        onClose={() => setShowRawEventModal(false)}
        rawEvent={productData.rawEvent}
      />
      <EventIdModal
        isOpen={showEventIdModal}
        onClose={() => setShowEventIdModal(false)}
        rawEvent={productData.rawEvent}
      />
    </div>
  );
}