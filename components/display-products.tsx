import { useState, useEffect, useContext } from "react";
import { nip19 } from "nostr-tools";
import { deleteEvent } from "./utility/nostr-helper-functions";
import { NostrEvent } from "../utils/types/types";
import {
  ProductContext,
  ProfileMapContext,
  FollowsContext,
} from "../utils/context/context";
import ProductCard from "./utility-components/product-card";
import DisplayProductModal from "./display-product-modal";
import ShopstrSpinner from "./utility-components/shopstr-spinner";
import { useRouter } from "next/router";
import parseTags, { ProductData } from "./utility/product-parser-functions";
import { NostrContext, SignerContext } from "@/utils/context/nostr-context";

const DisplayProducts = ({
  focusedPubkey,
  selectedCategories,
  selectedLocation,
  selectedSearch,
  wotFilter,
  isMyListings,
  setCategories,
  onFilteredProductsChange,
}: {
  focusedPubkey?: string;
  selectedCategories: Set<string>;
  selectedLocation: string;
  selectedSearch: string;
  wotFilter?: boolean;
  isMyListings?: boolean;
  setCategories?: (categories: string[]) => void;
  onFilteredProductsChange?: (products: ProductData[]) => void;
}) => {
  const [productEvents, setProductEvents] = useState<ProductData[]>([]);
  const [isProductsLoading, setIsProductLoading] = useState(true);
  const productEventContext = useContext(ProductContext);
  const profileMapContext = useContext(ProfileMapContext);
  const followsContext = useContext(FollowsContext);
  const [focusedProduct, setFocusedProduct] = useState(""); // product being viewed in modal
  const [showModal, setShowModal] = useState(false);

  const router = useRouter();

  const { nostr } = useContext(NostrContext);
  const { signer, pubkey: userPubkey } = useContext(SignerContext);

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

  useEffect(() => {
    if (focusedPubkey && setCategories) {
      let productCategories: string[] = [];
      productEvents.forEach((event) => {
        if (event.pubkey === focusedPubkey) {
          productCategories.push(...event.categories);
        }
      });
      setCategories(productCategories);
    }
  }, [productEvents, focusedPubkey]);

  useEffect(() => {
    if (!productEvents) return;

    const filteredProducts = productEvents.filter(productSatisfiesAllFilters);
    onFilteredProductsChange?.(filteredProducts);
  }, [
    productEvents,
    selectedSearch,
    selectedLocation,
    selectedCategories,
    focusedPubkey,
  ]);

  const isThereAFilter = () => {
    return (
      selectedCategories.size > 0 ||
      selectedLocation ||
      selectedSearch.length > 0 ||
      focusedPubkey
    );
  };

  const handleDelete = async (productId: string) => {
    try {
      await deleteEvent(nostr!, signer!, [productId]);
      productEventContext.removeDeletedProductEvent(productId);
    } catch (_) {
      return;
    }
  };

  const handleToggleModal = () => {
    setShowModal(!showModal);
  };

  const onProductClick = (product: any) => {
    setFocusedProduct(product);
    if (product.pubkey === userPubkey) {
      setShowModal(true);
    } else {
      setShowModal(false);
      const naddr = nip19.naddrEncode({
        identifier: product.d as string,
        pubkey: product.pubkey,
        kind: 30402,
      });
      if (naddr) {
        router.push(`/listing/${naddr}`);
      } else if (product.d !== undefined) {
        router.push(`/listing/${product.d}`);
      } else {
        router.push(`/listing/${product.id}`);
      }
    }
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
    if (selectedSearch.includes("naddr")) {
      try {
        const parsedNaddr = nip19.decode(selectedSearch);
        if (parsedNaddr.type === "naddr") {
          return (
            productData.d === parsedNaddr.data.identifier &&
            productData.pubkey === parsedNaddr.data.pubkey
          );
        }
        return false;
      } catch (_) {
        return false;
      }
    } else if (selectedSearch.includes("npub")) {
      try {
        const parsedNpub = nip19.decode(selectedSearch);
        if (parsedNpub.type === "npub") {
          return parsedNpub.data === productData.pubkey;
        }
      } catch (_) {
        return false;
      }
    } else {
      try {
        const re = new RegExp(selectedSearch, "gi");
        const match = productData.title.match(re);
        return match && match.length > 0;
      } catch (_) {
        return false;
      }
    }
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
    if (!productData.currency) return;
    if (productData.images.length === 0) return;
    if (productData.contentWarning) return;

    return (
      <ProductCard
        key={productData.id + "-" + index}
        productData={productData}
        onProductClick={onProductClick}
      />
    );
  };

  return (
    <>
      <div className="w-full md:pl-4">
        {/* DISPLAYS PRODUCT LISTINGS HERE */}
        {productEvents.length != 0 ? (
          <div className="grid max-w-full grid-cols-[repeat(auto-fill,minmax(300px,1fr))] justify-items-center gap-4 overflow-x-hidden">
            {productEvents.map((productData: ProductData, index) => {
              return displayProductCard(productData, index);
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
              <br></br>Try adding a new listing!
            </p>
          )}
        {profileMapContext.isLoading ||
        productEventContext.isLoading ||
        isProductsLoading ? (
          <div className="mb-6 mt-6 flex items-center justify-center">
            <ShopstrSpinner />
          </div>
        ) : null}
      </div>
      <DisplayProductModal
        productData={focusedProduct}
        showModal={showModal}
        handleModalToggle={handleToggleModal}
        handleDelete={handleDelete}
      />
    </>
  );
};

export default DisplayProducts;
