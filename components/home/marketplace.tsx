import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
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
import { PlusIcon, EllipsisVerticalIcon } from "@heroicons/react/24/outline";
import { useRouter } from "next/router";
import { nip19, Event } from "nostr-tools";
import { useContext, useEffect, useState, useRef } from "react";
import {
  ReviewsContext,
  ShopMapContext,
  FollowsContext,
  ProductContext,
  ProfileMapContext,
} from "@/utils/context/context";
import DisplayProducts from "../display-products";
import LocationDropdown from "../utility-components/dropdowns/location-dropdown";
import { ProfileWithDropdown } from "@/components/utility-components/profile/profile-dropdown";
import { CATEGORIES, BLUEBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import SellerReviewReply from "@/components/utility-components/seller-review-reply";
import parseTags, {
  ProductData,
} from "@/utils/parsers/product-parser-functions";
import SignInModal from "../sign-in/SignInModal";
import MilkMarketSwitch from "../utility-components/mm-switch";
import { ShopProfile } from "../../utils/types/types";
import SideShopNav from "./side-shop-nav";
import {
  RawEventModal,
  EventIdModal,
} from "../utility-components/modals/event-modals";
import {
  getListingSlug,
  getProfileSlug,
  findPubkeyByProfileSlug,
  isNpub,
} from "@/utils/url-slugs";
import { useDebounce } from "@/utils/hooks/useDebounce";

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
  const debouncedSearch = useDebounce(selectedSearch, 300);
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
  const [isFetchingShop, setIsFetchingShop] = useState(false);
  const [rawEvent, setRawEvent] = useState<Event | undefined>(undefined);
  const [showRawEventModal, setShowRawEventModal] = useState(false);
  const [showEventIdModal, setShowEventIdModal] = useState(false);

  const [isFetchingFollows, setIsFetchingFollows] = useState(false);

  const [categories, setCategories] = useState([""]);

  const reviewsContext = useContext(ReviewsContext);
  const shopMapContext = useContext(ShopMapContext);
  const followsContext = useContext(FollowsContext);
  const productEventContext = useContext(ProductContext);
  const profileMapContext = useContext(ProfileMapContext);

  const { pubkey: userPubkey, isLoggedIn: loggedIn } =
    useContext(SignerContext);

  const searchBarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const npub = router.query.npub;
    if (npub && typeof npub[0] === "string") {
      const slug = npub[0];
      let pubkey: string | undefined;

      if (isNpub(slug)) {
        try {
          const { data } = nip19.decode(slug);
          pubkey = data as string;
        } catch {
          return;
        }
      } else {
        pubkey = findPubkeyByProfileSlug(slug, profileMapContext.profileData);
      }

      if (pubkey) {
        setFocusedPubkey(pubkey);
        setSelectedSection("shop");
      }
    }
  }, [router.query.npub, profileMapContext.profileData]);

  useEffect(() => {
    if (
      focusedPubkey &&
      !profileMapContext.isLoading &&
      router.query.npub?.[0]
    ) {
      const currentSlug = router.query.npub[0] as string;
      const canonicalSlug = getProfileSlug(
        focusedPubkey,
        profileMapContext.profileData
      );
      if (canonicalSlug && currentSlug !== canonicalSlug) {
        router.replace(`/marketplace/${canonicalSlug}`, undefined, {
          shallow: true,
        });
      }
    }
  }, [
    focusedPubkey,
    profileMapContext.isLoading,
    profileMapContext.profileData,
  ]);

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
  }, [reviewsContext, merchantReview]);

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

    const allParsed = productEventContext.productEvents
      .filter((e: Event) => e.kind !== 1)
      .map((e: Event) => parseTags(e))
      .filter((p: ProductData | undefined): p is ProductData => !!p);

    const slug = getListingSlug(product, allParsed);
    if (slug) {
      router.push(`/listing/${slug}`);
    } else {
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
              <h3 className="mb-3 text-lg font-semibold text-black">
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
                      className="rounded-lg border-2 border-black bg-white p-3 shadow-neo"
                    >
                      <div className="mb-2 flex items-center gap-2">
                        <ProfileWithDropdown
                          pubkey={reviewerPubkey}
                          dropDownKeys={
                            reviewerPubkey === userPubkey
                              ? ["shop_profile"]
                              : ["shop", "inquiry", "copy_npub"]
                          }
                          bg="light"
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
                                  className={`text-white ${
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
                                  className={`text-white ${
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
                              <p key={index} className="italic text-black">
                                &ldquo;{value}&rdquo;
                              </p>
                            );
                          }
                          return null;
                        })}
                      </div>
                      <SellerReviewReply
                        reviewEventId={reviewsContext.reviewEventIds.get(
                          `${product.d}:${reviewerPubkey}`
                        )}
                        reviewerPubkey={reviewerPubkey}
                        merchantPubkey={focusedPubkey}
                      />
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
    <div className="mx-auto w-full bg-white">
      {/* Filter Bar Section */}
      <div className="flex max-w-[100%] flex-col bg-white px-6 py-6">
        {shopBannerURL != "" && focusedPubkey != "" && !isFetchingShop ? (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div
              ref={searchBarRef}
              className="w-full sm:order-2 sm:w-auto sm:flex-1"
            >
              <Input
                classNames={{
                  input: "bg-white !text-black placeholder:!text-gray-500",
                  inputWrapper:
                    "bg-white border-4 border-black rounded-md shadow-neo h-12 data-[hover=true]:bg-white data-[focus=true]:bg-white data-[focus-visible=true]:bg-white group-data-[focus=true]:bg-white",
                  innerWrapper: "bg-white",
                  mainWrapper: "bg-white",
                }}
                isClearable
                placeholder="Listing title, naddr, npub..."
                value={selectedSearch}
                startContent={
                  <MagnifyingGlassIcon className="h-5 w-5 text-black" />
                }
                onChange={(event) => {
                  const value = event.target.value;
                  setSelectedSearch(value);
                }}
                onClear={() => setSelectedSearch("")}
              />
            </div>

            <div className="flex flex-wrap gap-2 sm:order-1">
              <Button
                className="bg-transparent text-lg font-bold text-black hover:text-primary-yellow sm:text-xl"
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
                className="bg-transparent text-lg font-bold text-black hover:text-primary-yellow sm:text-xl"
                onClick={() => {
                  setSelectedSection("reviews");
                }}
              >
                Reviews
              </Button>
              <Button
                className="bg-transparent text-lg font-bold text-black hover:text-primary-yellow sm:text-xl"
                onClick={() => handleSendMessage(focusedPubkey)}
              >
                Message
              </Button>
              {(() => {
                const shopData = shopMapContext.shopData.get(focusedPubkey);
                const shopSlug = shopData?.content?.storefront?.shopSlug;
                return shopSlug ? (
                  <Button
                    className="bg-transparent text-lg font-bold text-primary-blue hover:text-primary-yellow sm:text-xl"
                    onClick={() => router.push(`/shop/${shopSlug}`)}
                  >
                    Storefront ↗
                  </Button>
                ) : null;
              })()}
              {rawEvent && (
                <Dropdown>
                  <DropdownTrigger>
                    <Button
                      isIconOnly
                      variant="light"
                      className="hover:text-accent-white/10 text-white"
                    >
                      <EllipsisVerticalIcon className="h-6 w-6" />
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
        ) : (
          <div className="mx-auto w-full max-w-7xl">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div ref={searchBarRef} className="w-full sm:flex-1">
                <Input
                  classNames={{
                    input: "bg-white !text-black placeholder:!text-gray-500",
                    inputWrapper:
                      "bg-white border-4 border-black rounded-md shadow-neo h-12 data-[hover=true]:bg-white data-[focus=true]:bg-white data-[focus-visible=true]:bg-white group-data-[focus=true]:bg-white",
                    innerWrapper: "bg-white",
                    mainWrapper: "bg-white",
                  }}
                  isClearable
                  placeholder="Listing title, naddr, npub..."
                  value={selectedSearch}
                  startContent={
                    <MagnifyingGlassIcon className="h-5 w-5 text-black" />
                  }
                  onChange={(event) => {
                    const value = event.target.value;
                    setSelectedSearch(value);
                  }}
                  onClear={() => setSelectedSearch("")}
                />
              </div>
              <div className="flex w-full flex-col gap-4 sm:w-auto sm:flex-row">
                <Select
                  className="text-black sm:w-56"
                  placeholder="All Categories"
                  selectedKeys={selectedCategories}
                  onChange={(event) => {
                    if (event.target.value === "") {
                      setSelectedCategories(new Set([]));
                    } else {
                      setSelectedCategories(
                        new Set(event.target.value.split(","))
                      );
                    }
                  }}
                  selectionMode="multiple"
                  classNames={{
                    trigger:
                      "bg-white text-black border-4 border-black rounded-md shadow-neo h-12 data-[hover=true]:bg-white data-[open=true]:bg-white data-[focus=true]:bg-white data-[focus-visible=true]:bg-white",
                    popoverContent: "bg-white border-4 border-black rounded-md",
                    value: "text-black font-semibold",
                    label: "text-black font-semibold",
                    innerWrapper: "bg-white",
                    mainWrapper: "bg-white",
                  }}
                >
                  <SelectSection>
                    {CATEGORIES.map((category) => (
                      <SelectItem
                        key={category}
                        value={category}
                        classNames={{
                          base: "text-black data-[hover=true]:!bg-primary-yellow data-[focus=true]:!bg-primary-yellow",
                        }}
                      >
                        {category}
                      </SelectItem>
                    ))}
                  </SelectSection>
                </Select>
                <LocationDropdown
                  className="sm:w-56"
                  placeholder="All Locations"
                  label=""
                  value={selectedLocation}
                  onChange={(event: any) => {
                    setSelectedLocation(event.target.value);
                  }}
                />
                {!isFetchingFollows ? (
                  <MilkMarketSwitch
                    wotFilter={wotFilter}
                    setWotFilter={setWotFilter}
                  />
                ) : null}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex bg-white">
        {focusedPubkey && shopBannerURL && (
          <SideShopNav
            focusedPubkey={focusedPubkey}
            categories={categories}
            setSelectedCategories={setSelectedCategories}
          />
        )}
        {((selectedSection === "shop" && focusedPubkey !== "") ||
          selectedSection === "") && (
          <DisplayProducts
            focusedPubkey={focusedPubkey}
            selectedCategories={selectedCategories}
            selectedLocation={selectedLocation}
            selectedSearch={debouncedSearch}
            wotFilter={wotFilter}
            setCategories={setCategories}
            onFilteredProductsChange={handleFilteredProductsChange}
            searchBarRef={searchBarRef}
          />
        )}
        {selectedSection === "reviews" && !isFetchingReviews && (
          <div className="flex w-full flex-col justify-start bg-white px-4 py-8 text-black">
            <h2 className="pb-2 text-2xl font-bold">Reviews</h2>
            {merchantQuality !== "" ? (
              <div className="mt-4 p-4 pt-4">
                <h3 className="mb-3 text-lg font-semibold text-black">
                  Merchant Quality
                </h3>
                <div className="inline-flex items-center gap-1 rounded-lg border-2 border-black bg-white px-2 shadow-neo">
                  {merchantReview && merchantReview >= 0.5 ? (
                    <>
                      <span className="text-2xl">😀</span>
                      <span className="mr-2 whitespace-nowrap text-sm text-black">
                        {merchantQuality}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="text-2xl">😢</span>
                      <span className="mr-2 whitespace-nowrap text-sm text-black">
                        {merchantQuality}
                      </span>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-10 flex flex-grow items-center justify-center py-10">
                <div className="w-full max-w-xl rounded-lg border-4 border-black bg-white p-10 text-center shadow-neo">
                  <p className="text-3xl font-semibold text-black">
                    No reviews . . . yet!
                  </p>
                  <p className="mt-4 text-lg text-black">
                    Seems there aren&apos;t any reviews for this shop yet.
                  </p>
                </div>
              </div>
            )}
            <p className="text-base">{renderProductScores()}</p>
          </div>
        )}
      </div>

      {/* Floating Add Button */}
      {router.pathname.includes("marketplace") &&
        !router.asPath.includes("npub") && (
          <Button
            radius="full"
            className={`${BLUEBUTTONCLASSNAMES} fixed bottom-8 right-8 z-50 h-16 w-16`}
            onClick={() => handleAddNewListing()}
          >
            <PlusIcon className="h-8 w-8 !text-white" />
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
