import { useState, useEffect, useContext } from "react";
import { Filter, SimplePool, nip19 } from "nostr-tools";
import { getLocalStorageData } from "./utility/nostr-helper-functions";
import { NostrEvent } from "../utils/types/types";
import {
  ProductContext,
  ProfileMapContext,
  FollowsContext,
} from "../utils/context/context";
import ProductCard from "./utility-components/product-card";
import DisplayProductModal from "./display-product-modal";
import { useRouter } from "next/router";
import parseTags, { ProductData } from "./utility/product-parser-functions";
import ShopstrSpinner from "./utility-components/shopstr-spinner";
import { DeleteListing } from "../pages/api/nostr/crud-service";
import { Button } from "@nextui-org/react";
import { SHOPSTRBUTTONCLASSNAMES } from "./utility/STATIC-VARIABLES";
import { DateTime } from "luxon";

const DisplayEvents = ({
  focusedPubkey,
  selectedCategories,
  selectedLocation,
  selectedSearch,
  canShowLoadMore,
  wotFilter,
  isMyListings,
}: {
  focusedPubkey?: string;
  selectedCategories: Set<string>;
  selectedLocation: string;
  selectedSearch: string;
  canShowLoadMore?: boolean;
  wotFilter?: boolean;
  isMyListings?: boolean;
}) => {
  const [productEvents, setProductEvents] = useState<ProductData[]>([]);
  const [isProductsLoading, setIsProductLoading] = useState(true);
  const productEventContext = useContext(ProductContext);
  const profileMapContext = useContext(ProfileMapContext);
  const followsContext = useContext(FollowsContext);
  const [focusedProduct, setFocusedProduct] = useState(""); // product being viewed in modal
  const [showModal, setShowModal] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const router = useRouter();

  const { userPubkey } = getLocalStorageData();

  useEffect(() => {
    if (!productEventContext) return;
    if (!productEventContext.isLoading && productEventContext.productEvents) {
      setIsProductLoading(true);
      let sortedProductEvents = [
        ...productEventContext.productEvents.sort(
          (a: NostrEvent, b: NostrEvent) => b.created_at - a.created_at,
        ),
      ]; // sorts most recently created to least recently created
      let parsedProductData: ProductData[] = [];
      sortedProductEvents.forEach((event) => {
        if (wotFilter) {
          if (!followsContext.isLoading && followsContext.followList) {
            const followList = followsContext.followList;
            if (followList.length > 0 && followList.includes(event.pubkey)) {
              let parsedData = parseTags(event);
              if (parsedData) parsedProductData.push(parsedData);
            }
          }
        } else {
          let parsedData = parseTags(event);
          if (parsedData) parsedProductData.push(parsedData);
        }
      });
      setProductEvents(parsedProductData);
      setIsProductLoading(false);
    }
  }, [productEventContext, wotFilter]);

  const isThereAFilter = () => {
    return (
      selectedCategories.size > 0 ||
      selectedLocation ||
      selectedSearch.length > 0 ||
      focusedPubkey
    );
  };

  const handleDelete = async (productId: string, passphrase?: string) => {
    try {
      await DeleteListing([productId], passphrase);
      productEventContext.removeDeletedProductEvent(productId);
    } catch (e) {
      console.log(e);
    }
  };

  const handleToggleModal = () => {
    setShowModal(!showModal);
  };

  const onProductClick = (product: any) => {
    setFocusedProduct(product);
    setShowModal(true);
  };

  const handleSendMessage = (pubkeyToOpenChatWith: string) => {
    let { signInMethod } = getLocalStorageData();
    if (!signInMethod) {
      alert("You must be signed in to send a message!");
      return;
    }
    setShowModal(false);
    router.push({
      pathname: "/messages",
      query: { pk: nip19.npubEncode(pubkeyToOpenChatWith) },
    });
  };

  const handleReviewAndPurchase = (productId: string) => {
    setShowModal(false);
    router.push(`/listing/${productId}`);
  };

  const productSatisfiesCategoryFilter = (productData: ProductData) => {
    if (selectedCategories.size === 0) return true;
    return Array.from(selectedCategories).some((selectedCategory) => {
      const re = new RegExp(selectedCategory, "gi");
      return productData?.categories?.some((category) => {
        const match = category.match(re);
        return match && match.length > 0;
      });
    });
  };

  const productSatisfieslocationFilter = (productData: ProductData) => {
    return !selectedLocation || productData.location === selectedLocation;
  };

  const productSatisfiesSearchFilter = (productData: ProductData) => {
    if (!selectedSearch) return true; // nothing in search bar
    if (!productData.title) return false; // we don't want to display it if product has no title
    const re = new RegExp(selectedSearch, "gi");
    const match = productData.title.match(re);
    return match && match.length > 0;
  };

  const productSatisfiesAllFilters = (productData: ProductData) => {
    return (
      productSatisfiesCategoryFilter(productData) &&
      productSatisfieslocationFilter(productData) &&
      productSatisfiesSearchFilter(productData)
    );
  };

  const displayProductCard = (
    productData: ProductData,
    index: number,
    handleSendMessage: (pubkeyToOpenChatWith: string) => void,
  ) => {
    if (focusedPubkey && productData.pubkey !== focusedPubkey) return;
    if (!productSatisfiesAllFilters(productData)) return;

    if (
      (productData.pubkey ===
        "95a5e73109d4c419456372ce99bbf5823dfb6f77aed58d03f77ea052f150ee4a" ||
        productData.pubkey ===
          "773ed8aba7ee59f6f24612533e891450b6197b5ca24e7680209adb944e330e2f" ||
        productData.pubkey ===
          "0914be24d8269be22bce80bdc4319bbe7663fd9f84f53288ee9cad94a34cda43") &&
      userPubkey !== productData.pubkey
    ) {
      return; // temp fix, add adult categories or separate from global later
    }

    return (
      <ProductCard
        key={productData.id + "-" + index}
        uniqueKey={productData.id + "-" + index}
        productData={productData}
        onProductClick={onProductClick}
      />
    );
  };

  const loadMoreListings = async () => {
    try {
      setIsLoadingMore(true);
      if (productEventContext.isLoading) return;
      productEventContext.isLoading = true;
      const oldestListing =
        productEvents.length > 0
          ? productEvents[productEvents.length - 1]
          : null;
      const oldestListingCreatedAt = oldestListing
        ? oldestListing.createdAt
        : Math.trunc(DateTime.now().toSeconds());
      const since = Math.trunc(
        DateTime.fromSeconds(oldestListingCreatedAt)
          .minus({ days: 14 })
          .toSeconds(),
      );

      const pool = new SimplePool();
      const filter: Filter = {
        kinds: [30402],
        since,
        until: oldestListingCreatedAt,
      };
      const events = await pool.querySync(getLocalStorageData().relays, filter);
      events.forEach((event) => {
        if (event.id !== oldestListing?.id) {
          productEventContext.addNewlyCreatedProductEvent(event);
        }
      });
      productEventContext.isLoading = false;
      setIsLoadingMore(false);
    } catch (err) {
      console.log(err);
      productEventContext.isLoading = false;
      setIsLoadingMore(false);
    }
  };

  return (
    <>
      <div className="w-full md:pl-4">
        {/* DISPLAYS PRODUCT LISTINGS HERE */}
        {productEvents.length != 0 ? (
          <div className="grid h-[90%] max-w-full grid-cols-[repeat(auto-fill,minmax(300px,1fr))] justify-items-center gap-4 overflow-x-hidden">
            {productEvents.map((productData: ProductData, index) => {
              return displayProductCard(productData, index, handleSendMessage);
            })}
          </div>
        ) : (
          wotFilter &&
          !isProductsLoading && (
            <p className="mt-4 break-words text-center text-2xl text-light-text dark:text-dark-text">
              No products found...
              <br></br>
              <br></br>Try turning of the trust filter!
            </p>
          )
        )}
        {isThereAFilter() &&
          !isProductsLoading &&
          !productEvents.some((product) =>
            productSatisfiesAllFilters(product),
          ) && (
            <p className="mt-4 break-words text-center text-2xl text-light-text dark:text-dark-text">
              No products found...
              <br></br>
              <br></br>Try loading more!
            </p>
          )}
        {isMyListings &&
          !isProductsLoading &&
          !productEvents.some((product) => product.pubkey === userPubkey) && (
            <p className="mt-4 break-words text-center text-2xl text-light-text dark:text-dark-text">
              No products found...
              <br></br>
              <br></br>Try adding a new listing, or load more!
            </p>
          )}
        {profileMapContext.isLoading ||
        productEventContext.isLoading ||
        isProductsLoading ||
        isLoadingMore ? (
          <div className="mt-8 flex items-center justify-center">
            <ShopstrSpinner />
          </div>
        ) : canShowLoadMore && productEvents.length != 0 ? (
          <div className="mt-8 h-20 px-4">
            <Button
              className={`${SHOPSTRBUTTONCLASSNAMES} w-full`}
              onClick={async () => await loadMoreListings()}
            >
              Load More . . .
            </Button>
          </div>
        ) : null}
      </div>
      <DisplayProductModal
        productData={focusedProduct}
        showModal={showModal}
        handleModalToggle={handleToggleModal}
        handleSendMessage={handleSendMessage}
        handleReviewAndPurchase={handleReviewAndPurchase}
        handleDelete={handleDelete}
      />
    </>
  );
};

export default DisplayEvents;
