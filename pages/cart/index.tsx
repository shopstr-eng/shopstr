import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { Button, Input } from "@nextui-org/react";
import {
  PlusIcon,
  MinusIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";
import {
  SHOPSTRBUTTONCLASSNAMES,
  ShippingOptionsType,
} from "../../components/utility/STATIC-VARIABLES";
import { ProductData } from "../../components/utility/product-parser-functions";
import { DisplayCostBreakdown } from "../../components/utility-components/display-monetary-info";
import CartInvoiceCard from "../../components/cart-invoice-card";
import { fiat } from "@getalby/lightning-tools";
import currencySelection from "../../public/currencySelection.json";

export default function Component() {
  const [products, setProducts] = useState<ProductData[]>([]);
  const [satPrices, setSatPrices] = useState<{ [key: string]: number | null }>(
    {},
  );
  const [subtotal, setSubtotal] = useState<number>(0);
  const [shippingTypes, setShippingTypes] = useState<{
    [key: string]: ShippingOptionsType;
  }>({});
  const [quantities, setQuantities] = useState<{ [key: string]: number }>(
    Object.fromEntries(products.map((product) => [product.id, 1])),
  );
  const [hasReachedMax, setHasReachedMax] = useState<{
    [key: string]: boolean;
  }>(Object.fromEntries(products.map((product) => [product.id, false])));
  const [isBeingPaid, setIsBeingPaid] = useState(false);

  const router = useRouter();

  useEffect(() => {
    if (typeof window !== "undefined") {
      let cartList = localStorage.getItem("cart")
        ? JSON.parse(localStorage.getItem("cart") as string)
        : [];
      if (cartList && cartList.length > 0) {
        setProducts(cartList);
      }
    }
  }, []);

  useEffect(() => {
    const fetchSatPrices = async () => {
      const prices: { [key: string]: number | null } = {};
      let total = 0;

      for (const product of products) {
        try {
          const satPrice = await convertToSats(product);
          prices[product.id] = satPrice;

          if (satPrice !== null) {
            if (quantities[product.id]) {
              total += satPrice * quantities[product.id];
            } else {
              total += satPrice;
            }
          }
        } catch (error) {
          console.error(
            `Error converting price for product ${product.id}:`,
            error,
          );
          prices[product.id] = null;
        }
      }

      setSatPrices(prices);
      setSubtotal(total);
    };

    fetchSatPrices();
  }, [products, quantities]);

  useEffect(() => {
    const shippingTypeMap: { [key: string]: ShippingOptionsType } = {};

    products.forEach((product) => {
      if (product.shippingType !== undefined) {
        shippingTypeMap[product.id] = product.shippingType;
      }
    });

    setShippingTypes(shippingTypeMap);
  }, [products]);

  const toggleCheckout = () => {
    setIsBeingPaid(!isBeingPaid);
  };

  const handleRemoveFromCart = (productId: string) => {
    let cartContent = localStorage.getItem("cart")
      ? JSON.parse(localStorage.getItem("cart") as string)
      : [];
    if (cartContent.length > 0) {
      let updatedCart = cartContent.filter(
        (obj: ProductData) => obj.id !== productId,
      );
      setProducts(updatedCart);
      localStorage.setItem("cart", JSON.stringify(updatedCart));
    }
  };

  const handleQuantityChange = (id: string, change: number) => {
    setQuantities((prev) => {
      const product = products.find((p) => p.id === id);
      if (!product || !product.quantity) return prev;

      const availableQuantity = parseInt(product.quantity);
      const newQuantity = Math.max(
        1,
        Math.min(availableQuantity, prev[id] + change),
      );

      setHasReachedMax((prevState) => ({
        ...prevState,
        [id]: newQuantity === availableQuantity && newQuantity !== 1,
      }));

      return {
        ...prev,
        [id]: newQuantity,
      };
    });
  };

  const convertToSats = async (product: ProductData): Promise<number> => {
    if (
      product.currency.toLowerCase() === "sats" ||
      product.currency.toLowerCase() === "sat"
    ) {
      return product.price;
    }
    let price = 0;
    if (!currencySelection.hasOwnProperty(product.currency)) {
      throw new Error(`${product.currency} is not a supported currency.`);
    } else if (
      currencySelection.hasOwnProperty(product.currency) &&
      product.currency.toLowerCase() !== "sats" &&
      product.currency.toLowerCase() !== "sat"
    ) {
      try {
        const currencyData = {
          amount: product.price,
          currency: product.currency,
        };
        const numSats = await fiat.getSatoshiValue(currencyData);
        price = Math.round(numSats);
      } catch (err) {
        console.error("ERROR", err);
      }
    } else if (product.currency.toLowerCase() === "btc") {
      price = product.price * 100000000;
    }
    return price;
  };

  return (
    <>
      {!isBeingPaid ? (
        <div className="flex min-h-screen flex-col bg-light-bg p-4 text-light-text dark:bg-dark-bg dark:text-dark-text">
          <div className="w-full pt-20">
            <div className="mb-4 flex items-center justify-between">
              <h1 className="text-2xl font-bold">Shopping Cart</h1>
            </div>
            {products.length > 0 ? (
              <>
                {products.map((product) => (
                  <div
                    key={product.id}
                    className="relative mb-4 flex flex-col border-b pb-4"
                  >
                    <div className="flex items-start">
                      <img
                        src={product.images[0]}
                        alt={product.title}
                        className="mr-4 h-24 w-24 object-cover"
                      />
                      <div className="flex-1">
                        <div className="flex items-start justify-between">
                          <h2 className="text-lg font-semibold">
                            {product.title}
                          </h2>
                          <p className="ml-4 text-lg font-bold">
                            {satPrices[product.id] !== undefined
                              ? satPrices[product.id] !== null
                                ? `${satPrices[product.id]} sats`
                                : "Price unavailable"
                              : "Loading..."}
                          </p>
                        </div>
                        {product.quantity && (
                          <div>
                            <p className="text-sm text-green-600">
                              {product.quantity} in stock
                            </p>
                            <div className="mt-2 flex items-center">
                              {quantities[product.id] > 1 && (
                                <Button
                                  isIconOnly
                                  size="sm"
                                  variant="light"
                                  onClick={() =>
                                    handleQuantityChange(product.id, -1)
                                  }
                                >
                                  <MinusIcon className="h-4 w-4" />
                                </Button>
                              )}
                              <Input
                                type="number"
                                value={quantities[product.id].toString()}
                                min="1"
                                max={product.quantity}
                                className="mx-2 w-16"
                                onChange={(e) => {
                                  const newQuantity =
                                    parseInt(e.target.value) || 1;
                                  const maxQuantity = parseInt(
                                    product.quantity || "1",
                                  );
                                  const finalQuantity = Math.min(
                                    newQuantity,
                                    maxQuantity,
                                  );
                                  setQuantities((prev) => ({
                                    ...prev,
                                    [product.id]: finalQuantity,
                                  }));
                                  setHasReachedMax((prevState) => ({
                                    ...prevState,
                                    [product.id]:
                                      finalQuantity === maxQuantity &&
                                      maxQuantity !== 1,
                                  }));
                                }}
                              />
                              {quantities[product.id] <
                                parseInt(product.quantity || "1") && (
                                <Button
                                  isIconOnly
                                  size="sm"
                                  variant="light"
                                  onClick={() =>
                                    handleQuantityChange(product.id, 1)
                                  }
                                >
                                  <PlusIcon className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                            {hasReachedMax[product.id] && (
                              <p className="mt-1 text-xs text-red-500">
                                Maximum quantity reached
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="absolute bottom-4 right-4 flex">
                      <Button
                        size="sm"
                        color="danger"
                        variant="light"
                        className="mr-2"
                        onClick={() => handleRemoveFromCart(product.id)}
                      >
                        Remove
                      </Button>
                      {/* <Button
                        size="sm"
                        className="text-shopstr-purple-light dark:text-shopstr-yellow-light"
                        variant="light"
                      >
                        Save For Later
                      </Button> */}
                    </div>
                  </div>
                ))}
                <div className="mt-4 flex flex-col items-end">
                  <p className="mb-2 text-xl font-bold">
                    Subtotal ({products.length} items): {subtotal} sats
                  </p>
                  <Button
                    className={SHOPSTRBUTTONCLASSNAMES}
                    onClick={toggleCheckout}
                  >
                    Proceed To Checkout
                  </Button>
                </div>
              </>
            ) : (
              <div className="break-words text-center text-2xl text-light-text dark:text-dark-text">
                Your cart is empty . . .<br></br>
                <span className="cursor-pointer text-sm text-gray-500">
                  Check your saved for later items or{" "}
                  <span
                    className="underline hover:text-light-text dark:hover:text-dark-text"
                    onClick={() => router.push("/")}
                  >
                    continue shopping.
                  </span>
                </span>
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          {products.length > 0 && (
            <>
              {products.map((product) => (
                <div className="p-4 pt-20 text-light-text dark:text-dark-text">
                  <h2 className="mb-4 text-2xl font-bold">{product.title}</h2>
                  {product.selectedSize && (
                    <p className="mb-4 text-lg">Size: {product.selectedSize}</p>
                  )}
                  {/* <span className="mt-4 text-xl font-semibold">Cost Breakdown: </span> */}
                  <DisplayCostBreakdown monetaryInfo={product} />
                </div>
              ))}
              <div className="mx-4 mt-2 flex items-center justify-center text-center">
                <InformationCircleIcon className="h-6 w-6 text-light-text dark:text-dark-text" />
                <p className="ml-2 text-xs text-light-text dark:text-dark-text">
                  Once purchased, each seller will receive a message with a{" "}
                  <Link href="https://cashu.space" passHref legacyBehavior>
                    <a
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      Cashu
                    </a>
                  </Link>{" "}
                  token containing your payment.
                </p>
              </div>
            </>
          )}
          <div className="flex flex-col items-center">
            <CartInvoiceCard
              products={products}
              quantities={quantities}
              shippingTypes={shippingTypes}
              subtotal={subtotal}
            />
          </div>
        </>
      )}
    </>
  );
}
