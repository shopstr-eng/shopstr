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

  return <ListingPage productData={productData} />;
};

export default Listing;
