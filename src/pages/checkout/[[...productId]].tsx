import { useRouter } from 'next/router';
import DisplayProduct from "./display-product";

const Checkout = () => {
  const router = useRouter();
  const { productId } = router.query;

  return (
    <div>
      <h1>Checkout</h1>
      {/* Checkout button that generates cashu fund invoice and displayes qr code */}
    </div>
  );
};

export default Checkout;