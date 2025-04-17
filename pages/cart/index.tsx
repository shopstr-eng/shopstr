/* eslint-disable @next/next/no-img-element */

import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { Button, Input as _Input } from "@nextui-org/react";
import {
  PlusIcon,
  MinusIcon,
  InformationCircleIcon,
  ShoppingBagIcon,
} from "@heroicons/react/24/outline";
import {
  SHOPSTRBUTTONCLASSNAMES,
  ShippingOptionsType,
} from "@/utils/STATIC-VARIABLES";
import { ProductData } from "@/utils/parsers/product-parser-functions";
import { DisplayCostBreakdown } from "../../components/utility-components/display-monetary-info";
import CartInvoiceCard from "../../components/cart-invoice-card";
import { fiat } from "@getalby/lightning-tools";
import currencySelection from "../../public/currencySelection.json";

interface QuantitySelectorProps {
  value: number;
  onDecrease: () => void;
  onIncrease: () => void;
  onChange: (newValue: number) => void;
  min: number;
  max: number;
}

function QuantitySelector({
  value,
  onDecrease,
  onIncrease,
  onChange,
  min,
  max,
}: QuantitySelectorProps) {
  return (
    <div className="mt-2 flex items-center space-x-2 rounded-full px-2 py-1">
      <button
        onClick={onDecrease}
        disabled={value <= min}
        className="flex h-8 w-8 items-center justify-center rounded-full text-black disabled:opacity-50 dark:text-white"
      >
        <MinusIcon className="h-4 w-4" />
      </button>
      <input
        type="number"
        value={value}
        onChange={(e) => {
          const newVal = parseInt(e.target.value) || min;
          onChange(Math.min(Math.max(newVal, min), max));
        }}
        min={min}
        max={max}
        className="w-12 rounded-md bg-white text-center text-gray-900 outline-none dark:bg-gray-800 dark:text-gray-100
          [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <button
        onClick={onIncrease}
        disabled={value >= max}
        className="flex h-8 w-8 items-center justify-center rounded-full text-black disabled:opacity-50 dark:text-white"
      >
        <PlusIcon className="h-4 w-4" />
      </button>
    </div>
  );
}

export default function Component() {
  const [products, setProducts] = useState<ProductData[]>([]);
  const [satPrices, setSatPrices] = useState<{ [key: string]: number | null }>(
    {}
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
      initialQuantities[product.id] = 1; 
    });
    return initialQuantities;
  };
  
  // Use the initialized quantities
  const [quantities, setQuantities] = useState<{ [key: string]: number }>(() =>
    initializeQuantities(products)
  );
  const [hasReachedMax, setHasReachedMax] = useState<{
    [key: string]: boolean;
  }>(Object.fromEntries(products.map((product) => [product.id, false])));
  const [isBeingPaid, setIsBeingPaid] = useState(false);

  const router = useRouter();

  useEffect(() => {
    if (typeof window !== "undefined") {
      const cartList = localStorage.getItem("cart")
        ? JSON.parse(localStorage.getItem("cart") as string)
        : [];
      if (cartList && cartList.length > 0) {
        setProducts(cartList);
        for (const item of cartList as ProductData[]) {
          if (item.selectedQuantity) {
            setQuantities((prev) => ({
              ...prev,
              [item.id]: item.selectedQuantity || 1,
            }));
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
          let productSubtotal = 0;
          let productShipping = 0;
          let productTotal = 0;
          const subtotalSatPrice = await convertPriceToSats(product);
          prices[product.id] = subtotalSatPrice;
          const shippingSatPrice = await convertShippingToSats(product);
          shipping[product.id] = shippingSatPrice;
          const totalSatPrice = await convertTotalToSats(product);
          totals[product.pubkey] = totalSatPrice;

          if (subtotalSatPrice !== null || shippingSatPrice !== null) {
            if (quantities[product.id]) {
              productSubtotal = subtotalSatPrice * quantities[product.id]!;
              productShipping = shippingSatPrice * quantities[product.id]!;
              productTotal = totalSatPrice * quantities[product.id]!;
              subtotalAmount += productSubtotal;
              shippingCostAmount += productShipping;
              totalCostAmount += productTotal;
            } else {
              subtotalAmount += subtotalSatPrice;
              shippingCostAmount += shippingSatPrice;
              totalCostAmount += totalSatPrice;
              productSubtotal = subtotalSatPrice;
              productShipping = shippingSatPrice;
              productTotal = totalSatPrice;
            }
            prices[product.id] = productSubtotal;
            shipping[product.id] = productShipping;
            totals[product.pubkey] = productTotal;
          }
        } catch (error) {
          console.error(
            `Error converting price for product ${product.id}:`,
            error
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

  const handleQuantityChange = (id: string, newQuantity: number) => {
    setQuantities((prev) => {
      const product = products.find((p) => p.id === id);
      if (!product || !product.quantity) return prev;
      const maxQuantity = parseInt(String(product.quantity));
      const finalQuantity = Math.min(Math.max(newQuantity, 1), maxQuantity);
      setHasReachedMax((prevState) => ({
        ...prevState,
        [id]: finalQuantity === maxQuantity && maxQuantity !== 1,
      }));
      return {
        ...prev,
        [id]: finalQuantity,
      };
    });
  };

  const handleRemoveFromCart = (productId: string) => {
    const cartContent = localStorage.getItem("cart")
      ? JSON.parse(localStorage.getItem("cart") as string)
      : [];
    if (cartContent.length > 0) {
      const updatedCart = cartContent.filter(
        (obj: ProductData) => obj.id !== productId
      );
      setProducts(updatedCart);
      localStorage.setItem("cart", JSON.stringify(updatedCart));
    }
  };

  const convertPriceToSats = async (product: ProductData): Promise<number> => {
    if (
      product.currency.toLowerCase() === "sats" ||
      product.currency.toLowerCase() === "sat"
    ) {
      return product.price;
    }
    let price = 0;
    if (!currencySelection.hasOwnProperty(product.currency.toUpperCase())) {
      throw new Error(`${product.currency} is not a supported currency.`);
    } else if (
      currencySelection.hasOwnProperty(product.currency.toUpperCase()) &&
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
    product: ProductData
  ): Promise<number> => {
    const shippingCost = product.shippingCost ? product.shippingCost : 0;
    if (
      product.currency.toLowerCase() === "sats" ||
      product.currency.toLowerCase() === "sat"
    ) {
      return shippingCost;
    }
    let cost = 0;
    if (!currencySelection.hasOwnProperty(product.currency.toUpperCase())) {
      throw new Error(`${product.currency} is not a supported currency.`);
    } else if (
      currencySelection.hasOwnProperty(product.currency.toUpperCase()) &&
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
    if (!currencySelection.hasOwnProperty(product.currency.toUpperCase())) {
      throw new Error(`${product.currency} is not a supported currency.`);
    } else if (
      currencySelection.hasOwnProperty(product.currency.toUpperCase()) &&
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
          <div className="mx-auto w-full max-w-4xl pt-20">
            <div className="mb-6 flex items-center">
              <h1 className="w-full text-left text-2xl font-bold">
                Shopping Cart
              </h1>
            </div>
            {products.length > 0 ? (
              <>
                <div className="space-y-4">
                  {products.map((product) => (
                    <div
                      key={product.id}
                      className="flex flex-col rounded-lg border border-gray-300 p-4 shadow-sm dark:border-gray-700 md:flex-row md:items-start md:justify-between"
                    >
                      <div className="flex w-full md:w-auto">
                        <img
                          src={product.images[0]}
                          alt={product.title}
                          className="mr-4 h-24 w-24 rounded-md object-cover"
                        />
                        <div className="flex-1">
                          <div className="flex flex-col md:flex-row md:items-start md:justify-between md:gap-5">
                            <h2 className="mb-2 text-lg font-semibold md:mb-0">
                              {product.title}
                            </h2>
                            <p className="text-lg font-bold">
                              {satPrices[product.id] !== undefined
                                ? satPrices[product.id] !== null
                                  ? `${satPrices[product.id]} sats`
                                  : "Price unavailable"
                                : "Loading..."}
                            </p>
                          </div>
                          {product.quantity && (
                            <div className="mt-2">
                              <p className="mb-2 text-sm text-green-600">
                                {product.quantity} in stock
                              </p>
                              <QuantitySelector
                                value={quantities[product.id] || 1}
                                onDecrease={() =>
                                  handleQuantityChange(
                                    product.id,
                                    (quantities[product.id] || 1) - 1
                                  )
                                }
                                onIncrease={() =>
                                  handleQuantityChange(
                                    product.id,
                                    (quantities[product.id] || 1) + 1
                                  )
                                }
                                onChange={(newVal) =>
                                  handleQuantityChange(product.id, newVal)
                                }
                                min={1}
                                max={parseInt(String(product.quantity))}
                              />
                              {hasReachedMax[product.id] && (
                                <p className="mt-1 text-xs text-red-500">
                                  Maximum quantity reached
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="mt-4 flex md:mt-0 md:items-center">
                        <Button
                          size="sm"
                          color="danger"
                          variant="light"
                          className="ml-auto"
                          onClick={() => handleRemoveFromCart(product.id)}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-6 flex flex-col items-end border-t border-gray-300 pt-4 dark:border-gray-700">
                  <p className="mb-4 text-xl font-bold">
                    Subtotal ({products.length}{" "}
                    {products.length === 1 ? "item" : "items"}): {subtotal} sats
                  </p>
                  <Button
                    className={SHOPSTRBUTTONCLASSNAMES}
                    onClick={toggleCheckout}
                    size="lg"
                  >
                    Proceed To Checkout
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex min-h-[60vh] flex-col items-center justify-center rounded-lg border border-gray-300 py-16 shadow-sm dark:border-gray-700 dark:shadow-none">
                <div className="mb-8 flex items-center justify-center rounded-full border border-gray-300 bg-gray-100 p-6 dark:border-gray-600 dark:bg-gray-700">
                  <ShoppingBagIcon className="h-16 w-16 text-gray-800 dark:text-gray-200" />
                </div>
                <h2 className="mb-2 text-center text-3xl font-bold text-light-text dark:text-dark-text">
                  Your cart is empty . . .
                </h2>
                <p className="mb-6 max-w-md text-center text-gray-500 dark:text-gray-400">
                  Go add some items to your cart!
                </p>
                <Button
                  className={SHOPSTRBUTTONCLASSNAMES}
                  size="lg"
                  onClick={() => router.push("/marketplace")}
                >
                  Continue Shopping
                </Button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex min-h-screen w-full bg-light-bg p-4 text-light-text dark:bg-dark-bg dark:text-dark-text sm:items-center sm:justify-center">
          <div className="mx-auto flex w-full max-w-4xl flex-col px-4 pb-4 pt-20">
            <h1 className="mb-6 text-2xl font-bold">Checkout</h1>
            {products.length > 0 && (
              <>
                {products.map((product) => (
                  <div
                    key={product.id}
                    className="mb-6 rounded-lg border border-gray-300 p-4 shadow-sm dark:border-gray-700"
                  >
                    <h2 className="mb-4 text-xl font-bold">{product.title}</h2>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      {product.selectedSize && (
                        <p className="text-base">
                          <span className="font-medium">Size:</span>{" "}
                          {product.selectedSize}
                        </p>
                      )}
                      {quantities[product.id]! > 1 && (
                        <p className="text-base">
                          <span className="font-medium">Quantity:</span>{" "}
                          {quantities[product.id]}
                        </p>
                      )}
                    </div>
                    <div className="mt-4 border-t border-gray-300 pt-4 dark:border-gray-700">
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
                  </div>
                ))}
                <div className="mb-6 flex items-center justify-center rounded-lg border border-gray-200 bg-gray-50 p-4 text-center dark:border-gray-700 dark:bg-gray-800">
                  <InformationCircleIcon className="mr-2 h-5 w-5 flex-shrink-0 text-gray-600 dark:text-gray-400" />
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Once purchased, each seller will receive a DM with your order details.
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
              <span
                className="mt-4 cursor-pointer text-shopstr-purple hover:text-shopstr-purple-light dark:text-shopstr-yellow dark:hover:text-shopstr-yellow-light"
                onClick={toggleCheckout}
              >
                Return to Cart
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
