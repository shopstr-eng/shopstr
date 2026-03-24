"use client";
import { useContext, useEffect, useState } from "react";

import { nip19 } from "nostr-tools";

import useNavigation from "@/components/hooks/use-navigation";

import { ShopMapContext } from "@/utils/context/context";
import { Button, useDisclosure } from "@nextui-org/react";
import { BLACKBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";
import { useRouter } from "next/router";
import SignInModal from "../sign-in/SignInModal";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import { ShopProfile } from "../../utils/types/types";

const SideShopNav = ({
  focusedPubkey,
  categories,
  setSelectedCategories,
  isEditingShop,
}: {
  focusedPubkey: string;
  categories?: string[];
  setSelectedCategories: (value: Set<string>) => void;
  isEditingShop?: boolean;
}) => {
  const { isMessagesActive } = useNavigation();
  const router = useRouter();

  const { isOpen, onOpen, onClose } = useDisclosure();

  const shopMapContext = useContext(ShopMapContext);

  const [shopAbout, setShopAbout] = useState("");

  const [talliedCategories, setTalliedCategories] = useState<
    Record<string, number>
  >({});

  const [usersPubkey, setUsersPubkey] = useState<string | null>(null);

  const { pubkey: userPubkey, isLoggedIn } = useContext(SignerContext);

  useEffect(() => {
    if (
      focusedPubkey &&
      shopMapContext.shopData.has(focusedPubkey) &&
      typeof shopMapContext.shopData.get(focusedPubkey) != "undefined"
    ) {
      const shopProfile: ShopProfile | undefined =
        shopMapContext.shopData.get(focusedPubkey);
      if (shopProfile) {
        setShopAbout(shopProfile.content.about);
      }
    }
  }, [shopMapContext, focusedPubkey]);

  useEffect(() => {
    if (categories) {
      setTalliedCategories(tallyCategories(categories));
    }
  }, [categories]);

  useEffect(() => {
    setUsersPubkey(userPubkey as string);
  }, [userPubkey]);

  const handleSendMessage = (pubkeyToOpenChatWith: string) => {
    if (isLoggedIn) {
      router.push({
        pathname: "/orders",
        query: { pk: nip19.npubEncode(pubkeyToOpenChatWith), isInquiry: true },
      });
    } else {
      onOpen();
    }
  };

  const tallyCategories = (categories: string[]): Record<string, number> => {
    const excludedCategories = ["shopstr", "MilkMarket", "FREEMILK"];
    return categories
      .filter((category) => !excludedCategories.includes(category))
      .reduce(
        (acc, category) => {
          acc[category] = (acc[category] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );
  };

  const handleCreateNewListing = () => {
    if (usersPubkey) {
      router.push("?addNewListing");
    } else {
      onOpen();
    }
  };

  return (
    <>
      <div className="hidden w-[120px] flex-col items-center border-r-4 border-black bg-white px-6 py-8 sm:flex md:w-[250px] md:items-start">
        {!isEditingShop ? (
          <>
            <Button
              onClick={() => setSelectedCategories(new Set<string>([]))}
              className="flex w-full flex-row justify-start bg-transparent py-8 font-bold text-black duration-200 hover:text-primary-yellow"
            >
              <span className="hidden pt-2 text-2xl md:flex">All listings</span>
            </Button>
            {Object.keys(talliedCategories).length > 0 && (
              <>
                {Object.entries(talliedCategories).map(([category, count]) => (
                  <Button
                    key={category}
                    onClick={() =>
                      setSelectedCategories(new Set<string>([category]))
                    }
                    className="flex w-full flex-row justify-start bg-transparent py-2 text-black duration-200 hover:text-primary-yellow"
                  >
                    <span className="text-xl">{`- ${category} (${count})`}</span>
                  </Button>
                ))}
              </>
            )}
            <Button
              onClick={() => handleSendMessage(focusedPubkey)}
              className={`${BLACKBUTTONCLASSNAMES} mt-4 flex flex-row items-center py-7 ${
                isMessagesActive ? "text-primary-yellow" : ""
              }`}
            >
              <span
                className={`hidden text-lg md:flex ${
                  isMessagesActive ? "font-bold" : ""
                }`}
              >
                Message seller
              </span>
            </Button>
            {shopAbout && (
              <div className="flex w-full flex-col justify-start bg-transparent py-8 text-black">
                <h2 className="pb-2 text-2xl font-bold">About</h2>
                <p className="text-base">{shopAbout}</p>
              </div>
            )}
          </>
        ) : (
          <>
            {categories && categories?.length > 0 && (
              <>
                <Button
                  onClick={() => setSelectedCategories(new Set<string>([]))}
                  className="flex w-full flex-row justify-start bg-transparent py-8 font-bold text-black duration-200 hover:text-primary-yellow"
                >
                  <span className="hidden pt-2 text-2xl md:flex">
                    All listings
                  </span>
                </Button>
                {Object.keys(talliedCategories).length > 0 && (
                  <>
                    {Object.entries(talliedCategories).map(
                      ([category, count]) => (
                        <Button
                          key={category}
                          onClick={() =>
                            setSelectedCategories(new Set<string>([category]))
                          }
                          className="flex w-full flex-row justify-start bg-transparent py-2 text-black duration-200 hover:text-primary-yellow"
                        >
                          <span className="text-xl">{`- ${category} (${count})`}</span>
                        </Button>
                      )
                    )}
                  </>
                )}
              </>
            )}
            <Button
              className={`${BLACKBUTTONCLASSNAMES} w-full`}
              onClick={() => handleCreateNewListing()}
            >
              Add Listing
            </Button>
            <Button
              className={`${BLACKBUTTONCLASSNAMES} mt-2 w-full`}
              onClick={() => router.push("settings/shop-profile")}
            >
              Edit Shop
            </Button>
            {shopAbout && (
              <div className="flex w-full flex-col justify-start bg-transparent py-8 text-black">
                <h2 className="pb-2 text-2xl font-bold">About</h2>
                <p className="text-base">{shopAbout}</p>
              </div>
            )}
          </>
        )}
      </div>
      <SignInModal isOpen={isOpen} onClose={onClose} />
    </>
  );
};

export default SideShopNav;
