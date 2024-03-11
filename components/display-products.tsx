import { useState, useEffect, useContext, memo } from "react";
import { Filter, SimplePool, nip19 } from "nostr-tools";
import { getLocalStorageData } from "./utility/nostr-helper-functions";
import { NostrEvent } from "../utils/types/types";
import { MyListingsContext, ProductContext } from "../utils/context/context";
import ProductCard from "./utility-components/product-card";
import DisplayProductModal from "./display-product-modal";
import { useRouter } from "next/router";
import parseTags, { ProductData } from "./utility/product-parser-functions";
import ShopstrSpinner from "./utility-components/shopstr-spinner";
import { DeleteListing } from "../pages/api/nostr/crud-service";
import { Button } from "@nextui-org/react";
import { SHOPSTRBUTTONCLASSNAMES } from "./utility/STATIC-VARIABLES";
import { DateTime } from "luxon";
import { getNameToCodeMap } from "@/utils/location/location";
import { getKeywords } from "@/utils/text";

const DisplayEvents = ({
  focusedPubkey,
  canShowLoadMore,
  context,
}: {
  focusedPubkey?: string;
  canShowLoadMore?: boolean;
  context: typeof ProductContext | typeof MyListingsContext;
}) => {
  const productEventContext = useContext(context);

  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [focusedProduct, setFocusedProduct] = useState<ProductData>(); // product being viewed in modal
  const [showModal, setShowModal] = useState(false);

  const router = useRouter();

  useEffect(() => {
    setIsLoading(productEventContext.isLoading);
  }, [productEventContext.isLoading]);

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

  const displayProductCard = (
    productData: ProductData,
    index: number,
    handleSendMessage: (pubkeyToOpenChatWith: string) => void,
  ) => {
    if (focusedPubkey && productData.pubkey !== focusedPubkey) return;
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
      const oldestListing =
        productEventContext.productEvents.length > 0
          ? productEventContext.productEvents[
              productEventContext.productEvents.length - 1
            ]
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
        ...(productEventContext.filters.searchQuery.length > 0 && {
          "#s": getKeywords(productEventContext.filters.searchQuery),
        }),
        ...(productEventContext.filters.location && {
          "#g": [getNameToCodeMap(productEventContext.filters.location)],
        }),
        ...(productEventContext.filters.categories.size > 0 && {
          "#t": Array.from(productEventContext.filters.categories),
        }),
      };
      const events = await pool.querySync(getLocalStorageData().relays, filter);
      events.forEach((event) => {
        if (event.id !== oldestListing?.id) {
          const product = parseTags(event);
          if (product) {
            productEventContext.addNewlyCreatedProductEvents([product]);
          }
        }
      });
      setIsLoadingMore(false);
    } catch (err) {
      console.log(err);
      setIsLoadingMore(false);
    }
  };

  return (
    <>
      <div className="w-full md:pl-4">
        {isLoading ? (
          <div className="mt-8 flex items-center justify-center">
            <ShopstrSpinner />
          </div>
        ) : (
          <div className="grid h-[90%] max-w-full grid-cols-[repeat(auto-fill,minmax(300px,1fr))] justify-items-center gap-4 overflow-x-hidden">
            {productEventContext.productEvents.map(
              (productData: ProductData, index) => {
                return displayProductCard(
                  productData,
                  index,
                  handleSendMessage,
                );
              },
            )}
          </div>
        )}
        {canShowLoadMore && !isLoading ? (
          isLoadingMore ? (
            <div className="mt-8 flex items-center justify-center">
              <ShopstrSpinner />
            </div>
          ) : (
            <div className="mt-8 h-20 px-4">
              <Button
                className={`${SHOPSTRBUTTONCLASSNAMES} w-full`}
                onClick={async () => await loadMoreListings()}
              >
                Load More
              </Button>
            </div>
          )
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
