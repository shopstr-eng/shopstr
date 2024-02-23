import { useState, useEffect, useContext } from "react";
import { nip19 } from "nostr-tools";
import { getLocalStorageData } from "./utility/nostr-helper-functions";
import { NostrEvent } from "../pages/types";
import { ProductContext, ProfileMapContext } from "../pages/context";
import ProductCard from "./utility-components/product-card";
import DisplayProductModal from "./display-product-modal";
import { useRouter } from "next/router";
import parseTags, { ProductData } from "./utility/product-parser-functions";
import ShopstrSpinner from "./utility-components/shopstr-spinner";
import { DeleteListing } from "../pages/api/nostr/crud-service";
import { removeProductFromCache } from "../pages/api/nostr/cache-service";

const DisplayEvents = ({
  focusedPubkey,
  selectedCategories,
  selectedLocation,
  selectedSearch,
}: {
  focusedPubkey?: string;
  selectedCategories: Set<string>;
  selectedLocation: string;
  selectedSearch: string;
}) => {
  const [productEvents, setProductEvents] = useState<ProductData[]>([]);
  const [isProductsLoading, setIsProductLoading] = useState(true);
  const productEventContext = useContext(ProductContext);
  const profileMapContext = useContext(ProfileMapContext);
  const [focusedProduct, setFocusedProduct] = useState(""); // product being viewed in modal
  const [showModal, setShowModal] = useState(false);
  const router = useRouter();

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
        let parsedData = parseTags(event);
        if (parsedData) parsedProductData.push(parsedData);
      });
      setIsProductLoading(false);
      setProductEvents(parsedProductData);
    }
  }, [productEventContext]);

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
    let { signIn } = getLocalStorageData();
    if (!signIn) {
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

  const displayProductCard = (productData: ProductData, index: number) => {
    if (focusedPubkey && productData.pubkey !== focusedPubkey) return;
    if (!productSatisfiesAllFilters(productData)) return;
    return (
      <ProductCard
        key={productData.id + "-" + index}
        uniqueKey={productData.id + "-" + index}
        productData={productData}
        onProductClick={onProductClick}
      />
    );
  };

  return (
    <>
      <div className="mx-auto w-full">
        {/* DISPLAYS PRODUCT LISTINGS HERE */}
        {profileMapContext.isLoading ||
        isProductsLoading ||
        productEvents.length === 0 ? (
          !isProductsLoading && isThereAFilter() ? (
            <div className="mt-8 flex items-center justify-center">
              <h1 className="text-2xl text-light-text dark:text-dark-text">
                No products found...
              </h1>
            </div>
          ) : (
            <div className="mt-8 flex items-center justify-center">
              <ShopstrSpinner />
            </div>
          )
        ) : (
          <div className="my-2 flex h-[90%] max-w-full flex-row flex-wrap justify-evenly overflow-x-hidden overflow-y-hidden">
            {productEvents.map((productData: ProductData, index) => {
              return displayProductCard(productData, index);
            })}
          </div>
        )}
        <div className="h-20">
          {/*spacer div needed to account for the footer buttons*/}
        </div>
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
