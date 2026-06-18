import { useState, useEffect, useContext } from "react";
import { deleteEvent } from "@/utils/nostr/nostr-helper-functions";
import { NostrEvent } from "../utils/types/types";
import {
  ProductContext,
  FollowsContext,
  RelaysContext,
} from "../utils/context/context";
import ProductCard from "./utility-components/product-card";
import DisplayProductModal from "./display-product-modal";
import { SHOPSTRBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";
import { Button, Pagination } from "@heroui/react";
import ShopstrSpinner from "./utility-components/shopstr-spinner";
import { useRouter } from "next/router";
import parseTags, {
  ProductData,
} from "@/utils/parsers/product-parser-functions";
import { parseZapsnagNote } from "@/utils/parsers/zapsnag-parser";
import {
  NostrContext,
  SignerContext,
} from "@/components/utility-components/nostr-context-provider";
import { productSatisfiesAllFilters } from "@/utils/parsers/product-filter-helpers";
import { storage } from "@/utils/storage";
import {
  dedupeProductEvents,
  fetchNip50ProductSearch,
  getProductEventKey,
} from "@/utils/nostr/fetch-service";
import { getListingSlug } from "@/utils/url-slugs";
import { nip19 } from "nostr-tools";

const isNip19SearchQuery = (search: string) => {
  const normalizedSearch = search.trim();
  return (
    normalizedSearch.includes("naddr1") || normalizedSearch.includes("npub1")
  );
};

const DisplayProducts = ({
  focusedPubkey,
  selectedCategories,
  selectedLocation,
  selectedSearch,
  wotFilter,
  isMyListings,
  setCategories,
  onFilteredProductsChange,
  searchBarRef,
}: {
  focusedPubkey?: string;
  selectedCategories: Set<string>;
  selectedLocation: string;
  selectedSearch: string;
  wotFilter?: boolean;
  isMyListings?: boolean;
  setCategories?: (categories: string[]) => void;
  onFilteredProductsChange?: (products: ProductData[]) => void;
  searchBarRef?: React.RefObject<HTMLDivElement | null>;
}) => {
  const [productEvents, setProductEvents] = useState<ProductData[]>([]);
  const [isProductsLoading, setIsProductLoading] = useState(true);
  const [nip50ProductEvents, setNip50ProductEvents] = useState<NostrEvent[]>(
    []
  );
  const [isNip50SearchLoading, setIsNip50SearchLoading] = useState(false);
  const productEventContext = useContext(ProductContext);
  const followsContext = useContext(FollowsContext);
  const relaysContext = useContext(RelaysContext);
  const [focusedProduct, setFocusedProduct] = useState<ProductData>();
  const [showModal, setShowModal] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 42;
  const [filteredProducts, setFilteredProducts] = useState<ProductData[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [isInitialized, setIsInitialized] = useState(false);

  const router = useRouter();

  const { nostr } = useContext(NostrContext);
  const { signer, pubkey: userPubkey } = useContext(SignerContext);

  const searchRelaysKey = Array.from(
    new Set([
      ...(relaysContext.relayList || []),
      ...(relaysContext.readRelayList || []),
    ])
  )
    .filter(Boolean)
    .join("|");

  // Load saved page from session storage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const storageKey = focusedPubkey
        ? `marketplace-page-${focusedPubkey}`
        : "marketplace-page-general";
      const savedPage = storage.getSessionItem(storageKey);
      if (savedPage) {
        const pageNum = parseInt(savedPage, 10);
        if (!isNaN(pageNum) && pageNum > 0) {
          setCurrentPage(pageNum);
        }
      }
      setIsInitialized(true);
    }
  }, [focusedPubkey]);

  useEffect(() => {
    const normalizedSearch = selectedSearch.trim();

    if (!normalizedSearch || isNip19SearchQuery(normalizedSearch) || !nostr) {
      setNip50ProductEvents([]);
      setIsNip50SearchLoading(false);
      return;
    }

    const relaysToSearch = searchRelaysKey ? searchRelaysKey.split("|") : [];

    let didCancel = false;
    setIsNip50SearchLoading(true);

    fetchNip50ProductSearch(nostr, relaysToSearch, normalizedSearch, {
      authors: focusedPubkey ? [focusedPubkey] : undefined,
    })
      .then(({ productEvents }) => {
        if (didCancel) return;
        setNip50ProductEvents(productEvents);
      })
      .catch((error) => {
        if (didCancel) return;
        setNip50ProductEvents([]);
        console.error("Failed to search products with NIP-50:", error);
      })
      .finally(() => {
        if (didCancel) return;
        setIsNip50SearchLoading(false);
      });

    return () => {
      didCancel = true;
    };
  }, [selectedSearch, focusedPubkey, nostr, searchRelaysKey]);

  useEffect(() => {
    if (!productEventContext) return;
    const hasProducts =
      productEventContext.productEvents &&
      productEventContext.productEvents.length > 0;
    const hasNip50Products = nip50ProductEvents.length > 0;
    const sourceProductEvents =
      selectedSearch.trim() && !isNip19SearchQuery(selectedSearch)
        ? dedupeProductEvents([
            ...nip50ProductEvents,
            ...[...(productEventContext.productEvents || [])].sort(
              (a: NostrEvent, b: NostrEvent) => b.created_at - a.created_at
            ),
          ])
        : [...(productEventContext.productEvents || [])].sort(
            (a: NostrEvent, b: NostrEvent) => b.created_at - a.created_at
          );

    if (hasProducts || hasNip50Products) {
      const parsedProductData: ProductData[] = [];
      sourceProductEvents.forEach((event) => {
        if (wotFilter) {
          if (!followsContext.isLoading && followsContext.followList) {
            const followList = followsContext.followList;
            if (followList.length > 0 && followList.includes(event.pubkey)) {
              let parsedData;
              if (event.kind === 1) {
                parsedData = parseZapsnagNote(event);
              } else {
                parsedData = parseTags(event);
              }
              if (parsedData) {
                parsedData.rawEvent = event;
                parsedProductData.push(parsedData);
              }
            }
          }
        } else {
          let parsedData;
          if (event.kind === 1) {
            parsedData = parseZapsnagNote(event);
          } else {
            parsedData = parseTags(event);
          }
          if (parsedData) parsedProductData.push(parsedData);
        }
      });
      setProductEvents(parsedProductData);
      if (
        parsedProductData.length >= itemsPerPage ||
        !productEventContext.isLoading
      ) {
        setIsProductLoading(false);
      }
    } else if (!productEventContext.isLoading) {
      setProductEvents([]);
      setIsProductLoading(false);
    }
  }, [productEventContext, wotFilter, nip50ProductEvents, selectedSearch]);

  useEffect(() => {
    if (focusedPubkey && setCategories) {
      const productCategories: string[] = [];
      productEvents.forEach((event) => {
        if (event.pubkey === focusedPubkey) {
          productCategories.push(...event.categories);
        }
      });
      setCategories(productCategories);
    }
  }, [productEvents, focusedPubkey]);

  useEffect(() => {
    if (!productEvents || !isInitialized) return;

    const filtered = productEvents.filter((product) => {
      if (focusedPubkey && product.pubkey !== focusedPubkey) return false;
      if (
        !productSatisfiesAllFilters(product, {
          selectedCategories,
          selectedLocation,
          selectedSearch,
        })
      )
        return false;
      if (!product.currency) return false;
      if (product.images.length === 0) return false;
      if (product.contentWarning) return false;
      if (
        product.pubkey ===
          "3da2082b7aa5b76a8f0c134deab3f7848c3b5e3a3079c65947d88422b69c1755" &&
        userPubkey !== product.pubkey
      ) {
        return false;
      }
      return true;
    });

    setFilteredProducts(filtered);
    const newTotalPages = Math.max(
      1,
      Math.ceil(filtered.length / itemsPerPage)
    );
    setTotalPages(newTotalPages);

    // Check if filter actually changed (not just from initialization)
    const prevFiltersRef = `${selectedSearch}-${selectedLocation}-${Array.from(
      selectedCategories
    ).join(",")}`;
    const currentFiltersRef = storage.getSessionItem("last-filters-ref");

    if (currentFiltersRef && currentFiltersRef !== prevFiltersRef) {
      // Filters changed, reset to page 1
      setCurrentPage(1);
      if (typeof window !== "undefined") {
        const storageKey = focusedPubkey
          ? `marketplace-page-${focusedPubkey}`
          : "marketplace-page-general";
        storage.setSessionItem(storageKey, "1");
      }
    } else if (currentPage > newTotalPages) {
      // Current page exceeds total pages, go to last page
      setCurrentPage(newTotalPages);
    }

    storage.setSessionItem("last-filters-ref", prevFiltersRef);

    onFilteredProductsChange?.(filtered);
  }, [
    productEvents,
    selectedSearch,
    selectedLocation,
    selectedCategories,
    focusedPubkey,
    isInitialized,
  ]);

  // Scroll effect only on page change
  useEffect(() => {
    // Skip initial render (currentPage === 1)
    if (currentPage === 1) return;

    const timer = requestAnimationFrame(() => {
      if (searchBarRef?.current) {
        searchBarRef.current.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
        window.scrollBy(0, -80); // Adjust for fixed header
      } else {
        window.scrollTo({
          top: 0,
          behavior: "smooth",
        });
      }
    });

    return () => cancelAnimationFrame(timer);
  }, [currentPage, searchBarRef]);

  const handleDelete = async (productId: string) => {
    try {
      await deleteEvent(nostr!, signer!, [productId]);
      productEventContext.removeDeletedProductEvent(productId);
    } catch {
      return;
    }
  };

  const handleToggleModal = () => {
    setShowModal(!showModal);
  };

  const getProductHref = (product: ProductData) => {
    if (product.pubkey === userPubkey) {
      return null;
    }

    if (product.d === "zapsnag" || product.categories?.includes("zapsnag")) {
      return `/listing/${product.id}`;
    }

    const rawProductEvent = product.rawEvent;
    const isNip50SearchResult =
      rawProductEvent?.kind === 30402 &&
      nip50ProductEvents.some(
        (event: NostrEvent) =>
          event.kind === 30402 &&
          getProductEventKey(event) === getProductEventKey(rawProductEvent)
      );

    if (isNip50SearchResult) {
      const dTag = rawProductEvent.tags.find((tag) => tag[0] === "d")?.[1];
      if (dTag) {
        try {
          return `/listing/${nip19.naddrEncode({
            identifier: dTag,
            pubkey: rawProductEvent.pubkey,
            kind: rawProductEvent.kind,
          })}`;
        } catch {
          // Fall back to the slug path if this event cannot form a valid naddr.
        }
      }
    }

    const allParsed = productEvents.filter(
      (productData) =>
        productData.d !== "zapsnag" &&
        !productData.categories?.includes("zapsnag")
    );

    const slug = getListingSlug(product, allParsed);
    if (slug) {
      return `/listing/${slug}`;
    }

    return `/listing/${product.id}`;
  };

  const onProductClick = (
    product: ProductData,
    e?: React.MouseEvent<HTMLElement> | React.KeyboardEvent<HTMLElement>
  ) => {
    setFocusedProduct(product);
    if (product.pubkey === userPubkey) {
      e?.preventDefault();
      setShowModal(true);
    } else {
      setShowModal(false);
    }
  };

  const getCurrentPageProducts = () => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;

    return filteredProducts.slice(startIndex, endIndex);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    // Save to session storage
    if (typeof window !== "undefined") {
      const storageKey = focusedPubkey
        ? `marketplace-page-${focusedPubkey}`
        : "marketplace-page-general";
      storage.setSessionItem(storageKey, page.toString());
    }
  };

  return (
    <>
      <div className="w-full md:pl-4">
        {!isMyListings && (isProductsLoading || isNip50SearchLoading) ? (
          <div className="mt-6 mb-6 flex items-center justify-center">
            <ShopstrSpinner />
          </div>
        ) : null}
        {filteredProducts.length > 0 && (
          <>
            <div className="grid max-w-full grid-cols-[repeat(auto-fill,minmax(280px,1fr))] justify-items-stretch gap-4 overflow-x-hidden">
              {getCurrentPageProducts().map(
                (productData: ProductData, index) => (
                  <ProductCard
                    key={productData.id + "-" + index}
                    productData={productData}
                    onProductClick={onProductClick}
                    href={getProductHref(productData)}
                  />
                )
              )}
            </div>

            {totalPages > 1 && (
              <div className="mt-4 flex justify-center">
                <Pagination
                  total={totalPages}
                  page={currentPage}
                  onChange={handlePageChange}
                  showControls
                  classNames={{
                    cursor: "bg-purple-500",
                  }}
                />
              </div>
            )}

            <div className="text-light-text dark:text-dark-text mt-2 mb-6 text-center text-xs">
              Showing {(currentPage - 1) * itemsPerPage + 1} to{" "}
              {Math.min(filteredProducts.length, currentPage * itemsPerPage)} of{" "}
              {filteredProducts.length} products
            </div>
          </>
        )}
        {!isMyListings &&
          !isProductsLoading &&
          !isNip50SearchLoading &&
          filteredProducts.length === 0 && (
            <div className="mt-20 flex flex-grow items-center justify-center py-10">
              <div className="bg-light-fg dark:bg-dark-fg w-full max-w-lg rounded-lg p-8 text-center shadow-lg">
                <p className="text-light-text dark:text-dark-text text-3xl font-semibold">
                  No products found...
                </p>
                <p className="text-light-text dark:text-dark-text mt-4 text-lg">
                  Try changing your search or clearing some filters.
                </p>
              </div>
            </div>
          )}
        {isMyListings &&
          !isProductsLoading &&
          !productEvents.some((product) => product.pubkey === userPubkey) && (
            <div className="mt-20 flex flex-grow items-center justify-center py-10">
              <div className="bg-light-fg dark:bg-dark-fg w-full max-w-lg rounded-lg p-8 text-center shadow-lg">
                <p className="text-light-text dark:text-dark-text text-3xl font-semibold">
                  No products found...
                </p>
                <p className="text-light-text dark:text-dark-text mt-4 text-lg">
                  Try adding a new listing!
                </p>
                <Button
                  className={`${SHOPSTRBUTTONCLASSNAMES} mt-6`}
                  onClick={() => router.push("?addNewListing")}
                >
                  Add Listing
                </Button>
              </div>
            </div>
          )}
      </div>
      {focusedProduct && (
        <DisplayProductModal
          productData={focusedProduct}
          showModal={showModal}
          handleModalToggle={handleToggleModal}
          handleDelete={handleDelete}
        />
      )}
    </>
  );
};

export default DisplayProducts;
