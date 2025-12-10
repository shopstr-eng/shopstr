import React, { useContext } from "react";
import { Chip } from "@nextui-org/react";
import Link from "next/link";
import { ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";
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
  const router = useRouter();
  const { pubkey: userPubkey } = useContext(SignerContext);
  if (!productData) return null;

  const isZapsnag = productData.d === "zapsnag" || productData.categories?.includes("zapsnag");

  const cardHoverStyle =
    "hover:shadow-purple-500/30 dark:hover:shadow-yellow-500/30 hover:scale-[1.01]";

  const isExpired = productData.expiration
    ? Date.now() / 1000 > productData.expiration
    : false;

  const handleNjumpClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const { relays } = getLocalStorageData();
      const targetRelays = relays.length > 0 ? relays.slice(0, 3) : ["wss://relay.damus.io", "wss://nos.lol", "wss://relay.primal.net"];
      const nevent = nip19.neventEncode({
        id: productData.id,
        author: productData.pubkey,
        relays: targetRelays
      });
      window.open(`https://njump.me/${nevent}`, "_blank");
    } catch (err) {
      console.error("Failed to generate njump link", err);
    }
  };

  const content = (
    <div
      className="cursor-pointer"
      onClick={(e) => {
        onProductClick && onProductClick(productData, e);
      }}
    >
      <div>
        <ImageCarousel
          images={productData.images}
          classname="w-full h-[300px] rounded-t-2xl"
          showThumbs={false}
        />
      </div>
      <div className="flex flex-col p-4">
        {router.pathname !== "/" && (
          <div className="mb-2 flex items-center justify-between">
            <h2 className="max-w-[70%] truncate text-xl font-semibold text-light-text dark:text-dark-text">
              {productData.title}
            </h2>
            {isZapsnag && productData.pubkey === userPubkey && (
              <button
                onClick={handleNjumpClick}
                className="ml-2 inline-flex items-center text-xs text-purple-600 hover:text-purple-800 dark:text-yellow-500 dark:hover:text-yellow-700 underline"
                title="Track Sales on Nostr"
                aria-label="Open Flash Sale in Nostr client"
              >
                <span>View on Nostr</span>
                <ArrowTopRightOnSquareIcon className="h-4 w-4 ml-1" />
              </button>
            )}
            {isExpired && (
              <Chip color="warning" size="sm" variant="flat" className="mr-2">
                Outdated
              </Chip>
            )}
            {productData.status === "active" && (
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
        <div className="mb-3">
          <ProfileWithDropdown
            pubkey={productData.pubkey}
            dropDownKeys={
              productData.pubkey === userPubkey
                ? ["shop_profile"]
                : ["shop", "inquiry", "copy_npub"]
            }
          />
        </div>
        {router.pathname !== "/" && (
          <div className="mt-1 flex items-center justify-between">
            <Chip
              key={productData.location}
              startContent={locationAvatar(productData.location)}
              className="text-xs"
            >
              {productData.location}
            </Chip>
            {!isZapsnag ? (
              <CompactPriceDisplay monetaryInfo={productData} />
            ) : (
              <div className="flex items-center justify-center rounded-md bg-black/10 px-2 py-1 dark:bg-white/10">
                <span className="text-sm font-bold text-shopstr-purple dark:text-shopstr-yellow">
                  ⚡ {productData.price} {productData.currency}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div
      className={`${cardHoverStyle} mx-2 my-4 rounded-2xl bg-white shadow-md duration-300 transition-all dark:bg-neutral-900`}
    >
      <div className="w-80 overflow-hidden rounded-2xl">
        {href ? (
          <Link href={href} className="block">
            {content}
          </Link>
        ) : (
          content
        )}
      </div>
    </div>
  );
}
