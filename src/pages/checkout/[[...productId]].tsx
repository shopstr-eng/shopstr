import { useState, useEffect } from "react";
import { useRouter } from 'next/router';
import DisplayProduct from "../components/display-product";
import type Event from "../components/display-events";
import getRelay from "../api/nostr/relays";

const Checkout = () => {
  const router = useRouter();
  const { productId } = router.query;

  if (!productId) {
    return <div>Loading...</div>;
  }
  
  const productIdString = productId[0];
  const [product, setProduct] = useState([]);
  const [pubkey, setPubkey] = useState("");
  
  useEffect(() => {
    const relay = getRelay();

    relay.on("connect", () => {
      console.log(`connected to ${relay.url}`);
    });
    relay.on("error", () => {
      console.log(`failed to connect to ${relay.url}`);
    });

    relay.connect();

    let subParams: { ids: string[]; kinds: number[] } = {
      ids: [productIdString],
      kinds: [30018],
    };

    let productSub = relay.sub([subParams]);

    productSub.on("event", (event) => {
      const data = JSON.parse(event.content)
      setProduct(data)
      const pk = event.pubkey;
      setPubkey(pk)
    });

    return () => {
      relay.close();
    };
  }, []);

  return (
    <div>
      <h1 className="text-4xl">Checkout</h1>
      <DisplayProduct content={product} eventId={productIdString} pubkey={pubkey} />
    </div>
  );
};

export default Checkout;