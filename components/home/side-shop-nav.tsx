"use client";
import React, { useContext, useEffect, useState } from "react";

import { nip19 } from "nostr-tools";

import useNavigation from "@/components/hooks/use-navigation";

import { ShopMapContext } from "@/utils/context/context";
import { Button, useDisclosure } from "@nextui-org/react";
import { useRouter } from "next/router";
import SignInModal from "../sign-in/SignInModal";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import { ShopProfile } from "../../utils/types/types";
import { NEO_BTN } from "@/utils/STATIC-VARIABLES";

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
    const excludedCategories = ["shopstr"];
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
      <div className="hidden w-[250px] flex-col items-start border-r border-zinc-800 bg-[#161616] px-6 py-8 md:flex">
        {!isEditingShop ? (
          <>
            <Button
              onClick={() => setSelectedCategories(new Set<string>([]))}
              className="flex w-full flex-row justify-start bg-transparent py-8 text-zinc-400 duration-200 hover:text-yellow-400"
            >
              <span className="hidden pt-2 text-xl font-bold uppercase tracking-wide md:flex">
                All listings
              </span>
            </Button>
            {Object.keys(talliedCategories).length > 0 && (
              <>
                {Object.entries(talliedCategories).map(([category, count]) => (
                  <Button
                    key={category}
                    onClick={() =>
                      setSelectedCategories(new Set<string>([category]))
                    }
                    className="flex w-full flex-row justify-start bg-transparent py-2 text-zinc-400 duration-200 hover:text-yellow-400"
                  >
                    <span className="text-lg font-medium">{`- ${category} (${count})`}</span>
                  </Button>
                ))}
              </>
            )}
            <Button
              onClick={() => handleSendMessage(focusedPubkey)}
              className={`${NEO_BTN} mt-4 flex h-12 w-full flex-row items-center justify-center px-4 ${
                isMessagesActive ? "border-white" : ""
              }`}
            >
              <span className="hidden text-sm font-bold uppercase tracking-wider md:flex">
                Message seller
              </span>
            </Button>
            {shopAbout && (
              <div className="flex w-full flex-col justify-start bg-transparent py-8 text-white">
                <h2 className="pb-2 text-xl font-black uppercase tracking-wide text-zinc-500">
                  About
                </h2>
                <p className="text-sm text-zinc-300">{shopAbout}</p>
              </div>
            )}
          </>
        ) : (
          <>
            {categories && categories?.length > 0 && (
              <>
                <Button
                  onClick={() => setSelectedCategories(new Set<string>([]))}
                  className="flex w-full flex-row justify-start bg-transparent py-8 text-zinc-400 duration-200 hover:text-yellow-400"
                >
                  <span className="hidden pt-2 text-xl font-bold uppercase tracking-wide md:flex">
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
                          className="flex w-full flex-row justify-start bg-transparent py-2 text-zinc-400 duration-200 hover:text-yellow-400"
                        >
                          <span className="text-lg font-medium">{`- ${category} (${count})`}</span>
                        </Button>
                      )
                    )}
                  </>
                )}
              </>
            )}
            <Button
              className={`${NEO_BTN} mt-4 h-12 w-full text-sm`}
              onClick={() => handleCreateNewListing()}
            >
              Add Listing
            </Button>
            <Button
              className="mt-4 h-12 w-full rounded-xl border border-zinc-600 bg-transparent text-sm font-bold uppercase tracking-wider text-white hover:border-white hover:bg-zinc-800"
              onClick={() => router.push("settings/shop-profile")}
            >
              Edit Shop
            </Button>
            {shopAbout && (
              <div className="flex w-full flex-col justify-start bg-transparent py-8 text-white">
                <h2 className="pb-2 text-xl font-black uppercase tracking-wide text-zinc-500">
                  About
                </h2>
                <p className="text-sm text-zinc-300">{shopAbout}</p>
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
