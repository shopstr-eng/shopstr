import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import DisplayProduct from "../components/display-product";
import { SimplePool } from "nostr-tools";
import parseTags, {
  ProductData,
} from "../components/utility/product-parser-functions";
import { json } from "stream/consumers";
import CheckoutPage from "../components/checkout-page";
import { getLocalStorageData } from "../nostr-helpers";

const Checkout = () => {
  const router = useRouter();
  const { productId } = router.query;
  if (!productId) return null;
  console.log(productId[0]);

  const [relays, setRelays] = useState([]);

  const productIdString = productId[0];
  const [productData, setProductData] = useState<ProductData | undefined>(
    undefined
  );

  useEffect(() => {
    let { relays } = getLocalStorageData();
    setRelays(relays ? relays : ["wss://relay.damus.io", "wss://nos.lol"]);
  }, []);

  useEffect(() => {
    const pool = new SimplePool();

    let subParams: { ids: string[]; kinds: number[] } = {
      ids: [productIdString],
      // kinds: [30018],
      kinds: [30402],
    };

    let productSub = pool.sub(relays, [subParams]);

    productSub.on("event", (event) => {
      // const data = JSON.parse(event.content);
      // setProduct(data);
      const productData = parseTags(event);
      console.log(productData);
      setProductData(productData);
    });
  }, [relays]);

  return <CheckoutPage productData={productData} />;
};

export default Checkout;
