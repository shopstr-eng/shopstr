import { useState, useEffect, useContext } from "react";
import { nip19 } from "nostr-tools";
import { deleteEvent } from "@/utils/nostr/nostr-helper-functions";
import { NostrEvent } from "../utils/types/types";
import {
  ProductContext,
  ProfileMapContext,
  FollowsContext,
} from "../utils/context/context";
import ProductCard from "./utility-components/product-card";
import DisplayProductModal from "./display-product-modal";
import { SHOPSTRBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";
import { Button, Pagination } from "@nextui-org/react";
import ShopstrSpinner from "./utility-components/shopstr-spinner";
import { useRouter } from "next/router";
import parseTags, {
  ProductData,
} from "@/utils/parsers/product-parser-functions";
import {
  NostrContext,
  SignerContext,
} from "@/components/utility-components/nostr-context-provider";

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
  searchBarRef?: React.RefObject<HTMLDivElement>;
}) => {
  const [productEvents, setProductEvents] = useState<ProductData[]>([]);
  const [isProductsLoading, setIsProductLoading] = useState(true);
  const productEventContext = useContext(ProductContext);
  const profileMapContext = useContext(ProfileMapContext);
  const followsContext = useContext(FollowsContext);
  const [focusedProduct, setFocusedProduct] = useState<ProductData>();
  const [showModal, setShowModal] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 40;
  const [filteredProducts, setFilteredProducts] = useState<ProductData[]>([]);
  const [totalPages, setTotalPages] = useState(1);

  const router = useRouter();

  const { nostr } = useContext(NostrContext);
  const { signer, pubkey: userPubkey } = useContext(SignerContext);

  useEffect(() => {
    if (!productEventContext) return;
    if (!productEventContext.isLoading && productEventContext.productEvents) {
      setIsProductLoading(true);
      const sortedProductEvents = [
        ...productEventContext.productEvents.sort(
          (a: NostrEvent, b: NostrEvent) => b.created_at - a.created_at
        ),
      ];
      const parsedProductData: ProductData[] = [];
      sortedProductEvents.forEach((event) => {
        if (wotFilter) {
          if (!followsContext.isLoading && followsContext.followList) {
            const followList = followsContext.followList;
            if (followList.length > 0 && followList.includes(event.pubkey)) {
              const parsedData = parseTags(event);
              if (parsedData) parsedProductData.push(parsedData);
            }
          }
        } else {
          const parsedData = parseTags(event);
          if (parsedData) parsedProductData.push(parsedData);
        }
      });
      setProductEvents(parsedProductData);
      setIsProductLoading(false);
    }
  }, [productEventContext, wotFilter]);

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
    if (!productEvents) return;

    const filtered = productEvents.filter((product) => {
      if (focusedPubkey && product.pubkey !== focusedPubkey) return false;
      if (!productSatisfiesAllFilters(product)) return false;
      if (!product.currency) return false;
      if (product.images.length === 0) return false;
      if (product.contentWarning) return false;
      if (
        product.pubkey === "3da2082b7aa5b76a8f0c134deab3f7848c3b5e3a3079c65947d88422b69c1755" &&
        userPubkey !== product.pubkey
      ) {
        return false;
      }
      return true;
    });

    setFilteredProducts(filtered);
    setTotalPages(Math.max(1, Math.ceil(filtered.length / itemsPerPage)));

    setCurrentPage(1);

    onFilteredProductsChange?.(filtered);
  }, [
    productEvents,
    selectedSearch,
    selectedLocation,
    selectedCategories,
    focusedPubkey,
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
    } catch (_) {
      return;
    }
  };

  const handleToggleModal = () => {
    setShowModal(!showModal);
  };

  const onProductClick = (product: ProductData) => {
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
    if (!selectedSearch) return true;
    if (!productData.title) return false;

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
    }

    if (selectedSearch.includes("npub")) {
      try {
        const parsedNpub = nip19.decode(selectedSearch);
        if (parsedNpub.type === "npub") {
          return parsedNpub.data === productData.pubkey;
        }
        return false;
      } catch (_) {
        return false;
      }
    }

    try {
      const re = new RegExp(selectedSearch, "gi");

      const titleMatch = productData.title.match(re);
      if (titleMatch && titleMatch.length > 0) return true;

      if (productData.summary) {
        const summaryMatch = productData.summary.match(re);
        if (summaryMatch && summaryMatch.length > 0) return true;
      }

      const numericSearch = parseFloat(selectedSearch);
      if (!isNaN(numericSearch) && productData.price === numericSearch) {
        return true;
      }

      return false;
    } catch (_) {
      return false;
    }
  };

  const productSatisfiesAllFilters = (productData: ProductData) => {
    return (
      productSatisfiesCategoryFilter(productData) &&
      productSatisfieslocationFilter(productData) &&
      productSatisfiesSearchFilter(productData)
    );
  };

  const getCurrentPageProducts = () => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;

    return filteredProducts.slice(startIndex, endIndex);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  return (
    <>
      <div className="w-full md:pl-4">
        {filteredProducts.length > 0 ? (
          <>
            <div className="grid max-w-full grid-cols-[repeat(auto-fill,minmax(300px,1fr))] justify-items-center gap-4 overflow-x-hidden">
              {getCurrentPageProducts().map((productData: ProductData, index) => (
                <ProductCard
                  key={productData.id + "-" + index}
                  productData={productData}
                  onProductClick={onProductClick}
                />
              ))}
            </div>

            {totalPages > 1 && (
              <div className="mt-8 flex justify-center">
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

            <div className="mt-4 text-center text-sm text-light-text dark:text-dark-text">
              Showing {(currentPage - 1) * itemsPerPage + 1} to{" "}
              {Math.min(
                filteredProducts.length,
                currentPage * itemsPerPage
              )}{" "}
              of {filteredProducts.length} products
            </div>
          </>
        ) : (
          wotFilter &&
          !isProductsLoading && (
            <p className="mt-4 break-words text-center text-2xl text-light-text dark:text-dark-text">
              No products found...
              <br />
              <br />
              Try turning off the trust filter!
            </p>
          )
        )}
        {isMyListings &&
          !isProductsLoading &&
          !productEvents.some((product) => product.pubkey === userPubkey) && (
            <div className="mt-20 flex flex-grow items-center justify-center py-10">
              <div className="w-full max-w-lg rounded-lg bg-light-fg p-8 text-center shadow-lg dark:bg-dark-fg">
                <p className="text-3xl font-semibold text-light-text dark:text-dark-text">
                  No products found...
                </p>
                <p className="mt-4 text-lg text-light-text dark:text-dark-text">
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
        {!isMyListings &&
        (profileMapContext.isLoading ||
          productEventContext.isLoading ||
          isProductsLoading) ? (
          <div className="mb-6 mt-6 flex items-center justify-center">
            <ShopstrSpinner />
          </div>
        ) : null}
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

