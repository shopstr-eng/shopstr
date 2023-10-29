import { useState, useEffect, useContext, useMemo } from "react";
import DisplayProduct from "./display-product";
import { nip19 } from "nostr-tools";
import { DeleteListing, NostrEvent } from "../nostr-helpers";
import { ProductContext } from "../context";
import ProductCard, { TOTALPRODUCTCARDWIDTH } from "./product-card";
import DisplayProductModal from "./display-product-modal";
import { set } from "react-hook-form";
import { useRouter } from "next/router";

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
  const [productData, setProductData] = useState<NostrEvent[]>([]);
  const [filteredProductData, setFilteredProductData] = useState([]);
  const [deletedProducts, setDeletedProducts] = useState<string[]>([]); // list of product ids that have been deleted
  const [isLoading, setIsLoading] = useState(true);
  const imageUrlRegExp = /(https?:\/\/.*\.(?:png|jpg|jpeg|gif))/i;
  const productDataContext = useContext(ProductContext);
  const [focusedProduct, setFocusedProduct] = useState(""); // product being viewed in modal
  const [showModal, setShowModal] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!productDataContext) return;
    setIsLoading(productDataContext.isLoading);
    if (!productDataContext.isLoading && productDataContext.productData) {
      // is product sub reaches eose then we can sort the product data
      let sortedProductData = [
        ...productDataContext.productData.sort(
          (a, b) => b.created_at - a.created_at
        ),
      ]; // sorts most recently created to least recently created
      setProductData(sortedProductData);
      return;
    }
    setProductData(productDataContext.productData);
  }, [productDataContext]);

  const displayDate = (timestamp: number): string => {
    const d = new Date(timestamp * 1000);
    const dateString = d.toLocaleString();
    return dateString;
  };

  const handleSendMessage = (pubkeyToOpenChatWith: string) => {
    setShowModal(false);
    router.push({
      pathname: "/direct-messages",
      query: { pk: nip19.npubEncode(pubkeyToOpenChatWith) },
    });
  };

  /** FILTERS PRODUCT DATA ON CATEGORY, LOCATION, FOCUSED PUBKEY (SELLER) **/
  useEffect(() => {
    let filteredData = productData.filter((event) => {
      // gets rid of products that were deleted
      return !deletedProducts.includes(event.id);
    });

    if (productData && !isLoading) {
      if (focusedPubkey) {
        filteredData = filteredData.filter(
          (event) => event.pubkey === focusedPubkey
        );
      }
      filteredData = filteredData.filter((event) => {
        // project the 'tags' 2D array to an array of categories
        const eventCategories = event.tags
          .filter((tagArray) => tagArray[0] === "t")
          .map((tagArray) => tagArray[1]);

        return (
          selectedCategories.size === 0 ||
          Array.from(selectedCategories).some((selectedCategory) => {
            const re = new RegExp(selectedCategory, "gi");
            return eventCategories.some((category) => {
              const match = category.match(re);
              return match && match.length > 0;
            });
          })
        );
      });
      filteredData = filteredData.filter((event) => {
        const eventLocation = event.tags
          .filter((tagArray) => tagArray[0] === "location")
          .map((tagArray) => tagArray[1]);
        return (
          !selectedLocation ||
          eventLocation.some((location: string) => {
            const re = new RegExp(selectedLocation, "gi");
            const match = location.match(re);
            return match && match.length > 0;
          })
        );
      });
      filteredData = filteredData.filter((event) => {
        const eventTitle = event.tags
          .filter((tagArray) => tagArray[0] === "title")
          .map((tagArray) => tagArray[1]);

        return (
          !selectedSearch ||
          eventTitle.some((title: string) => {
            const re = new RegExp(selectedSearch, "gi");
            const match = title.match(re);
            return match && match.length > 0;
          })
        );
      });
    }
    setFilteredProductData(filteredData);
  }, [
    productData,
    isLoading,
    focusedPubkey,
    selectedCategories,
    selectedLocation,
    selectedSearch,
    deletedProducts,
  ]);

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
      <div className="h-full">
        <div className="h-16">{/*spacer div*/}</div>
        {/* DISPLAYS PRODUCT LISTINGS HERE */}
        {filteredProductData.length != 0 ? (
          <div className="flex flex-row flex-wrap my-2 justify-evenly overflow-y-scroll overflow-x-hidden h-[90%] max-w-full">
            {filteredProductData.map((event, index) => {
              let npub = nip19.npubEncode(event.pubkey);
              return (
                <ProductCard
                  key={event.sig + "-" + index}
                  product={event}
                  handleDelete={handleDelete}
                  onProductClick={onProductClick}
                />
                // <div
                //   key={event.sig + "-" + index}
                //   className="p-4 mb-4 mx-2 bg-gray-100 rounded-md shadow-lg"
                // >
                //   <div className="mt-2 text-gray-800 text-sm md:text-base whitespace-pre-wrap break-words">
                //     {event.kind == 30402 ? (
                //       <DisplayProduct
                //         tags={event.tags}
                //         eventId={event.id}
                //         pubkey={event.pubkey}
                //         handleDelete={handleDelete}
                //       />
                //     ) : event.content.indexOf(imageUrlRegExp) ? (
                //       <div>
                //         <p>{event.content.replace(imageUrlRegExp, "")}</p>
                //         <img src={event.content.match(imageUrlRegExp)?.[0]} />
                //       </div>
                //     ) : (
                //       <div>
                //         <p>{event.content}</p>
                //       </div>
                //     )}
                //   </div>
                // </div>
              );
            })}
            {getSpacerCardsNeeded()}
          </div>
        ) : (
          <div className="mt-8 flex items-center justify-center">
            <p className="text-xl break-words text-center">
              No listings found . . .
            </p>
          </div>
        )}
        <div className="h-20">{/*spacer div*/}</div>
      </div>
      <DisplayProductModal
        productData={focusedProduct}
        showModal={showModal}
        handleModalToggle={handleToggleModal}
        handleSendMessage={handleSendMessage}
      />
    </>
  );
};

export default DisplayEvents;
