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
  const [shippingSatPrices, setShippingSatPrices] = useState<{
    [key: string]: number | null;
  }>({});
  const [totalCostsInSats, setTotalCostsInSats] = useState<{
    [key: string]: number;
  }>({});
  const [subtotal, setSubtotal] = useState<number>(0);
  const [totalShippingCost, setTotalShippingCost] = useState<number>(0);
  const [totalCost, setTotalCost] = useState<number>(0);
  const [shippingTypes, setShippingTypes] = useState<{
    [key: string]: ShippingOptionsType;
  }>({});
  // Initialize quantities state
  const initializeQuantities = (products: ProductData[]) => {
    const initialQuantities: { [key: string]: number } = {};
    products.forEach((product) => {
      initialQuantities[product.id] = 1; // Default quantity is 1
    });
    return initialQuantities;
  };

  // Use the initialized quantities
  const [quantities, setQuantities] = useState<{ [key: string]: number }>(() =>
    initializeQuantities(products),
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
        for (const item of cartList as ProductData[]) {
          if (item.selectedQuantity) {
            setQuantities({
              ...quantities,
              [item.id]: item.selectedQuantity,
            });
          }
        }
      }
    }
  }, []);

  useEffect(() => {
    const fetchSatPrices = async () => {
      const prices: { [key: string]: number | null } = {};
      const shipping: { [key: string]: number | null } = {};
      const totals: { [key: string]: number } = {};
      let subtotalAmount = 0;
      let shippingCostAmount = 0;
      let totalCostAmount = 0;

      for (const product of products) {
        try {
          let subtotal = 0;
          let shippingCost = 0;
          let totalCost = 0;
          const subtotalSatPrice = await convertPriceToSats(product);
          prices[product.id] = subtotalSatPrice;
          const shippingSatPrice = await convertShippingToSats(product);
          shipping[product.id] = shippingSatPrice;
          const totalSatPrice = await convertTotalToSats(product);
          totals[product.pubkey] = totalSatPrice;

          if (subtotalSatPrice !== null || shippingSatPrice !== null) {
            if (quantities[product.id]) {
              subtotalAmount += subtotalSatPrice * quantities[product.id];
              subtotal = subtotalSatPrice * quantities[product.id];
              shippingCostAmount += shippingSatPrice * quantities[product.id];
              shippingCost = shippingSatPrice * quantities[product.id];
              totalCostAmount += totalSatPrice * quantities[product.id];
              totalCost = totalSatPrice * quantities[product.id];
            } else {
              subtotalAmount += subtotalSatPrice;
              subtotal = subtotalSatPrice;
              shippingCostAmount += shippingSatPrice;
              shippingCost = shippingSatPrice;
              totalCostAmount += totalSatPrice;
              totalCost = totalSatPrice;
            }
            prices[product.id] = subtotal;
            shipping[product.id] = shippingCost;
            totals[product.pubkey] = totalCost;
          }
        } catch (error) {
          console.error(
            `Error converting price for product ${product.id}:`,
            error,
          );
          prices[product.id] = null;
          shipping[product.id] = null;
        }
      }

      setSatPrices(prices);
      setSubtotal(subtotalAmount);
      setShippingSatPrices(shipping);
      setTotalShippingCost(shippingCostAmount);
      setTotalCost(totalCostAmount);
      setTotalCostsInSats(totals);
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

      const availableQuantity = parseInt(String(product.quantity));
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

  const convertPriceToSats = async (product: ProductData): Promise<number> => {
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

  const convertShippingToSats = async (
    product: ProductData,
  ): Promise<number> => {
    let shippingCost = product.shippingCost ? product.shippingCost : 0;
    if (
      product.currency.toLowerCase() === "sats" ||
      product.currency.toLowerCase() === "sat"
    ) {
      return shippingCost;
    }
    let cost = 0;
    if (!currencySelection.hasOwnProperty(product.currency)) {
      throw new Error(`${product.currency} is not a supported currency.`);
    } else if (
      currencySelection.hasOwnProperty(product.currency) &&
      product.currency.toLowerCase() !== "sats" &&
      product.currency.toLowerCase() !== "sat"
    ) {
      try {
        const currencyData = {
          amount: shippingCost,
          currency: product.currency,
        };
        const numSats = await fiat.getSatoshiValue(currencyData);
        cost = Math.round(numSats);
      } catch (err) {
        console.error("ERROR", err);
      }
    } else if (product.currency.toLowerCase() === "btc") {
      cost = shippingCost * 100000000;
    }
    return cost;
  };

  const convertTotalToSats = async (product: ProductData): Promise<number> => {
    if (
      product.currency.toLowerCase() === "sats" ||
      product.currency.toLowerCase() === "sat"
    ) {
      return product.totalCost;
    }
    let total = 0;
    if (!currencySelection.hasOwnProperty(product.currency)) {
      throw new Error(`${product.currency} is not a supported currency.`);
    } else if (
      currencySelection.hasOwnProperty(product.currency) &&
      product.currency.toLowerCase() !== "sats" &&
      product.currency.toLowerCase() !== "sat"
    ) {
      try {
        const currencyData = {
          amount: product.totalCost,
          currency: product.currency,
        };
        const numSats = await fiat.getSatoshiValue(currencyData);
        total = Math.round(numSats);
      } catch (err) {
        console.error("ERROR", err);
      }
    } else if (product.currency.toLowerCase() === "btc") {
      total = product.totalCost * 100000000;
    }
    return total;
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
                                value={(quantities[product.id] || 1).toString()}
                                min="1"
                                max={String(product.quantity)}
                                className="mx-2 w-16"
                                onChange={(e) => {
                                  const newQuantity =
                                    parseInt(e.target.value) || 1;
                                  const maxQuantity = parseInt(
                                    String(product.quantity) || "1",
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
                                parseInt(String(product.quantity || "1")) && (
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
                    onClick={() => router.push("/marketplace")}
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
          <div className="flex w-full bg-light-bg text-light-text dark:bg-dark-bg dark:text-dark-text sm:items-center sm:justify-center">
            <div className="flex flex-col pb-4 pt-20">
              {products.length > 0 && (
                <>
                  {products.map((product) => (
                    <div
                      key={product.id}
                      className="p-4 text-light-text dark:text-dark-text"
                    >
                      <h2 className="mb-4 text-2xl font-bold">
                        {product.title}
                      </h2>
                      {product.selectedSize && (
                        <p className="mb-4 text-lg">
                          Size: {product.selectedSize}
                        </p>
                      )}
                      {quantities[product.id] > 1 && (
                        <p className="mb-4 text-lg">
                          Quantity: {quantities[product.id]}
                        </p>
                      )}
                      <DisplayCostBreakdown
                        subtotal={
                          satPrices[product.id]
                            ? (satPrices[product.id] as number)
                            : 0
                        }
                        shippingType={product.shippingType}
                        shippingCost={
                          shippingSatPrices[product.id]
                            ? (shippingSatPrices[product.id] as number)
                            : 0
                        }
                        totalCost={
                          totalCostsInSats[product.pubkey]
                            ? totalCostsInSats[product.pubkey]
                            : 0
                        }
                      />
                    </div>
                  ))}
                  <div className="mx-4 mt-2 flex items-center justify-center text-center">
                    <InformationCircleIcon className="h-6 w-6 text-light-text dark:text-dark-text" />
                    <p className="ml-2 text-xs text-light-text dark:text-dark-text">
                      Once purchased, each seller will receive a DM with your
                      order details.
                    </p>
                  </div>
                </>
              )}
              <div className="flex flex-col items-center">
                <CartInvoiceCard
                  products={products}
                  quantities={quantities}
                  shippingTypes={shippingTypes}
                  totalCostsInSats={totalCostsInSats}
                  subtotal={subtotal}
                  totalShippingCost={totalShippingCost}
                  totalCost={totalCost}
                />
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
