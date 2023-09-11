import { useState, useEffect } from "react";
import { useRouter } from 'next/router';
import DisplayProduct from "../components/display-product";
import { SimplePool } from 'nostr-tools';

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
    const pool = new SimplePool();

    let subParams: { ids: string[]; kinds: number[] } = {
      ids: [productIdString],
      // kinds: [30018],
      kinds: [30402],
    };

    let productSub = pool.sub(JSON.parse(localStorage.getItem("relays")), [subParams]);

    productSub.on("event", (event) => {
      // const data = JSON.parse(event.content);
      // setProduct(data);
      setProduct(event.tags);
      setPubkey(event.pubkey);
    });
  }, []);

  return (
    <div>
      <DisplayProduct tags={product} eventId={productIdString} pubkey={pubkey} />
    </div>
  );
};

export default Checkout;