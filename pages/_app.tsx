import "tailwindcss/tailwind.css";
import type { AppProps } from "next/app";
import "../styles/globals.css";
import { useRouter } from "next/router";
import Navbar from "./components/navbar";
import { useState, useEffect } from "react";
import { SimplePool } from "nostr-tools";
import {
  ProfileMapContext,
  ProductContext,
  ProductContextInterface,
} from "./context";
import type { NostrEvent } from "../nostr-helpers";

function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const isLoginPage = router.pathname === "/";
  const [relays, setRelays] = useState([]);
  const [profileMap, setProfileMap] = useState(new Map());
  const [productContext, setProductContext] = useState<ProductContextInterface>(
    {
      productData: [],
      isLoading: true,
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

    let authorsOfProducts = Array.from(
      new Set(
        productContext.productData.map((product) => {
          return product.pubkey;
        })
      )
    ) as string[];

    const pool = new SimplePool();
    let profileSubParams: { kinds: number[]; authors?: string[] } = {
      kinds: [0],
      authors: authorsOfProducts,
    };

    let profileSub = pool.sub(relays, [profileSubParams]);

    profileSub.on("event", (event) => {
      setProfileMap((profileMap) => {
        let eventMap = new Map(profileMap);
        eventMap.set(event.pubkey, {
          pubkey: event.pubkey,
          created_at: event.created_at,
          content: JSON.parse(event.content),
        });
        return eventMap;
      });
    });
  }, [productContext]);

  return (
    <ProfileMapContext.Provider value={profileMap}>
      <ProductContext.Provider value={productContext}>
        <div className="xl:w-full h-full bg-purple-500 py-1 px-2 md:py-8 md:px-16">
          {isLoginPage ? null : <Navbar />}
          <Component {...pageProps} />
        </div>
      </ProductContext.Provider>
    </ProfileMapContext.Provider>
  );
}

export default App;
