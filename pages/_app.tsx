import "tailwindcss/tailwind.css";
import type { AppProps } from "next/app";
import "../styles/globals.css";
import { useRouter } from "next/router";
import Navbar from "./components/navbar";
import { useState, useEffect } from "react";
import { SimplePool } from "nostr-tools";
import {
  ProfileMapContext,
  ProfileContextInterface,
  ProductContext,
  ProductContextInterface,
} from "./context";
import type { NostrEvent } from "../nostr-helpers";

function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const isSignInPage = router.pathname === "/sign-in";
  const isKeyPage = router.pathname === "/keys";
  const [relays, setRelays] = useState([]);
  const [profileMap, setProfileMap] = useState(new Map());
  const [pubkeyProfilesToFetch, setPubkeyProfilesToFetch] = useState<
    Set<string>
  >(new Set());
  const [productContext, setProductContext] = useState<ProductContextInterface>(
    {
      productData: [],
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
        localStorage.getItem("relays")
          ? JSON.parse(localStorage.getItem("relays"))
          : []
      );
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
          productData: productArray,
          isLoading: productContext.isLoading,
        };
      });
    });
    productsSub.on("eose", () => {
      console.log("ProductSub eose reached");
      setProductContext((productContext) => {
        return {
          productData: productContext.productData,
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
        <div className="xl:w-full h-full px-2 md:py-4 md:px-8">
          {isSignInPage || isKeyPage ? null : <Navbar />}
          <Component {...pageProps} />
        </div>
      </ProductContext.Provider>
    </ProfileMapContext.Provider>
  );
}

export default App;
