import { useState, useEffect } from "react";
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

  const productIdString = router.asPath.split("/").pop() || ""; // Extract productId from the actual URL

  useEffect(() => {
    if (!productIdString) {
      router.push("/"); // if there isn't a productId, redirect to home page
    }
  }, []);

  useEffect(() => {
    let { relays } = getLocalStorageData();
    setRelays(relays);
  }, []);

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
  }, [relays, router.asPath]);

  return <ListingPage productData={productData} />;
};

export default Listing;
