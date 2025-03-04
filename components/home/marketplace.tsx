import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import {
  Button,
  Chip,
  Select,
  SelectItem,
  SelectSection,
  Input,
  useDisclosure,
} from "@nextui-org/react";
import { FaceFrownIcon, FaceSmileIcon } from "@heroicons/react/24/outline";
import { useRouter } from "next/router";
import { nip19 } from "nostr-tools";
import React, { useContext, useEffect, useState } from "react";
import {
  ReviewsContext,
  ShopMapContext,
  FollowsContext,
} from "@/utils/context/context";
import DisplayProducts from "../display-products";
import LocationDropdown from "../utility-components/dropdowns/location-dropdown";
import { ProfileWithDropdown } from "@/components/utility-components/profile/profile-dropdown";
import { CATEGORIES } from "../utility/STATIC-VARIABLES";
import {
  getLocalStorageData,
  isUserLoggedIn,
} from "../utility/nostr-helper-functions";
import { ProductData } from "../utility/product-parser-functions";
import SignInModal from "../sign-in/SignInModal";
import ShopstrSwitch from "../utility-components/shopstr-switch";
import { ShopSettings } from "../../utils/types/types";
import SideShopNav from "./side-shop-nav";
import FailureModal from "../utility-components/failure-modal";

export function MarketplacePage({
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
    new Set<string>([]),
  );
  const [selectedLocation, setSelectedLocation] = useState("");
  const [selectedSearch, setSelectedSearch] = useState("");
  const { isOpen, onClose } = useDisclosure();

  const [wotFilter, setWotFilter] = useState(false);

  const [merchantReview, setMerchantReview] = useState(0);
  const [merchantQuality, setMerchantQuality] = useState("");
  const [filteredProducts, setFilteredProducts] = useState<ProductData[]>([]);
  const [productReviewMap, setProductReviewMap] = useState(
    new Map<string, Map<string, string[][]>>(),
  );
  const [isFetchingReviews, setIsFetchingReviews] = useState(false);

  const [shopBannerURL, setShopBannerURL] = useState("");
  const [shopAbout, setShopAbout] = useState("");
  const [isFetchingShop, setIsFetchingShop] = useState(false);

  const [isFetchingFollows, setIsFetchingFollows] = useState(false);

  const [categories, setCategories] = useState([""]);

  const [showFailureModal, setShowFailureModal] = useState(false);

  const reviewsContext = useContext(ReviewsContext);
  const shopMapContext = useContext(ShopMapContext);
  const followsContext = useContext(FollowsContext);

  const { userPubkey } = getLocalStorageData();

  useEffect(() => {
    let npub = router.query.npub;
    if (npub && typeof npub[0] === "string") {
      const { data } = nip19.decode(npub[0]);
      setFocusedPubkey(data as string);
      setSelectedSection("shop");
    }
  }, [router.query.npub]);

  useEffect(() => {
    const loggedIn = isUserLoggedIn();
    if (loggedIn) {
      fetch("/api/metrics/post-shopper", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: userPubkey,
        }),
      });
    }
  });

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
      const shopSettings: ShopSettings | undefined =
        shopMapContext.shopData.get(focusedPubkey);
      if (shopSettings) {
        setShopBannerURL(shopSettings.content.ui.banner);
        setShopAbout(shopSettings.content.about);
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
    let { signInMethod } = getLocalStorageData();
    if (!signInMethod) {
      setShowFailureModal(true);
      return;
    }
    router.push({
      pathname: "/orders",
      query: { pk: nip19.npubEncode(pubkeyToOpenChatWith), isInquiry: true },
    });
  };

  const handleTitleClick = (productId: string, productPubkey: string) => {
    const naddr = nip19.naddrEncode({
      identifier: productId,
      pubkey: productPubkey,
      kind: 30402,
    });
    router.push(`/listing/${naddr}`);
  };

  const renderProductScores = () => {
    return (
      <div className="space-y-4">
        {filteredProducts.map((product) => {
          const productReviews = product.d
            ? productReviewMap.get(product.d)
            : undefined;

          if (!productReviews || productReviews.size === 0) return null;

          return (
            <div key={product.id} className="mt-4 p-4 pt-4">
              <h3 className="mb-3 text-lg font-semibold text-light-text dark:text-dark-text">
                <div
                  onClick={() =>
                    handleTitleClick(product.d as string, product.pubkey)
                  }
                  className="cursor-pointer hover:underline"
                >
                  {product.title}
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
                              ? ["shop_settings"]
                              : ["shop", "inquiry", "copy_npub"]
                          }
                        />
                      </div>
                      <div className="flex flex-col">
                        <div className="mb-1 flex flex-wrap gap-2">
                          {reviewData.map(([_, value, category], index) => {
                            if (category === undefined) {
                              // Don't render the comment here; we'll show it later.
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
                              // Render chips for other categories
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
                  ),
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="mx-auto w-full">
      <div className="flex max-w-[100%] flex-col bg-light-bg px-3 pb-2 dark:bg-dark-bg">
        {shopBannerURL != "" && focusedPubkey != "" && !isFetchingShop ? (
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            {/* Search input - appears on top for small screens */}
            <div className="w-full sm:order-2 sm:w-auto">
              <Input
                className="text-light-text dark:text-dark-text"
                placeholder="Listing title, naddr1 identifier..."
                value={selectedSearch}
                startContent={<MagnifyingGlassIcon height={"1em"} />}
                onChange={(event) => {
                  const value = event.target.value;
                  setSelectedSearch(value);
                }}
                onClear={() => setSelectedSearch("")}
              />
            </div>

            {/* Navigation buttons */}
            <div className="flex gap-1 sm:order-1">
              <Button
                className="bg-transparent text-lg text-light-text hover:text-purple-700 dark:text-dark-text dark:hover:text-accent-dark-text sm:text-xl"
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
                className="bg-transparent text-lg text-light-text hover:text-purple-700 dark:text-dark-text dark:hover:text-accent-dark-text sm:text-xl"
                onClick={() => {
                  setSelectedSection("reviews");
                }}
              >
                Reviews
              </Button>
              <Button
                className="bg-transparent text-lg text-light-text hover:text-purple-700 dark:text-dark-text dark:hover:text-accent-dark-text sm:text-xl"
                onClick={() => {
                  setSelectedSection("about");
                }}
              >
                About
              </Button>
              <Button
                className="bg-transparent text-lg text-light-text hover:text-purple-700 dark:text-dark-text dark:hover:text-accent-dark-text sm:text-xl"
                onClick={() => handleSendMessage(focusedPubkey)}
              >
                Message
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2 pb-3 sm:flex-row">
            <div className="w-full">
              <Input
                className="mt-2 text-light-text dark:text-dark-text"
                isClearable
                placeholder="Listing title, naddr1 identifier..."
                value={selectedSearch}
                startContent={<MagnifyingGlassIcon height={"1em"} />}
                onChange={(event) => {
                  const value = event.target.value;
                  setSelectedSearch(value);
                }}
                onClear={() => setSelectedSearch("")}
              ></Input>
            </div>
            <div className="flex w-full flex-row gap-2 pb-3">
              <Select
                className="mt-2 text-light-text dark:text-dark-text"
                label="Categories"
                placeholder="All"
                selectedKeys={selectedCategories}
                onChange={(event) => {
                  if (event.target.value === "") {
                    setSelectedCategories(new Set([]));
                  } else {
                    setSelectedCategories(
                      new Set(event.target.value.split(",")),
                    );
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
              <LocationDropdown
                className="mt-2"
                placeholder="All"
                label="Location"
                value={selectedLocation}
                onChange={(event: any) => {
                  setSelectedLocation(event.target.value);
                }}
              />
              {!isFetchingFollows ? (
                <ShopstrSwitch
                  wotFilter={wotFilter}
                  setWotFilter={setWotFilter}
                />
              ) : null}
            </div>
          </div>
        )}
      </div>
      <div className="flex">
        {focusedPubkey && shopBannerURL && shopAbout && (
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
            selectedSearch={selectedSearch}
            canShowLoadMore={true}
            wotFilter={wotFilter}
            setCategories={setCategories}
            onFilteredProductsChange={handleFilteredProductsChange}
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
              <div className="break-words text-center text-xl text-light-text dark:text-dark-text">
                No reviews . . . yet!
              </div>
            )}
            <p className="text-base">{renderProductScores()}</p>
          </div>
        )}
      </div>
      <SignInModal isOpen={isOpen} onClose={onClose} />
      <FailureModal
        bodyText="You must be signed in to send a message!"
        isOpen={showFailureModal}
        onClose={() => setShowFailureModal(false)}
      />
    </div>
  );
}

export default MarketplacePage;
