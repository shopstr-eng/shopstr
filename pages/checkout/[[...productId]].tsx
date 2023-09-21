import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import DisplayProduct from '../../components/display-product';
import { SimplePool } from 'nostr-tools';
import { ProductFormValues } from '../api/nostr/post-event';
import axios from 'axios';
import { createNostrDeleteEvent } from '@/utils/nostrHelpers';
import getRelays from '@/utils/getRelays';

const Checkout = () => {
  const router = useRouter();
  const { productId } = router.query;

  const [product, setProduct] = useState<ProductFormValues>([]);
  const [pubkey, setPubkey] = useState('');
  const [isDeleted, setIsDeleted] = useState(false);

  const productIdString = (productId && productId[0] || '');

    
  useEffect(() => {
    const pool = new SimplePool();

    let subParams: { ids: string[]; kinds: number[] } = {
      ids: [productIdString],
      // kinds: [30018],
      kinds: [30402],
    };

    let productSub = pool.sub(getRelays(), [subParams]);

    productSub.on('event', (event) => {
      // const data = JSON.parse(event.content);
      // setProduct(data);
      setProduct(event.tags as ProductFormValues);
      setPubkey(event.pubkey);
    });

  }, [productIdString]);

  const handleDelete = async (productId: string) => {
    let deleteEvent = await createNostrDeleteEvent([productId], localStorage.getItem('publicKey'), 'user deletion request', localStorage.getItem('privateKey'));
    axios({
      method: 'POST',
      url: '/api/nostr/post-event',
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        ...deleteEvent,
        relays: getRelays(),
      }
    });

    setProduct([]);
    setIsDeleted(true);
  };

  if (isDeleted) return <div>Product removed</div>;
  return !productIdString ? <div>Loading...</div> : (
    <div>
      <DisplayProduct tags={product} eventId={productIdString} pubkey={pubkey} handleDelete={() => handleDelete(productIdString)} />
    </div>
  );
};

export default Checkout;