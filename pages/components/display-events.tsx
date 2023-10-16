import { useMemo, useState, useEffect } from "react";
import { Avatar, Select, SelectItem, SelectSection } from "@nextui-org/react";
import DisplayProduct from "./display-product";
import { nip19, SimplePool } from "nostr-tools";
import { ProductFormValues } from "../api/post-event";
import { DeleteListing } from "../nostr-helpers";
import locations from "../../public/locationSelection.json";

export type Event = {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: ProductFormValues;
  content: string;
  sig: string;
};

const DisplayEvents = ({
  focusedPubkey,
  clickNPubkey,
}: {
  focusedPubkey?: string;
  clickNPubkey: (npubkey: string) => void;
}) => {
  const [relays, setRelays] = useState([]);
  const [eventData, setEventData] = useState<Event[]>([]);
  const imageUrlRegExp = /(https?:\/\/.*\.(?:png|jpg|jpeg|gif))/i;
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedLocation, setSelectedLocation] = useState("");

  const categories = [
    "Digital",
    "Physical",
    "Services",
    "Resale",
    "Exchange/swap",
    "Clothing",
    "Shoes",
    "Accessories",
    "Electronics",
    "Collectibles",
    "Books",
    "Pets",
    "Sports",
    "Fitness",
    "Art",
    "Crafts",
    "Home",
    "Office",
    "Food",
    "Miscellaneous",
  ];

  const locationMap = useMemo(() => {
    let states = locations.states.map((state) => [state.state, state]);
    let countries = locations.countries.map((country) => [
      country.country,
      country,
    ]);
    return new Map([...states, ...countries]);
  }, []);

  const locationOptions = useMemo(() => {
    const headingClasses =
      "flex w-full sticky top-1 z-20 py-1.5 px-2 bg-default-100 shadow-small rounded-small";

    let countryOptions = (
      <SelectSection
        title="Countries"
        classNames={{
          heading: headingClasses,
        }}
      >
        {Array.from(locationMap.keys()).map((location, index) => {
          const locationInfo = locationMap.get(location);
          if (locationInfo.country) {
            return (
              <SelectItem
                startContent={
                  locationMap.get(location) ? (
                    <Avatar
                      alt={location}
                      className="w-6 h-6"
                      src={`https://flagcdn.com/16x12/${
                        locationMap.get(location).iso3166
                      }.png`}
                    />
                  ) : null
                }
                value={index}
                key={index}
              >
                {location}
              </SelectItem>
            );
          }
          return null;
        })}
      </SelectSection>
    );

    let stateOptions = (
      <SelectSection
        title="U.S. States"
        classNames={{
          heading: headingClasses,
        }}
      >
        {Array.from(locationMap.keys()).map((location, index) => {
          const locationInfo = locationMap.get(location);
          if (!locationInfo.country) {
            return (
              <SelectItem
                startContent={
                  locationMap.get(location) ? (
                    <Avatar
                      alt={location}
                      className="w-6 h-6"
                      src={`https://flagcdn.com/16x12/${
                        locationMap.get(location).iso3166
                      }.png`}
                    />
                  ) : null
                }
                value={index}
                key={index}
              >
                {location}
              </SelectItem>
            );
          }
          return null;
        })}
      </SelectSection>
    );
    return [stateOptions, countryOptions];
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedRelays = localStorage.getItem("relays");
      setRelays(storedRelays ? JSON.parse(storedRelays) : []);
    }
  }, []);

  useEffect(() => {
    const pool = new SimplePool();
    setEventData([]);
    let subParams: { kinds: number[]; authors?: string[] } = {
      kinds: [30402],
    };
    let productsSub = pool.sub(relays, [subParams]);
    productsSub.on("event", (event) => {
      setEventData((eventData) => {
        let newEventData = [...eventData, event];
        newEventData.sort((a, b) => b.created_at - a.created_at); // sorts most recently created to least recently created
        return newEventData;
      });
    });
  }, [relays]);

  const displayDate = (timestamp: number): string => {
    const d = new Date(timestamp * 1000);
    const dateString = d.toLocaleString();
    return dateString;
  };

  const getSelectedSellersProducts = () => {
    let result = eventData;
    if (focusedPubkey !== "") {
      result = result.filter((event) => event.pubkey === focusedPubkey);
    }
    if (selectedCategory !== "" && typeof selectedCategory !== "undefined") {
      result = result.filter((event) => {
        // project the 'tags' 2D array to an array of categories
        const eventCategories = event.tags
          .filter((tagArray) => tagArray[0] === "t")
          .map((tagArray) => tagArray[1]);
        // check if the selected category is within event categories
        return eventCategories.includes(selectedCategory);
      });
    }
    if (selectedLocation !== "" && typeof selectedLocation !== "undefined") {
      result = result.filter((event) => {
        // project the 'tags' 2D array to an array of categories
        const eventLocation = event.tags
          .filter((tagArray) => tagArray[0] === "location")
          .map((tagArray) => tagArray[1]);
        // check if the selected category is within event categories
        return eventLocation.some((location) =>
          location.includes(selectedLocation),
        );
      });
    }
    return result;
  };

  const handleDelete = async (productId: string, passphrase: string) => {
    try {
      await DeleteListing([productId], passphrase);
      setEventData((eventData) => {
        let newEventData = eventData.filter((event) => event.id !== productId); // removes the deleted product from the list
        return newEventData;
      });
    } catch (e) {
      console.log(e);
    }
  };

  return (
    <div>
      <div className="flex space-x-2">
        <Select
          autoFocus
          className="mt-2"
          placeholder="Select category"
          value={selectedCategory}
          onChange={(event) => {
            const index = event.target.value;
            const selectedVal = categories[index];
            setSelectedCategory(selectedVal);
            getSelectedSellersProducts();
          }}
        >
          {categories.map((category, index) => (
            <SelectItem value={category} key={index}>
              {category}
            </SelectItem>
          ))}
        </Select>
        <Select
          autoFocus
          className="mt-2"
          placeholder="Select location"
          value={selectedLocation}
          onChange={(event) => {
            const selectedVal = Array.from(locationMap.keys())[
              event.target.value
            ];
            setSelectedLocation(selectedVal);
            getSelectedSellersProducts();
          }}
        >
          {locationOptions}
        </Select>
      </div>
      {getSelectedSellersProducts().length != 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 my-2 overflow-y-scroll overflow-x-hidden max-h-[70vh] max-w-full">
          {getSelectedSellersProducts()?.map((event, index) => {
            let npub = nip19.npubEncode(event.pubkey);
            return (
              <div
                key={event.sig + "-" + index}
                className="p-4 mb-4 mx-2 bg-gray-100 rounded-md shadow-lg"
              >
                <div className="flex justify-between items-center text-gray-600 text-xs md:text-sm">
                  <span
                    className="max-w-xsm truncate hover:text-purple-600 rounded-md cursor-pointer"
                    onClick={() => {
                      clickNPubkey(npub);
                    }}
                  >
                    {npub}
                  </span>
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
