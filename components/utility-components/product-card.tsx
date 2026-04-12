import { useContext, useState } from "react";
import type React from "react";
import {
  Chip,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  Button,
} from "@heroui/react";
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
import BeefInitiativeBadge from "./beef-initiative-badge";

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
    } catch {
      // console.error("Failed to generate njump link");
    }
  };

  const content = (
    <div className="flex h-full flex-col">
      {/* Image Section with Title Overlay */}
      <div className="relative h-64 w-full overflow-hidden border-b-4 border-black bg-gray-200">
        <ImageCarousel
          images={productData.images}
          classname="w-full h-full object-cover"
          showThumbs={false}
        />

        {/* Title Overlay at Bottom of Image */}
        <div className="absolute bottom-0 left-0 right-0 border-t-2 border-black bg-white/95 p-3 backdrop-blur-sm">
          <h2 className="truncate text-2xl font-bold text-black">
            {productData.title}
          </h2>
          {isZapsnag && productData.pubkey === userPubkey && (
            <button
              onClick={handleNjumpClick}
              className="inline-flex flex-shrink-0 items-center text-xs text-yellow-500 underline hover:text-yellow-700"
              title="Track Sales on Nostr"
              aria-label="Open Flash Sale in Nostr client"
            >
              <span>View on Nostr</span>
              <ArrowTopRightOnSquareIcon className="ml-1 h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Card Content */}
      <div className="flex min-h-0 flex-1 flex-col space-y-3 bg-white p-4">
        {/* Profile Section */}
        <div className="flex min-w-0 items-center justify-between gap-2">
          <div
            className="min-w-0 flex-1 overflow-hidden"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <ProfileWithDropdown
              pubkey={productData.pubkey}
              dropDownKeys={
                productData.pubkey === userPubkey
                  ? ["shop_profile"]
                  : ["shop", "storefront", "inquiry", "copy_npub"]
              }
              bg="light"
            />
          </div>
          {/* Status Badge */}
          {isExpired && (
            <Chip color="warning" size="sm" variant="flat" className="mr-2">
              Outdated
            </Chip>
          )}
          {productData.status === "active" && (
            <Chip className="flex-shrink-0 border-2 border-black bg-green-500 text-xs font-bold text-white">
              Active
            </Chip>
          )}
          {productData.status === "sold" && (
            <Chip className="flex-shrink-0 border-2 border-black bg-red-500 text-xs font-bold text-white">
              Sold
            </Chip>
          )}
          {productData.status === "soon" && (
            <Chip className="flex-shrink-0 border-2 border-black bg-yellow-500 text-xs font-bold text-black">
              Soon
            </Chip>
          )}
          {productData.rawEvent && (
            <Dropdown
              classNames={{
                content:
                  "rounded-md border-2 border-black bg-white shadow-neo p-0",
              }}
            >
              <DropdownTrigger>
                <Button
                  isIconOnly
                  variant="light"
                  size="sm"
                  className="min-w-8 h-8 rounded-md border-2 border-black bg-white shadow-neo"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                >
                  <EllipsisVerticalIcon className="h-5 w-5 text-black" />
                </Button>
              </DropdownTrigger>
              <DropdownMenu
                aria-label="Event Actions"
                classNames={{
                  base: "p-1",
                }}
                itemClasses={{
                  base: "rounded-md text-black data-[hover=true]:bg-primary-yellow data-[hover=true]:text-black",
                }}
              >
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

        {productData.beefinit_donation_percentage != null &&
          productData.beefinit_donation_percentage > 0 && (
            <div>
              <BeefInitiativeBadge size="sm" />
            </div>
          )}

        {/* Location and Price - with proper spacing */}
        {router.pathname !== "/" && (
          <div className="mt-auto flex min-w-0 items-center justify-between gap-3 pt-2">
            <div className="min-w-0 max-w-[60%] flex-shrink-0">
              <Chip
                startContent={locationAvatar(productData.location)}
                className="max-w-full truncate border-2 border-black bg-primary-blue text-xs font-semibold text-white"
              >
                <span className="truncate">{productData.location}</span>
              </Chip>
            </div>
            {!isZapsnag ? (
              <div className="min-w-0 flex-shrink-0">
                <CompactPriceDisplay monetaryInfo={productData} />
              </div>
            ) : (
              <div className="flex items-center justify-center rounded-md bg-black/10 px-2 py-1">
                <span className="text-sm font-bold text-yellow-600">
                  ⚡ {productData.price} {productData.currency}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  const handleCardClick = (e: React.MouseEvent) => {
    // Check if the click target is within elements we want to ignore
    const target = e.target as HTMLElement;
    const isCarouselControl =
      target.closest('button[title*="slide"]') ||
      target.closest('li[role="button"]') ||
      target.closest(".carousel-control");
    const isDropdown =
      target.closest('[role="menu"]') ||
      target.closest('[data-slot="trigger"]') ||
      target.closest('button[data-slot="trigger"]');

    if (isCarouselControl || isDropdown) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    if (onProductClick) {
      onProductClick(productData, e);
    }
  };

  return (
    <div
      // Updated shadow to use shadow-neo and a larger hover shadow.
      // Note: Your original shadow was 8px. shadow-neo is 4px. I've kept the 8px for hover.
      className="flex w-full max-w-sm cursor-pointer flex-col overflow-hidden rounded-md border-4 border-black bg-white shadow-neo duration-200 transition-transform hover:-translate-y-1 hover:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] active:translate-y-0 active:shadow-neo"
    >
      {href ? (
        <Link
          href={href}
          className="block flex h-full flex-col"
          onClick={handleCardClick}
        >
          {content}
        </Link>
      ) : (
        <div onClick={handleCardClick}>{content}</div>
      )}
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
