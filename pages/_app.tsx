import "tailwindcss/tailwind.css";
import type { AppProps } from "next/app";
import Head from "next/head";
import "../styles/globals.css";
import { useState, useEffect } from "react";
import {
  ProfileMapContext,
  ProfileContextInterface,
  ShopMapContext,
  ShopContextInterface,
  ProductContext,
  ProductContextInterface,
  ChatsContextInterface,
  ChatsContext,
  ChatsMap,
  FollowsContextInterface,
  FollowsContext,
  RelaysContextInterface,
  RelaysContext,
  CashuWalletContext,
  CashuWalletContextInterface,
} from "../utils/context/context";
import {
  getLocalStorageData,
  LocalStorageInterface,
  validPassphrase,
} from "../components/utility/nostr-helper-functions";
import { NextUIProvider } from "@nextui-org/react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import {
  fetchAllPosts,
  fetchChatsAndMessages,
  fetchShopSettings,
  fetchProfile,
  fetchAllFollows,
  fetchAllRelays,
  fetchCashuWallet,
} from "./api/nostr/fetch-service";
import {
  NostrEvent,
  ProfileData,
  NostrMessageEvent,
  ShopSettings,
} from "../utils/types/types";
import { Proof } from "@cashu/cashu-ts";
import TopNav from "@/components/nav-top";
import RequestPassphraseModal from "@/components/utility-components/request-passphrase-modal";

function App({ Component, pageProps }: AppProps) {
  const [enterPassphrase, setEnterPassphrase] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [localStorageValues, setLocalStorageValues] =
    useState<LocalStorageInterface>(getLocalStorageData());
  const [productContext, setProductContext] = useState<ProductContextInterface>(
    {
      productEvents: [],
      isLoading: true,
      addNewlyCreatedProductEvent: (productEvent: any) => {
        setProductContext((productContext) => {
          let productEvents = [...productContext.productEvents, productEvent];
          return {
            productEvents: productEvents,
            isLoading: false,
            addNewlyCreatedProductEvent:
              productContext.addNewlyCreatedProductEvent,
            removeDeletedProductEvent: productContext.removeDeletedProductEvent,
          };
        });
      },
      removeDeletedProductEvent: (productId: string) => {
        setProductContext((productContext) => {
          let productEvents = [...productContext.productEvents].filter(
            (event) => event.id !== productId,
          );
          return {
            productEvents: productEvents,
            isLoading: false,
            addNewlyCreatedProductEvent:
              productContext.addNewlyCreatedProductEvent,
            removeDeletedProductEvent: productContext.removeDeletedProductEvent,
          };
        });
      },
    },
  );
  const [shopContext, setShopContext] = useState<ShopContextInterface>({
    shopData: new Map(),
    isLoading: true,
    updateShopData: (shopData: ShopSettings) => {
      setShopContext((shopContext) => {
        let shopDataMap = new Map(shopContext.shopData);
        shopDataMap.set(shopData.pubkey, shopData);
        return {
          shopData: shopDataMap,
          isLoading: false,
          updateShopData: shopContext.updateShopData,
        };
      });
    },
  });
  const [profileContext, setProfileContext] = useState<ProfileContextInterface>(
    {
      profileData: new Map(),
      isLoading: true,
      updateProfileData: (profileData: ProfileData) => {
        setProfileContext((profileContext) => {
          let newProfileData = new Map(profileContext.profileData);
          newProfileData.set(profileData.pubkey, profileData);
          return {
            profileData: newProfileData,
            isLoading: false,
            updateProfileData: profileContext.updateProfileData,
          };
        });
      },
    },
  );
  const [chatsContext, setChatsContext] = useState<ChatsContextInterface>({
    chatsMap: new Map(),
    isLoading: true,
    addNewlyCreatedMessageEvent: (
      messageEvent: NostrMessageEvent,
      sent?: boolean,
    ) => {
      setChatsContext((chatsContext) => {
        const newChatsMap = new Map(chatsContext.chatsMap);
        let chatArray;
        if (messageEvent.pubkey === getLocalStorageData().userPubkey) {
          let recipientPubkey = messageEvent.tags.find(
            (tag) => tag[0] === "p",
          )?.[1];
          if (recipientPubkey) {
            chatArray = newChatsMap.get(recipientPubkey) || [];
            if (sent) {
              chatArray.push(messageEvent);
            } else {
              chatArray = [messageEvent, ...chatArray];
            }
            newChatsMap.set(recipientPubkey, chatArray);
          }
        } else {
          chatArray = newChatsMap.get(messageEvent.pubkey) || [];
          if (sent) {
            chatArray.push(messageEvent);
          } else {
            chatArray = [messageEvent, ...chatArray];
          }
          newChatsMap.set(messageEvent.pubkey, chatArray);
        }
        return {
          chatsMap: newChatsMap,
          isLoading: false,
          addNewlyCreatedMessageEvent: chatsContext.addNewlyCreatedMessageEvent,
        };
      });
    },
  });
  const [followsContext, setFollowsContext] = useState<FollowsContextInterface>(
    {
      followList: [],
      firstDegreeFollowsLength: 0,
      isLoading: true,
    },
  );
  const [relaysContext, setRelaysContext] = useState<RelaysContextInterface>({
    relayList: [],
    readRelayList: [],
    writeRelayList: [],
    isLoading: true,
  });
  const [cashuWalletContext, setCashuWalletContext] =
    useState<CashuWalletContextInterface>({
      mostRecentWalletEvent: {},
      proofEvents: [],
      cashuWalletRelays: [],
      cashuMints: [],
      cashuProofs: [],
      isLoading: true,
    });

  const editProductContext = (
    productEvents: NostrEvent[],
    isLoading: boolean,
  ) => {
    setProductContext((productContext) => {
      return {
        productEvents: productEvents,
        isLoading: isLoading,
        addNewlyCreatedProductEvent: productContext.addNewlyCreatedProductEvent,
        removeDeletedProductEvent: productContext.removeDeletedProductEvent,
      };
    });
  };

  const editShopContext = (
    shopData: Map<string, ShopSettings>,
    isLoading: boolean,
  ) => {
    setShopContext((shopContext) => {
      return {
        shopData,
        isLoading,
        updateShopData: shopContext.updateShopData,
      };
    });
  };

  const editProfileContext = (
    profileData: Map<string, any>,
    isLoading: boolean,
  ) => {
    setProfileContext((profileContext) => {
      return {
        profileData,
        isLoading,
        updateProfileData: profileContext.updateProfileData,
      };
    });
  };

  const editChatContext = (chatsMap: ChatsMap, isLoading: boolean) => {
    setChatsContext((chatsContext) => {
      return {
        chatsMap,
        isLoading,
        addNewlyCreatedMessageEvent: chatsContext.addNewlyCreatedMessageEvent,
      };
    });
  };

  const editFollowsContext = (
    followList: string[],
    firstDegreeFollowsLength: number,
    isLoading: boolean,
  ) => {
    setFollowsContext({
      followList,
      firstDegreeFollowsLength,
      isLoading,
    });
  };

  const editRelaysContext = (
    relayList: string[],
    readRelayList: string[],
    writeRelayList: string[],
    isLoading: boolean,
  ) => {
    setRelaysContext({
      relayList,
      readRelayList,
      writeRelayList,
      isLoading,
    });
  };

  const editCashuWalletContext = (
    mostRecentWalletEvent: any,
    proofEvents: any[],
    cashuWalletRelays: string[],
    cashuMints: string[],
    cashuProofs: Proof[],
    isLoading: boolean,
  ) => {
    setCashuWalletContext({
      mostRecentWalletEvent,
      proofEvents,
      cashuWalletRelays,
      cashuMints,
      cashuProofs,
      isLoading,
    });
  };

  const [focusedPubkey, setFocusedPubkey] = useState("");

  const { signInMethod } = getLocalStorageData();

  /** FETCH initial FOLLOWS, RELAYS, PRODUCTS, and PROFILES **/
  useEffect(() => {
    async function fetchData() {
      const relays = getLocalStorageData().relays;
      const readRelays = getLocalStorageData().readRelays;
      let allRelays = [...relays, ...readRelays];
      if (allRelays.length === 0) {
        allRelays = [
          "wss://relay.damus.io",
          "wss://nos.lol",
          "wss://sendit.nosflare.com",
          "wss://purplepag.es",
        ];
        localStorage.setItem("relays", JSON.stringify(allRelays));
      }
      const userPubkey = getLocalStorageData().userPubkey;
      try {
        let { relayList, readRelayList, writeRelayList } = await fetchAllRelays(
          allRelays,
          editRelaysContext,
        );
        if (relayList.length != 0) {
          localStorage.setItem("relays", JSON.stringify(relayList));
          localStorage.setItem("readRelays", JSON.stringify(readRelayList));
          localStorage.setItem("writeRelays", JSON.stringify(writeRelayList));
          allRelays = [...relayList, ...readRelayList];
        }
        let pubkeysToFetchProfilesFor: string[] = [];
        let { profileSetFromProducts } = await fetchAllPosts(
          allRelays,
          editProductContext,
        );
        pubkeysToFetchProfilesFor = [...profileSetFromProducts];
        let { profileSetFromChats } = await fetchChatsAndMessages(
          allRelays,
          userPubkey,
          editChatContext,
        );
        if (userPubkey && profileSetFromChats.size != 0) {
          pubkeysToFetchProfilesFor = [
            userPubkey as string,
            ...pubkeysToFetchProfilesFor,
            ...profileSetFromChats,
          ];
        }
        let { shopSettingsMap } = await fetchShopSettings(
          allRelays,
          pubkeysToFetchProfilesFor,
          editShopContext,
        );
        let { profileMap } = await fetchProfile(
          allRelays,
          pubkeysToFetchProfilesFor,
          editProfileContext,
        );
        if (
          (getLocalStorageData().signInMethod === "nsec" && passphrase) ||
          getLocalStorageData().signInMethod === "extension"
        ) {
          let {
            mostRecentWalletEvent,
            proofEvents,
            cashuWalletRelays,
            cashuMints,
            cashuProofs,
          } = await fetchCashuWallet(
            allRelays,
            editCashuWalletContext,
            passphrase,
          );

          if (cashuWalletRelays.length != 0 && cashuMints.length != 0) {
            localStorage.setItem(
              "cashuWalletRelays",
              JSON.stringify(cashuWalletRelays),
            );
            localStorage.setItem("mints", JSON.stringify(cashuMints));
            localStorage.setItem("tokens", JSON.stringify(cashuProofs));
          }
        }
        let { followList } = await fetchAllFollows(
          allRelays,
          editFollowsContext,
        );
      } catch (error) {
        console.error("Error fetching data:", error);
      }
    }
    fetchData();
    window.addEventListener("storage", fetchData);
    return () => window.removeEventListener("storage", fetchData);
  }, [localStorageValues.relays, passphrase]);

  useEffect(() => {
    if (signInMethod === "nsec" && !validPassphrase(passphrase)) {
      setEnterPassphrase(true);
    }
  }, [signInMethod, passphrase]);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("/service-worker.js")
          .then((registration) => {
            console.log("Service Worker registered: ", registration);
          })
          .catch((registrationError) => {
            console.log(
              "Service Worker registration failed: ",
              registrationError,
            );
          });
      });
    }
  }, []);

  return (
    <>
      <Head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
        />
      </Head>
      <RelaysContext.Provider value={relaysContext}>
        <CashuWalletContext.Provider value={cashuWalletContext}>
          <FollowsContext.Provider value={followsContext}>
            <ProductContext.Provider value={productContext}>
              <ProfileMapContext.Provider value={profileContext}>
                <ShopMapContext.Provider value={shopContext}>
                  <ChatsContext.Provider value={chatsContext}>
                    <NextUIProvider>
                      <NextThemesProvider attribute="class">
                        <TopNav setFocusedPubkey={setFocusedPubkey} />
                        <div className="flex">
                          <main className="flex-1">
                            <Component
                              {...pageProps}
                              focusedPubkey={focusedPubkey}
                              setFocusedPubkey={setFocusedPubkey}
                            />
                          </main>
                        </div>
                      </NextThemesProvider>
                    </NextUIProvider>
                  </ChatsContext.Provider>
                </ShopMapContext.Provider>
              </ProfileMapContext.Provider>
            </ProductContext.Provider>
          </FollowsContext.Provider>
        </CashuWalletContext.Provider>
      </RelaysContext.Provider>
      <RequestPassphraseModal
        passphrase={passphrase}
        setCorrectPassphrase={setPassphrase}
        isOpen={enterPassphrase}
        setIsOpen={setEnterPassphrase}
        onCancelRouteTo="/"
      />
    </>
  );
}

export default App;
