import { useState, useEffect, useContext, useMemo } from "react";
import DisplayProduct from "./display-product";
import { Select, SelectItem, Input } from "@nextui-org/react";
import { nip19 } from "nostr-tools";
import { DeleteListing, NostrEvent } from "../nostr-helpers";
import { ProductContext } from "../context";
import { ProfileAvatar } from "./avatar";
import { CATEGORIES } from "./STATIC-VARIABLES";
import LocationDropdown from "./location-dropdown";
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline'

const DisplayEvents = ({
  focusedPubkey,
  clickNPubkey,
}: {
  focusedPubkey?: string;
  clickNPubkey: (npubkey: string) => void;
}) => {
  const [productData, setProductData] = useState<NostrEvent[]>([]);
  const [filteredProductData, setFilteredProductData] = useState([]);
  const [deletedProducts, setDeletedProducts] = useState<string[]>([]); // list of product ids that have been deleted
  const [isLoading, setIsLoading] = useState(true);
  const imageUrlRegExp = /(https?:\/\/.*\.(?:png|jpg|jpeg|gif))/i;
  const productDataContext = useContext(ProductContext);
  const [selectedCategories, setSelectedCategories] = useState(new Set<string>([]));
  const [selectedLocation, setSelectedLocation] = useState("");
  const [selectedSearch, setSelectedSearch] = useState("");

  useEffect(() => {
    if (!productDataContext) return;
    setIsLoading(productDataContext.isLoading);
    if (!productDataContext.isLoading && productDataContext.productData) {
      // is product sub reaches eose then we can sort the product data
      let sortedProductData = [
        ...productDataContext.productData.sort(
          (a, b) => b.created_at - a.created_at,
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

  /** FILTERS PRODUCT DATA ON CATEGORY, LOCATION, FOCUSED PUBKEY (SELLER) **/
  useEffect(() => {
    let filteredData = productData.filter((event) => {
      // gets rid of products that were deleted
      return !deletedProducts.includes(event.id);
    });
    if (productData && !isLoading) {
      if (focusedPubkey) {
        filteredData = filteredData.filter(
          (event) => event.pubkey === focusedPubkey,
        );
      }
      filteredData = filteredData.filter((event) => {
        // project the 'tags' 2D array to an array of categories
        const eventCategories = event.tags
          .filter((tagArray) => tagArray[0] === "t")
          .map((tagArray) => tagArray[1]);

        return selectedCategories.size === 0 || Array.from(selectedCategories).some((selectedCategory) => {
          const re = new RegExp(selectedCategory, 'gi');
          return eventCategories.some((category) => {
            const match = category.match(re);
            return match && match.length > 0;
          });
        });
      });
      filteredData = filteredData.filter((event) => {
        const eventLocation = event.tags
          .filter((tagArray) => tagArray[0] === "location")
          .map((tagArray) => tagArray[1]);

        return !selectedLocation || eventLocation.some((location: string) => {
          const re = new RegExp(selectedLocation, 'gi');
          const match = location.match(re);
          return match && match.length > 0;
        });
      });
      filteredData = filteredData.filter((event) => {
        const eventTitle = event.tags
          .filter((tagArray) => tagArray[0] === "title")
          .map((tagArray) => tagArray[1]);

        return !selectedSearch || eventTitle.some((title: string) => {
          const re = new RegExp(selectedSearch, 'gi');
          const match = title.match(re);
          return match && match.length > 0;
        });
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

  return (
    <div>
      <div className="flex space-x-2">
        <Input
          className="mt-2"
          isClearable
          label="Listings"
          placeholder="Type to search..."
          startContent={
            <MagnifyingGlassIcon height={"1em"} />
          }
          onChange={(event) => {
            const value = event.target.value;
            setSelectedSearch(value);
          }}>
        </Input>
        <Select
          className="mt-2"
          label="Categories"
          placeholder="All"
          selectedKeys={selectedCategories}
          onChange={(event) => {
            if (event.target.value === '') {
              setSelectedCategories(new Set([]));
            } else {
              setSelectedCategories(new Set(event.target.value.split(",")));
            }
          }}
          selectionMode="multiple"
        >
          {CATEGORIES.map((category, index) => (
            <SelectItem value={category} key={category}>
              {category}
            </SelectItem>
          ))}
        </Select>
        <LocationDropdown
          className="mt-2"
          placeholder="All"
          label="Location"
          value={selectedLocation}
          onChange={(event) => {
            setSelectedLocation(event.target.value);
          }}
        />
      </div>
      {/* DISPLAYS PRODUCT LISTINGS HERE */}
      {filteredProductData.length != 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 my-2 overflow-y-scroll overflow-x-hidden max-h-[70vh] max-w-full">
          {filteredProductData.map((event, index) => {
            let npub = nip19.npubEncode(event.pubkey);
            return (
              <div
                key={event.sig + "-" + index}
                className="p-4 mb-4 mx-2 bg-gray-100 rounded-md shadow-lg"
              >
                <div className="flex justify-between items-center text-gray-600 text-xs md:text-sm">
                  <ProfileAvatar
                    pubkey={event.pubkey}
                    npub={npub}
                    clickNPubkey={clickNPubkey}
                  />
                  <span className="text-gray-400 ml-2 text-xs md:text-sm">
                    {displayDate(event.created_at)}
                  </span>
                </div>
                <div className="mt-2 text-gray-800 text-sm md:text-base whitespace-pre-wrap break-words">
                  {event.kind == 30402 ? (
                    <DisplayProduct
                      tags={event.tags}
                      eventId={event.id}
                      pubkey={event.pubkey}
                      handleDelete={handleDelete}
                    />
                  ) : event.content.indexOf(imageUrlRegExp) ? (
                    <div>
                      <p>{event.content.replace(imageUrlRegExp, "")}</p>
                      <img src={event.content.match(imageUrlRegExp)?.[0]} />
                    </div>
                  ) : (
                    <div>
                      <p>{event.content}</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-8 flex items-center justify-center">
          <p className="text-xl break-words text-center">
            No listings found . . .
          </p>
        </div>
      )}
    </div>
  );
};

export default DisplayEvents;
