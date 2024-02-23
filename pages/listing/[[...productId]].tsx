import React, { useState, useEffect } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { SimplePool } from "nostr-tools";
import parseTags, {
  ProductData,
} from "../components/utility/product-parser-functions";
import ListingPage from "../components/listing-page";
import { getLocalStorageData } from "../components/utility/nostr-helper-functions";

const Listing = () => {
  const router = useRouter();
  const [relays, setRelays] = useState([]);
  const [productData, setProductData] = useState<ProductData | undefined>(
    undefined,
  );
  const [productIdString, setProductIdString] = useState("");

  useEffect(() => {
    if (router.isReady) {
      const { productId } = router.query;
      const productIdString = productId ? productId[0] : "";
      setProductIdString(productIdString);
      if (!productIdString) {
        router.push("/"); // if there isn't a productId, redirect to home page
      }
      let { relays } = getLocalStorageData();
      setRelays(relays);
    }
  }, [router]);

  useEffect(() => {
    const pool = new SimplePool();

    let subParams: { ids: string[]; kinds: number[] } = {
      ids: [productIdString],
      kinds: [30402],
    };

    let h = pool.subscribeMany(relays, [subParams], {
      onevent(event) {
        const productData = parseTags(event);
        setProductData(productData);
      },
      oneose() {
        h.close();
      },
    });
  }, [relays]);

  const imageUrl = productData?.images?.length
    ? productData.images[0]
    : "/shopstr.png";

  return (
    <div className="">
      <Head>
        <title>Shopstr</title>
        <meta name="description" content={productData?.title} />

        <meta
          property="og:url"
          content={`https://shopstr.store/listing/${productData?.id}`}
        />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="Shopstr" />
        <meta property="og:description" content={productData?.title} />
        <meta property="og:image" content={imageUrl} />

        <meta name="twitter:card" content="summary_large_image" />
        <meta property="twitter:domain" content="shopstr.store" />
        <meta
          property="twitter:url"
          content={`https://shopstr.store/listing/${productData?.id}`}
        />
        <meta name="twitter:title" content="Shopstr" />
        <meta name="twitter:description" content={productData?.title} />
        <meta name="twitter:image" content={imageUrl} />
      </Head>
      <ListingPage productData={productData} />
    </div>
  );
};

export default Listing;
