import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import DisplayProduct from "../components/display-product";
import { SimplePool } from "nostr-tools";

const Checkout = () => {
  const router = useRouter();
  const { productId } = router.query;
  console.log(productId[0]);

  const [relays, setRelays] = useState([]);

  const productIdString = productId[0];
  const [product, setProduct] = useState([]);
  const [pubkey, setPubkey] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedRelays = localStorage.getItem("relays");
      setRelays(storedRelays ? JSON.parse(storedRelays) : []);
    }
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
      setProduct(event.tags);
      setPubkey(event.pubkey);
    });
  }, [relays]);

  return (
    <div>
      <DisplayProduct
        tags={product}
        eventId={productIdString}
        pubkey={pubkey}
      />
    </div>
  );
};

export default Checkout;
