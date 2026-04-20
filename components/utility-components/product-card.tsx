import React, { useContext, useState } from "react";
import {
  Chip,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  Button,
} from "@heroui/react";
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
  onProductClick?: (
    productId: ProductData,
    e?: React.MouseEvent<HTMLElement> | React.KeyboardEvent<HTMLElement>
  ) => void;
  href?: string | null;
}) {
  const [showRawEventModal, setShowRawEventModal] = useState(false);
  const [showEventIdModal, setShowEventIdModal] = useState(false);

  const router = useRouter();
  const { pubkey: userPubkey } = useContext(SignerContext);
  if (!productData) return null;

  const isZapsnag =
    productData.d === "zapsnag" || productData.categories?.includes("zapsnag");

  const cardHoverStyle =
    "hover:shadow-purple-500/30 dark:hover:shadow-yellow-500/30 hover:scale-[1.01]";

  const isExpired = productData.expiration
    ? Date.now() / 1000 > productData.expiration
    : false;

  const shouldBlockCardNavigation = (target: Element | null) => {
    const isCarouselControl =
      target?.closest('button[title*="slide"]') ||
      target?.closest('li[role="button"]') ||
      target?.closest(".carousel-control");
    const isDropdown =
      target?.closest('[role="menu"]') ||
      target?.closest('[data-slot="trigger"]') ||
      target?.closest('button[data-slot="trigger"]');
    const isProfileDropdown = target?.closest("[data-profile-dropdown]");

    return Boolean(isCarouselControl || isDropdown || isProfileDropdown);
  };

  const getElementTarget = (target: EventTarget | null): Element | null => {
    return target instanceof Element ? target : null;
  };

  const navigateToHref = () => {
    if (!href) return;
    void router.push(href);
  };

  const handleCardClick = (e: React.MouseEvent<HTMLElement>) => {
    const target = getElementTarget(e.target);
    if (shouldBlockCardNavigation(target)) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    if (onProductClick) {
      onProductClick(productData, e);
      if (e.defaultPrevented) {
        return;
      }
    }

    if (href) {
      // Keep native link behavior for modified clicks/new tabs.
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }
      e.preventDefault();
      navigateToHref();
    }
  };

  const handleCardClickCapture = (e: React.MouseEvent<HTMLElement>) => {
    const target = getElementTarget(e.target);
    if (shouldBlockCardNavigation(target)) {
      // Cancel link default early; allow nested controls to handle the click.
      e.preventDefault();
    }
  };

  const handleCardKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    // Let nested interactive controls handle their own keyboard activation.
    if (e.target !== e.currentTarget) {
      return;
    }

    const target = getElementTarget(e.target);
    if (shouldBlockCardNavigation(target)) {
      return;
    }

    if (href) {
      // Link semantics: activate with Enter only.
      if (e.key !== "Enter") {
        return;
      }

      e.preventDefault();
      if (onProductClick) {
        onProductClick(productData, e);
        if (e.defaultPrevented) {
          return;
        }
      }
      navigateToHref();
      return;
    }

    // Button semantics for non-link interactive cards.
    if (e.key !== "Enter" && e.key !== " ") {
      return;
    }

    e.preventDefault();
    if (onProductClick) {
      onProductClick(productData, e);
    }
  };

  const isCardInteractive = Boolean(href || onProductClick);

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

  const contentBody = (
    <>
      <div>
        <ImageCarousel
          images={productData.images}
          productTitle={productData.title}
          classname="w-full h-[300px] rounded-t-2xl"
          showThumbs={false}
        />
      </div>
      <div className="flex flex-col p-4">
        {router.pathname !== "/" && (
          <>
            {/* Title row */}
            <div className="mb-1 flex items-start justify-between gap-2">
              <h2 className="text-light-text dark:text-dark-text line-clamp-2 min-w-0 flex-1 text-base leading-snug font-semibold">
                {productData.title}
              </h2>
              <div className="flex flex-shrink-0 items-center gap-1">
                {isZapsnag && productData.pubkey === userPubkey && (
                  <button
                    onClick={handleNjumpClick}
                    className="inline-flex items-center text-xs text-purple-600 underline hover:text-purple-800 dark:text-yellow-500 dark:hover:text-yellow-700"
                    title="Track Sales on Nostr"
                    aria-label="Open Flash Sale in Nostr client"
                  >
                    <span>View on Nostr</span>
                    <ArrowTopRightOnSquareIcon className="ml-1 h-4 w-4" />
                  </button>
                )}
                {productData.rawEvent && (
                  <Dropdown>
                    <DropdownTrigger>
                      <Button
                        isIconOnly
                        variant="light"
                        size="sm"
                        className="h-8 min-w-8"
                        onClick={(e: any) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                      >
                        <EllipsisVerticalIcon className="h-6 w-6 text-gray-500" />
                      </Button>
                    </DropdownTrigger>
                    <DropdownMenu aria-label="Event Actions">
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
            </div>

            {/* Status badges */}
            {(isExpired ||
              router.pathname === "/my-listings" ||
              productData.status === "sold") && (
              <div className="mb-2 flex items-center gap-2">
                {isExpired && (
                  <Chip color="warning" size="sm" variant="flat">
                    Outdated
                  </Chip>
                )}
                {router.pathname === "/my-listings" &&
                  productData.status === "active" && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900 dark:text-green-300">
                      Active
                    </span>
                  )}
                {productData.status === "sold" && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900 dark:text-red-300">
                    Sold
                  </span>
                )}
              </div>
            )}

            {/* Price */}
            <div className="mb-3">
              {!isZapsnag ? (
                <CompactPriceDisplay monetaryInfo={productData} />
              ) : (
                <div className="flex items-center justify-center rounded-md bg-black/10 px-2 py-1 dark:bg-white/10">
                  <span className="text-shopstr-purple dark:text-shopstr-yellow text-sm font-bold">
                    ⚡ {productData.price} {productData.currency}
                  </span>
                </div>
              )}
            </div>
          </>
        )}

        {/* Seller – supporting text */}
        <div
          className="mb-2"
          data-profile-dropdown
          onClick={(e) => {
            e.stopPropagation();
          }}
        >
          <ProfileWithDropdown
            pubkey={productData.pubkey}
            dropDownKeys={
              productData.pubkey === userPubkey
                ? ["shop_profile"]
                : ["shop", "inquiry", "copy_npub"]
            }
          />
        </div>

        {/* Location */}
        {router.pathname !== "/" && (
          <div className="mt-1">
            <Chip
              key={productData.location}
              startContent={locationAvatar(productData.location)}
              className="text-xs"
            >
              {productData.location}
            </Chip>
          </div>
        )}
      </div>
    </>
  );

  const content = href ? (
    <a
      href={href}
      className={isCardInteractive ? "cursor-pointer" : ""}
      onClickCapture={isCardInteractive ? handleCardClickCapture : undefined}
      onClick={isCardInteractive ? handleCardClick : undefined}
      onKeyDown={isCardInteractive ? handleCardKeyDown : undefined}
    >
      {contentBody}
    </a>
  ) : (
    <div
      className={isCardInteractive ? "cursor-pointer" : ""}
      onClickCapture={isCardInteractive ? handleCardClickCapture : undefined}
      onClick={isCardInteractive ? handleCardClick : undefined}
      onKeyDown={isCardInteractive ? handleCardKeyDown : undefined}
      role={isCardInteractive ? "button" : undefined}
      tabIndex={isCardInteractive ? 0 : undefined}
    >
      {contentBody}
    </div>
  );

  return (
    <div
      className={`${cardHoverStyle} my-4 w-full rounded-2xl bg-white shadow-md transition-all duration-300 dark:bg-neutral-900`}
    >
      <div className="w-full overflow-hidden rounded-2xl">{content}</div>
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
