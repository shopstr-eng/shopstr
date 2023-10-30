import "tailwindcss/tailwind.css";
import type { AppProps } from "next/app";
import "../styles/globals.css";
import Navbar from "./components/navbar";
import { useState, useEffect } from "react";
import { SimplePool } from "nostr-tools";
import {
  ProfileMapContext,
  ProfileContextInterface,
  ProductContext,
  ProductContextInterface,
} from "./context";
import { decryptNpub, NostrEvent } from "./nostr-helpers";

function App({ Component, pageProps }: AppProps) {
  const [relays, setRelays] = useState([]);
  const [profileMap, setProfileMap] = useState(new Map());
  const [pubkeyProfilesToFetch, setPubkeyProfilesToFetch] = useState<
    Set<string>
  >(new Set());
  const [productContext, setProductContext] = useState<ProductContextInterface>(
    {
      productEvents: [],
      isLoading: true,
    }
  );
  const [profileContext, setProfileContext] = useState<ProfileContextInterface>(
    {
      profileData: new Map(),
      addPubkeyToFetch: (pubkeys: [string]) => {
        setPubkeyProfilesToFetch((pubkeyProfilesToFetch) => {
          let newPubkeyProfilesToFetch = new Set(pubkeyProfilesToFetch);
          pubkeys.forEach((pubkey) => {
            newPubkeyProfilesToFetch.add(pubkey);
          });
          return newPubkeyProfilesToFetch;
        });
      },
    }
  );

  useEffect(() => {
    // Perform localStorage action
    if (window !== undefined) {
      setRelays(
        localStorage.getItem("relays") !== null
          ? JSON.parse(localStorage.getItem("relays") as string)
          : []
      );
      setPubkeyProfilesToFetch(
        new Set(
          typeof localStorage.getItem("npub") == "string"
            ? [decryptNpub(localStorage.getItem("npub") as string)]
            : []
        ) as Set<string>
      ); // fetches your profile if you are logged in
    }
  }, []);

  /** FETCH ALL PRODUCTS **/
  useEffect(() => {
    const pool = new SimplePool();
    let subParams: { kinds: number[]; authors?: string[] } = {
      kinds: [30402],
    };
    let productsSub = pool.sub(relays, [subParams]);
    let productArray: NostrEvent[] = [];
    productsSub.on("event", (event) => {
      setProductContext((productContext) => {
        productArray.push(event);
        setPubkeyProfilesToFetch((pubkeyProfilesToFetch) => {
          let newPubkeyProfilesToFetch = new Set(pubkeyProfilesToFetch);
          newPubkeyProfilesToFetch.add(event.pubkey);
          return newPubkeyProfilesToFetch;
        });
        return {
          productEvents: productArray,
          isLoading: productContext.isLoading,
        };
      });
    });
    productsSub.on("eose", () => {
      console.log("ProductSub eose reached");
      setProductContext((productContext) => {
        return {
          productEvents: productContext.productEvents,
          isLoading: false,
        };
      });
    });
  }, [relays]);

  /** FETCH ALL PROFILES AFTER FETCH PRODUCTS DONE AND FOR EVERY NEW PRODUCT EVENT **/
  useEffect(() => {
    if (productContext.isLoading) return;
    const pool = new SimplePool();
    let profileSubParams: { kinds: number[]; authors?: string[] } = {
      kinds: [0],
      authors: Array.from(pubkeyProfilesToFetch),
    };

    let profileSub = pool.sub(relays, [profileSubParams]);

    profileSub.on("event", (event) => {
      setProfileMap((profileMap) => {
        if (
          profileMap.has(event.pubkey) &&
          profileMap.get(event.pubkey).created_at > event.created_at
        ) {
          // if profile already exists and is newer than the one we just fetched, don't update
          return profileMap;
        }
        let newProfileMap = new Map(profileMap);
        newProfileMap.set(event.pubkey, {
          pubkey: event.pubkey,
          created_at: event.created_at,
          content: JSON.parse(event.content),
        });
        return newProfileMap;
      });
    });
  }, [pubkeyProfilesToFetch, productContext.isLoading]);

  /** UPON PROFILEMAP UPDATE, SET PROFILE CONTEXT **/
  useEffect(() => {
    setProfileContext((profileContext) => {
      return {
        profileData: profileMap,
        addPubkeyToFetch: profileContext.addPubkeyToFetch,
      };
    });
  }, [profileMap]);

  return (
    <ProfileMapContext.Provider value={profileContext}>
      <ProductContext.Provider value={productContext}>
        <div className="">
          <Navbar />
          <div className="h-20">
            {/*spacer div needed so pages can account for navbar height*/}
          </div>
          <Component {...pageProps} />
        </div>
      </ProductContext.Provider>
    </ProfileMapContext.Provider>
  );
}

export default App;
