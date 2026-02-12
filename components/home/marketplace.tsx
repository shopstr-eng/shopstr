import { MagnifyingGlassIcon, FunnelIcon } from "@heroicons/react/24/outline";
import {
  Button,
  Chip,
  Select,
  SelectItem,
  SelectSection,
  Input,
  useDisclosure,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
} from "@nextui-org/react";
import {
  FaceFrownIcon,
  FaceSmileIcon,
  PlusIcon,
  EllipsisVerticalIcon,
} from "@heroicons/react/24/outline";
import { useRouter } from "next/router";
import { nip19, Event } from "nostr-tools";
import React, { useContext, useEffect, useState, useRef } from "react";
import {
  ReviewsContext,
  ShopMapContext,
  FollowsContext,
} from "@/utils/context/context";
import DisplayProducts from "../display-products";
import LocationDropdown from "../utility-components/dropdowns/location-dropdown";
import { ProfileWithDropdown } from "@/components/utility-components/profile/profile-dropdown";
import { CATEGORIES, NEO_BTN } from "@/utils/STATIC-VARIABLES";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import { ProductData } from "@/utils/parsers/product-parser-functions";
import SignInModal from "../sign-in/SignInModal";
import ShopstrSwitch from "../utility-components/shopstr-switch";
import { ShopProfile } from "../../utils/types/types";
import {
  RawEventModal,
  EventIdModal,
} from "../utility-components/modals/event-modals";

function MarketplacePage({
  focusedPubkey,
  setFocusedPubkey,
  selectedSection,
  setSelectedSection,
}: {
  focusedPubkey: string;
  setFocusedPubkey: (value: string) => void;
  selectedSection: string;
  setSelectedSection: (value: string) => void;
}) {
  const router = useRouter();
  const [selectedCategories, setSelectedCategories] = useState(
    new Set<string>([])
  );
  const [selectedLocation, setSelectedLocation] = useState("");
  const [selectedSearch, setSelectedSearch] = useState("");
  const { isOpen, onOpen, onClose } = useDisclosure();

  const [wotFilter, setWotFilter] = useState(false);

  const [merchantReview, setMerchantReview] = useState(0);
  const [merchantQuality, setMerchantQuality] = useState("");
  const [filteredProducts, setFilteredProducts] = useState<ProductData[]>([]);
  const [productReviewMap, setProductReviewMap] = useState(
    new Map<string, Map<string, string[][]>>()
  );
  const [isFetchingReviews, setIsFetchingReviews] = useState(false);

  const [shopBannerURL, setShopBannerURL] = useState("");
  const [shopAbout, setShopAbout] = useState("");
  const [_isFetchingShop, setIsFetchingShop] = useState(false);
  const [rawEvent, setRawEvent] = useState<Event | undefined>(undefined);
  const [showRawEventModal, setShowRawEventModal] = useState(false);
  const [showEventIdModal, setShowEventIdModal] = useState(false);

  const [_isFetchingFollows, setIsFetchingFollows] = useState(false);

  const [_categories, setCategories] = useState([""]);

  const reviewsContext = useContext(ReviewsContext);
  const shopMapContext = useContext(ShopMapContext);
  const followsContext = useContext(FollowsContext);

  const { pubkey: userPubkey, isLoggedIn: loggedIn } =
    useContext(SignerContext);

  const searchBarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const npub = router.query.npub;
    if (npub && typeof npub[0] === "string") {
      const { data } = nip19.decode(npub[0]);
      setFocusedPubkey(data as string);
      setSelectedSection("shop");
    }
  }, [router.query.npub, setFocusedPubkey, setSelectedSection]);

  useEffect(() => {
    setIsFetchingReviews(true);
    if (
      focusedPubkey &&
      reviewsContext.merchantReviewsData.has(focusedPubkey) &&
      typeof reviewsContext.merchantReviewsData.get(focusedPubkey) !=
        "undefined" &&
      reviewsContext.productReviewsData.has(focusedPubkey) &&
      typeof reviewsContext.productReviewsData.get(focusedPubkey) != "undefined"
    ) {
      const merchantScoresMap = reviewsContext.merchantReviewsData;
      const productReviewMap =
        reviewsContext.productReviewsData.get(focusedPubkey);
      if (merchantScoresMap && productReviewMap) {
        for (const [pubkey, scores] of merchantScoresMap.entries()) {
          if (pubkey === focusedPubkey) {
            const averageScore =
              scores.reduce((a, b) => a + b, 0) / scores.length;
            setMerchantReview(averageScore);
          }
        }
        setProductReviewMap(productReviewMap);
      }
    }
    setIsFetchingReviews(false);
  }, [focusedPubkey, reviewsContext]);

  useEffect(() => {
    if (!reviewsContext.merchantReviewsData.has(focusedPubkey)) {
      setMerchantQuality("");
    } else if (merchantReview >= 0.75) {
      setMerchantQuality("Trustworthy");
    } else if (merchantReview >= 0.5) {
      setMerchantQuality("Solid");
    } else if (merchantReview >= 0.25) {
      setMerchantQuality("Questionable");
    } else {
      setMerchantQuality("Don't trust, don't bother verifying");
    }
  }, [reviewsContext, merchantReview, focusedPubkey]);

  useEffect(() => {
    setIsFetchingShop(true);
    if (
      focusedPubkey &&
      shopMapContext.shopData.has(focusedPubkey) &&
      typeof shopMapContext.shopData.get(focusedPubkey) != "undefined"
    ) {
      const shopProfile: ShopProfile | undefined =
        shopMapContext.shopData.get(focusedPubkey);
      if (shopProfile) {
        setShopBannerURL(shopProfile.content.ui.banner);
        setShopAbout(shopProfile.content.about);
        setRawEvent(shopProfile.event);
      }
    }
    setIsFetchingShop(false);
  }, [focusedPubkey, shopMapContext, shopBannerURL]);

  useEffect(() => {
    setIsFetchingFollows(true);
    if (followsContext.followList.length && !followsContext.isLoading) {
      setIsFetchingFollows(false);
    }
  }, [followsContext]);

  const handleFilteredProductsChange = (products: ProductData[]) => {
    setFilteredProducts(products);
  };

  const handleSendMessage = (pubkeyToOpenChatWith: string) => {
    if (loggedIn) {
      router.push({
        pathname: "/orders",
        query: { pk: nip19.npubEncode(pubkeyToOpenChatWith), isInquiry: true },
      });
    } else {
      onOpen();
    }
  };

  const handleAddNewListing = () => {
    if (loggedIn) {
      router.push("/my-listings?addNewListing");
    } else {
      onOpen();
    }
  };

  const handleTitleClick = (product: ProductData) => {
    if (product.d === "zapsnag" || product.categories?.includes("zapsnag")) {
      router.push(`/listing/${product.id}`);
      return;
    }
    try {
      const naddr = nip19.naddrEncode({
        identifier: product.d!,
        pubkey: product.pubkey,
        kind: 30402,
      });
      router.push(`/listing/${naddr}`);
    } catch {
      router.push(`/listing/${product.id}`);
    }
  };

  const renderProductScores = () => {
    return (
      <div className="space-y-4">
        {filteredProducts.map((product) => {
          const productReviews = product.d
            ? productReviewMap.get(product.d)
            : undefined;
          const isExpired = product.expiration
            ? Date.now() / 1000 > product.expiration
            : false;

          if (!productReviews || productReviews.size === 0) return null;

          return (
            <div key={product.id} className="mt-4 p-4 pt-4">
              <h3 className="mb-3 text-lg font-semibold text-light-text dark:text-dark-text">
                <div
                  onClick={() => handleTitleClick(product)}
                  className="cursor-pointer hover:underline"
                >
                  {product.title}
                  {isExpired && (
                    <Chip
                      color="warning"
                      size="sm"
                      variant="flat"
                      className="ml-2"
                    >
                      Outdated
                    </Chip>
                  )}
                </div>
              </h3>
              <div className="space-y-3">
                {Array.from(productReviews.entries()).map(
                  ([reviewerPubkey, reviewData]) => (
                    <div
                      key={reviewerPubkey}
                      className="rounded-lg border-2 border-black p-3 dark:border-white"
                    >
                      <div className="mb-2 flex items-center gap-2">
                        <ProfileWithDropdown
                          pubkey={reviewerPubkey}
                          dropDownKeys={
                            reviewerPubkey === userPubkey
                              ? ["shop_profile"]
                              : ["shop", "inquiry", "copy_npub"]
                          }
                        />
                      </div>
                      <div className="flex flex-col">
                        <div className="mb-1 flex flex-wrap gap-2">
                          {reviewData.map(([_, value, category], index) => {
                            if (category === undefined) {
                              return null;
                            } else if (category === "thumb") {
                              return (
                                <Chip
                                  key={index}
                                  className={`text-light-text dark:text-dark-text ${
                                    value === "1"
                                      ? "bg-green-500"
                                      : "bg-red-500"
                                  }`}
                                >
                                  {`overall: ${value === "1" ? "👍" : "👎"}`}
                                </Chip>
                              );
                            } else {
                              return (
                                <Chip
                                  key={index}
                                  className={`text-light-text dark:text-dark-text ${
                                    value === "1"
                                      ? "bg-green-500"
                                      : "bg-red-500"
                                  }`}
                                >
                                  {`${category}: ${
                                    value === "1" ? "👍" : "👎"
                                  }`}
                                </Chip>
                              );
                            }
                          })}
                        </div>
                        {reviewData.map(([category, value], index) => {
                          if (category === "comment" && value !== "") {
                            return (
                              <p
                                key={index}
                                className="italic text-light-text dark:text-dark-text"
                              >
                                &ldquo;{value}&rdquo;
                              </p>
                            );
                          }
                          return null;
                        })}
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="mx-auto flex min-h-screen w-full flex-col bg-light-bg dark:bg-dark-bg">
      {/* Top Filter Bar */}
      <div className="sticky top-0 z-30 flex w-full flex-col gap-3 border-b border-zinc-800 bg-light-bg px-4 py-4 dark:bg-dark-bg md:flex-row md:items-end">
        {/* Search Input */}
        <div ref={searchBarRef} className="w-full md:flex-1">
          <Input
            classNames={{
              inputWrapper:
                "bg-zinc-100 dark:bg-[#18181b] border border-zinc-300 dark:border-[#27272a] rounded-xl h-[50px] hover:border-zinc-400 dark:hover:border-zinc-500 transition-colors",
              input: "text-base font-medium",
            }}
            isClearable
            placeholder="Listing title, naddr1..., npub..."
            value={selectedSearch}
            startContent={
              <MagnifyingGlassIcon className="h-5 w-5 text-zinc-500" />
            }
            onChange={(event) => {
              const value = event.target.value;
              setSelectedSearch(value);
            }}
            onClear={() => setSelectedSearch("")}
          />
        </div>

        {/* Filters Group */}
        <div className="flex flex-wrap items-end gap-3">
          {/* RESTORED: Navigation, Mobile Message & Event Actions */}
          {focusedPubkey && (
            <div className="flex items-center gap-2">
              <div className="flex h-[50px] items-center rounded-xl border border-zinc-300 bg-zinc-100 p-1 dark:border-[#27272a] dark:bg-[#18181b]">
                <Button
                  size="sm"
                  variant="light"
                  className={`h-full rounded-lg px-3 text-xs font-bold uppercase tracking-wider ${
                    selectedSection === "shop" || selectedSection === ""
                      ? "bg-white text-black shadow-sm dark:bg-zinc-800 dark:text-white"
                      : "text-zinc-500 hover:text-black dark:hover:text-white"
                  }`}
                  onClick={() => {
                    setSelectedCategories(new Set<string>([]));
                    setSelectedLocation("");
                    setSelectedSearch("");
                    setSelectedSection("shop");
                  }}
                >
                  Shop
                </Button>
                <Button
                  size="sm"
                  variant="light"
                  className={`h-full rounded-lg px-3 text-xs font-bold uppercase tracking-wider ${
                    selectedSection === "reviews"
                      ? "bg-white text-black shadow-sm dark:bg-zinc-800 dark:text-white"
                      : "text-zinc-500 hover:text-black dark:hover:text-white"
                  }`}
                  onClick={() => setSelectedSection("reviews")}
                >
                  Reviews
                </Button>
                <Button
                  size="sm"
                  variant="light"
                  className={`h-full rounded-lg px-3 text-xs font-bold uppercase tracking-wider ${
                    selectedSection === "about"
                      ? "bg-white text-black shadow-sm dark:bg-zinc-800 dark:text-white"
                      : "text-zinc-500 hover:text-black dark:hover:text-white"
                  }`}
                  onClick={() => setSelectedSection("about")}
                >
                  About
                </Button>
              </div>

              {/* Mobile Message Button (SideShopNav is hidden on mobile) */}
              <Button
                className="flex h-[50px] items-center rounded-xl border border-zinc-300 bg-zinc-100 px-4 font-bold text-zinc-500 dark:border-[#27272a] dark:bg-[#18181b] dark:hover:text-white md:hidden"
                onClick={() => handleSendMessage(focusedPubkey)}
              >
                Msg
              </Button>

              {rawEvent && (
                <Dropdown>
                  <DropdownTrigger>
                    <Button
                      isIconOnly
                      variant="flat"
                      className="h-[50px] w-[50px] rounded-xl border border-zinc-300 bg-zinc-100 dark:border-[#27272a] dark:bg-[#18181b]"
                    >
                      <EllipsisVerticalIcon className="h-6 w-6 text-zinc-500" />
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
          )}

          <div className="min-w-[160px]">
            <Select
              label="CATEGORIES"
              labelPlacement="outside"
              placeholder="All"
              selectorIcon={<FunnelIcon className="h-4 w-4 text-zinc-400" />}
              classNames={{
                trigger:
                  "bg-zinc-100 dark:bg-[#18181b] border border-zinc-300 dark:border-[#27272a] rounded-xl h-[50px]",
                label:
                  "text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5",
                value: "text-zinc-900 dark:text-white font-bold text-sm",
                popoverContent: "dark:bg-[#18181b] border border-[#27272a]",
              }}
              selectedKeys={selectedCategories}
              onChange={(event) => {
                if (event.target.value === "") {
                  setSelectedCategories(new Set([]));
                } else {
                  setSelectedCategories(new Set(event.target.value.split(",")));
                }
              }}
              selectionMode="multiple"
            >
              <SelectSection className="text-light-text dark:text-dark-text">
                {CATEGORIES.map((category) => (
                  <SelectItem value={category} key={category}>
                    {category}
                  </SelectItem>
                ))}
              </SelectSection>
            </Select>
          </div>

          <div className="min-w-[160px]">
            <LocationDropdown
              label="LOCATION"
              labelPlacement="outside"
              placeholder="All"
              classNames={{
                trigger:
                  "bg-zinc-100 dark:bg-[#18181b] border border-zinc-300 dark:border-[#27272a] rounded-xl h-[50px]",
                label:
                  "text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5",
                value: "text-zinc-900 dark:text-white font-bold text-sm",
                popoverContent: "dark:bg-[#18181b] border border-[#27272a]",
              }}
              value={selectedLocation}
              onChange={(event: any) => {
                setSelectedLocation(event.target.value);
              }}
            />
          </div>

          <div className="flex h-[50px] flex-col justify-end">
            <div className="flex h-[50px] items-center rounded-xl border border-zinc-300 bg-zinc-100 px-4 dark:border-[#27272a] dark:bg-[#18181b]">
              <ShopstrSwitch
                wotFilter={wotFilter}
                setWotFilter={setWotFilter}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="flex w-full">
        {((selectedSection === "shop" && focusedPubkey !== "") ||
          selectedSection === "") && (
          <DisplayProducts
            focusedPubkey={focusedPubkey}
            selectedCategories={selectedCategories}
            selectedLocation={selectedLocation}
            selectedSearch={selectedSearch}
            wotFilter={wotFilter}
            setCategories={setCategories}
            onFilteredProductsChange={handleFilteredProductsChange}
            searchBarRef={searchBarRef}
          />
        )}
        {selectedSection === "about" && shopAbout && (
          <div className="flex w-full flex-col justify-start bg-transparent px-4 py-8 text-light-text dark:text-dark-text">
            <h2 className="pb-2 text-2xl font-bold">About</h2>
            <p className="text-base">{shopAbout}</p>
          </div>
        )}
        {selectedSection === "reviews" && !isFetchingReviews && (
          <div className="flex w-full flex-col justify-start bg-transparent px-4 py-8 text-light-text dark:text-dark-text">
            <h2 className="pb-2 text-2xl font-bold">Reviews</h2>
            {merchantQuality !== "" ? (
              <div className="mt-4 p-4 pt-4">
                <h3 className="mb-3 text-lg font-semibold text-light-text dark:text-dark-text">
                  Merchant Quality
                </h3>
                <div className="inline-flex items-center gap-1 rounded-lg border-2 border-black px-2 dark:border-white">
                  {merchantReview && merchantReview >= 0.5 ? (
                    <>
                      <FaceSmileIcon
                        className={`h-10 w-10 p-1 ${
                          merchantReview >= 0.75
                            ? "text-green-500"
                            : "text-green-300"
                        }`}
                      />
                      <span className="mr-2 whitespace-nowrap text-sm text-light-text dark:text-dark-text">
                        {merchantQuality}
                      </span>
                    </>
                  ) : (
                    <>
                      <FaceFrownIcon
                        className={`h-10 w-10 p-1 ${
                          merchantReview >= 0.25
                            ? "text-red-300"
                            : "text-red-500"
                        }`}
                      />
                      <span className="mr-2 whitespace-nowrap text-sm text-light-text dark:text-dark-text">
                        {merchantQuality}
                      </span>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-10 flex flex-grow items-center justify-center py-10">
                <div className="w-full max-w-xl rounded-lg bg-light-fg p-10 text-center shadow-lg dark:bg-dark-fg">
                  <p className="text-3xl font-semibold text-light-text dark:text-dark-text">
                    No reviews . . . yet!
                  </p>
                  <p className="mt-4 text-lg text-light-text dark:text-dark-text">
                    Seems there aren&apos;t any reviews for this shop yet.
                  </p>
                </div>
              </div>
            )}
            <p className="text-base">{renderProductScores()}</p>
          </div>
        )}
      </div>
      {router.pathname.includes("marketplace") &&
        !router.asPath.includes("npub") && (
          <Button
            isIconOnly
            className={`${NEO_BTN} fixed bottom-12 right-12 z-50 h-16 w-16 rounded-full border-4 border-white shadow-xl hover:shadow-2xl`}
            onClick={() => handleAddNewListing()}
          >
            <PlusIcon className="h-8 w-8 stroke-2" />
          </Button>
        )}
      <SignInModal isOpen={isOpen} onClose={onClose} />
      <RawEventModal
        isOpen={showRawEventModal}
        onClose={() => setShowRawEventModal(false)}
        rawEvent={rawEvent}
      />
      <EventIdModal
        isOpen={showEventIdModal}
        onClose={() => setShowEventIdModal(false)}
        rawEvent={rawEvent}
      />
    </div>
  );
}

export default MarketplacePage;
