import { useState, useEffect, useContext } from "react";
import { nip19 } from "nostr-tools";
import {
  DeleteListing,
  NostrEvent,
  getLocalStorageData,
} from "./utility/nostr-helper-functions";
import { ProductContext } from "../context";
import ProductCard, {
  TOTALPRODUCTCARDWIDTH,
} from "./utility-components/product-card";
import DisplayProductModal from "./display-product-modal";
import { useRouter } from "next/router";
import parseTags, { ProductData } from "./utility/product-parser-functions";
import { Spinner } from "@nextui-org/react";
import ShopstrSpinner from "./utility-components/shopstr-spinner";

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
  const [productEvents, setProductEvents] = useState<NostrEvent[]>([]);
  const [filteredProductData, setFilteredProductData] = useState<ProductData[]>(
    [],
  );
  const [deletedProducts, setDeletedProducts] = useState<string[]>([]); // list of product ids that have been deleted
  const [isProductsLoading, setIsProductLoading] = useState(true);
  const productEventContext = useContext(ProductContext);
  const [focusedProduct, setFocusedProduct] = useState(""); // product being viewed in modal
  const [showModal, setShowModal] = useState(false);
  const router = useRouter();
  const [passphrase, setPassphrase] = useState(""); // NEEDED FOR DELETE LISTING

  useEffect(() => {
    if (!productEventContext) return;
    if (!productEventContext.isLoading && productEventContext.productEvents) {
      // is product sub reaches eose then we can sort the product data
      let sortedProductEvents = [
        ...productEventContext.productEvents.sort(
          (a, b) => b.created_at - a.created_at,
        ),
      ]; // sorts most recently created to least recently created
      setProductEvents(sortedProductEvents);
      return;
    }
  }, [productEventContext]);

  /** FILTERS PRODUCT DATA ON CATEGORY, LOCATION, FOCUSED PUBKEY (SELLER) **/
  useEffect(() => {
    setIsProductLoading(true);
    let filteredEvents = productEvents.filter((event) => {
      // gets rid of products that were deleted
      return !deletedProducts.includes(event.id);
    });
    let filteredProductData = filteredEvents.map((event) => {
      return parseTags(event);
    });

    if (productEvents && !isProductsLoading && filteredProductData) {
      if (focusedPubkey) {
        filteredProductData = filteredProductData.filter(
          (productData: ProductData) => productData.pubkey === focusedPubkey,
        );
      }
      filteredProductData = filteredProductData.filter(
        (productData: ProductData) => {
          if (!productData.categories) return false;
          return (
            selectedCategories.size === 0 ||
            Array.from(selectedCategories).some((selectedCategory) => {
              const re = new RegExp(selectedCategory, "gi");
              return productData.categories.some((category) => {
                const match = category.match(re);
                return match && match.length > 0;
              });
            })
          );
        },
      );
      filteredProductData = filteredProductData.filter(
        (productData: ProductData) => {
          return !selectedLocation || productData.location === selectedLocation;
        },
      );
      filteredProductData = filteredProductData.filter(
        (productData: ProductData) => {
          if (!selectedSearch) return true; // nothing in search bar
          if (!productData.title) return true; // product has no title
          const re = new RegExp(selectedSearch, "gi");
          const match = productData.title.match(re);
          return match && match.length > 0;
        },
      );
    }
    setFilteredProductData(filteredProductData);
    setIsProductLoading(false);
  }, [
    productEvents,
    selectedCategories,
    selectedLocation,
    selectedSearch,
    focusedPubkey,
    deletedProducts,
  ]);

  const isThereAFilter = () => {
    return (
      selectedCategories.size > 0 ||
      selectedLocation ||
      selectedSearch.length > 0 ||
      focusedPubkey
    );
  };

  const handleDelete = async (productId: string, passphrase: string) => {
    try {
      await DeleteListing([productId], passphrase);
      setDeletedProducts((deletedProducts) => [...deletedProducts, productId]);
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
      pathname: "/direct-messages",
      query: { pk: nip19.npubEncode(pubkeyToOpenChatWith) },
    });
  };

  const handleCheckout = (productId: string) => {
    let { signIn } = getLocalStorageData();
    if (!signIn) {
      alert("You must be signed in to checkout!");
      return;
    }
    setShowModal(false);
    router.push(`/checkout/${productId}`);
  };

  const getSpacerCardsNeeded = () => {
    const cardsOnEachRow = Math.floor(screen.width / TOTALPRODUCTCARDWIDTH);
    const spacerCardsNeeded =
      cardsOnEachRow - (filteredProductData.length % cardsOnEachRow);

    if (cardsOnEachRow == 1) return <></>; // no need for a spacer card cause each row is 1
    if (filteredProductData.length % cardsOnEachRow == 0) return <></>; // no need for a spacer card cause each row is filled up

    const spacerCards = [];
    let spacerCardWidth = "w-[385px] h-[300px]";
    for (let i = 0; i < spacerCardsNeeded; i++) {
      spacerCards.push(<div className={spacerCardWidth}></div>);
    }
    return spacerCards;
  };

  return (
    <>
      <div className="h-full bg-light-bg dark:bg-dark-bg">
        <div className="h-16">
          {/*spacer div needed to account for the header (Navbar and categories}*/}
        </div>
        {/* DISPLAYS PRODUCT LISTINGS HERE */}
        {isProductsLoading || filteredProductData.length === 0 ? (
          isThereAFilter() ? (
            <div className="mt-8 flex items-center justify-center">
              <h1 className="text-2xl text-light-text dark:text-dark-text">
                No products found
              </h1>
            </div>
          ) : (
            <div className="mt-8 flex items-center justify-center">
              <ShopstrSpinner />
            </div>
          )
        ) : (
          <div className="my-2 flex h-[90%] max-w-full flex-row flex-wrap justify-evenly overflow-x-hidden overflow-y-hidden">
            {filteredProductData.map((productData: ProductData, index) => {
              return (
                <ProductCard
                  uniqueKey={productData.id + "-" + index}
                  productData={productData}
                  onProductClick={onProductClick}
                />
              );
            })}
            {getSpacerCardsNeeded()}
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
        handleCheckout={handleCheckout}
        handleDelete={handleDelete}
      />
    </>
  );
};

export default DisplayEvents;
