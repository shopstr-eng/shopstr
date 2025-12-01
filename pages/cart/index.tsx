/* eslint-disable @next/next/no-img-element */

import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";
import {
  Button,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  Input,
} from "@nextui-org/react";
import {
  PlusIcon,
  MinusIcon,
  ShoppingBagIcon,
  CheckCircleIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import {
  SHOPSTRBUTTONCLASSNAMES,
  ShippingOptionsType,
} from "@/utils/STATIC-VARIABLES";
import { ProductData } from "@/utils/parsers/product-parser-functions";
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
  const [totalCostsInSats, setTotalCostsInSats] = useState<{
    [key: string]: number;
  }>({});
  const [subtotal, setSubtotal] = useState<number>(0);
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

  const [invoiceIsPaid, setInvoiceIsPaid] = useState(false);
  const [invoiceGenerationFailed, setInvoiceGenerationFailed] = useState(false);
  const [cashuPaymentSent, setCashuPaymentSent] = useState(false);
  const [cashuPaymentFailed, setCashuPaymentFailed] = useState(false);

  const [discountCodes, setDiscountCodes] = useState<{
    [pubkey: string]: string;
  }>({});
  const [appliedDiscounts, setAppliedDiscounts] = useState<{
    [pubkey: string]: number;
  }>({});
  const [discountErrors, setDiscountErrors] = useState<{
    [pubkey: string]: string;
  }>({});

  // Group products by seller pubkey
  const productsBySeller = products.reduce(
    (acc, product) => {
      if (!acc[product.pubkey]) {
        acc[product.pubkey] = [];
      }
      acc[product.pubkey]!.push(product);
      return acc;
    },
    {} as { [pubkey: string]: ProductData[] }
  );

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

      // Load saved discount codes
      const storedDiscounts = localStorage.getItem("cartDiscounts");
      if (storedDiscounts) {
        const discounts = JSON.parse(storedDiscounts);
        const codes: { [pubkey: string]: string } = {};
        const applied: { [pubkey: string]: number } = {};

        Object.entries(discounts).forEach(([pubkey, data]: [string, any]) => {
          codes[pubkey] = data.code;
          applied[pubkey] = data.percentage;
        });

        setDiscountCodes(codes);
        setAppliedDiscounts(applied);
      }
    }
  }, []);

  useEffect(() => {
    const fetchSatPrices = async () => {
      const prices: { [key: string]: number | null } = {};
      const shipping: { [key: string]: number } = {};
      const totals: { [key: string]: number } = {};
      let subtotalAmount = 0;

      for (const product of products) {
        try {
          const priceSats = await convertPriceToSats(product);
          const shippingSatPrice = await convertShippingToSats(product);
          const discount = appliedDiscounts[product.pubkey] || 0;
          let discountedPrice = priceSats;
          let productSubtotal = 0;
          let productShipping = 0;

          if (discount > 0) {
            discountedPrice = Math.ceil(priceSats * (1 - discount / 100));
          }

          if (discountedPrice !== null || shippingSatPrice !== null) {
            if (quantities[product.id]) {
              productSubtotal = Math.ceil(
                discountedPrice * quantities[product.id]!
              );
              productShipping = Math.ceil(
                shippingSatPrice * quantities[product.id]!
              );
              subtotalAmount += productSubtotal;
            } else {
              productSubtotal = discountedPrice;
              productShipping = shippingSatPrice;
              subtotalAmount += discountedPrice;
            }
            prices[product.id] = productSubtotal;
            shipping[product.id] = productShipping;
            // Store just the product cost in totals for now
            totals[product.pubkey] = productSubtotal;
          }
        } catch (error) {
          console.error(
            `Error converting price for product ${product.id}:`,
            error
          );
          prices[product.id] = null;
          shipping[product.id] = 0;
        }
      }

      setSatPrices(prices);
      setSubtotal(subtotalAmount);
      setTotalCostsInSats(totals);
    };

    fetchSatPrices();
  }, [products, quantities, appliedDiscounts]);

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

  const handleApplyDiscount = async (pubkey: string) => {
    const code = discountCodes[pubkey];
    if (!code?.trim()) {
      setDiscountErrors({
        ...discountErrors,
        [pubkey]: "Please enter a discount code",
      });
      return;
    }

    try {
      const response = await fetch(
        `/api/db/discount-codes?validate=true&code=${encodeURIComponent(
          code
        )}&pubkey=${pubkey}`
      );

      if (!response.ok) {
        setDiscountErrors({
          ...discountErrors,
          [pubkey]: "Failed to validate discount code",
        });
        return;
      }

      const result = await response.json();

      if (result.valid && result.discount_percentage) {
        setAppliedDiscounts({
          ...appliedDiscounts,
          [pubkey]: result.discount_percentage,
        });
        setDiscountErrors({ ...discountErrors, [pubkey]: "" });

        // Save to localStorage
        const storedDiscounts = localStorage.getItem("cartDiscounts");
        const discounts = storedDiscounts ? JSON.parse(storedDiscounts) : {};
        discounts[pubkey] = {
          code: code,
          percentage: result.discount_percentage,
        };
        localStorage.setItem("cartDiscounts", JSON.stringify(discounts));
      } else {
        setDiscountErrors({
          ...discountErrors,
          [pubkey]: "Invalid or expired discount code",
        });
        setAppliedDiscounts({ ...appliedDiscounts, [pubkey]: 0 });
      }
    } catch (error) {
      console.error("Failed to apply discount:", error);
      setDiscountErrors({
        ...discountErrors,
        [pubkey]: "Failed to apply discount code",
      });
      setAppliedDiscounts({ ...appliedDiscounts, [pubkey]: 0 });
    }
  };

  const handleRemoveDiscount = (pubkey: string) => {
    setDiscountCodes({ ...discountCodes, [pubkey]: "" });
    setAppliedDiscounts({ ...appliedDiscounts, [pubkey]: 0 });
    setDiscountErrors({ ...discountErrors, [pubkey]: "" });

    // Remove from localStorage
    const storedDiscounts = localStorage.getItem("cartDiscounts");
    if (storedDiscounts) {
      const discounts = JSON.parse(storedDiscounts);
      delete discounts[pubkey];
      localStorage.setItem("cartDiscounts", JSON.stringify(discounts));
    }
  };

  const convertPriceToSats = async (product: ProductData): Promise<number> => {
    // Use volumePrice if it exists, otherwise use default price
    const basePrice =
      product.volumePrice !== undefined ? product.volumePrice : product.price;

    if (
      product.currency.toLowerCase() === "sats" ||
      product.currency.toLowerCase() === "sat"
    ) {
      return basePrice;
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
          amount: basePrice,
          currency: product.currency,
        };
        const numSats = await fiat.getSatoshiValue(currencyData);
        price = Math.round(numSats);
      } catch (err) {
        console.error("ERROR", err);
      }
    } else if (product.currency.toLowerCase() === "btc") {
      price = basePrice * 100000000;
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
                <div className="space-y-6">
                  {Object.entries(productsBySeller).map(
                    ([sellerPubkey, sellerProducts]) => (
                      <div key={sellerPubkey} className="space-y-4">
                        {sellerProducts.map((product) => (
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
                                  <h2 className="mb-2 text-lg md:mb-0">
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

                        {/* Discount code section for this seller */}
                        <div className="rounded-lg border border-gray-300 p-4 shadow-sm dark:border-gray-700">
                          <h3 className="mb-3 font-semibold">
                            Have a discount code from this seller?
                          </h3>
                          <div className="flex gap-2">
                            <Input
                              label="Discount Code"
                              placeholder="Enter code"
                              value={discountCodes[sellerPubkey] || ""}
                              onChange={(e) =>
                                setDiscountCodes({
                                  ...discountCodes,
                                  [sellerPubkey]: e.target.value.toUpperCase(),
                                })
                              }
                              className="flex-1 text-light-text dark:text-dark-text"
                              disabled={appliedDiscounts[sellerPubkey]! > 0}
                              isInvalid={!!discountErrors[sellerPubkey]}
                              errorMessage={discountErrors[sellerPubkey]}
                            />
                            {appliedDiscounts[sellerPubkey]! > 0 ? (
                              <Button
                                color="warning"
                                onClick={() =>
                                  handleRemoveDiscount(sellerPubkey)
                                }
                              >
                                Remove
                              </Button>
                            ) : (
                              <Button
                                className={SHOPSTRBUTTONCLASSNAMES}
                                onClick={() =>
                                  handleApplyDiscount(sellerPubkey)
                                }
                              >
                                Apply
                              </Button>
                            )}
                          </div>
                          {appliedDiscounts[sellerPubkey]! > 0 && (
                            <p className="mt-2 text-sm text-green-600 dark:text-green-400">
                              {appliedDiscounts[sellerPubkey]}% discount applied
                              to all items from this seller!
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  )}
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
        <div className="flex min-h-screen w-full bg-light-bg text-light-text dark:bg-dark-bg dark:text-dark-text sm:items-center sm:justify-center">
          <div className="mx-auto flex w-full flex-col pt-20">
            <div className="flex flex-col items-center">
              <CartInvoiceCard
                products={products}
                quantities={quantities}
                shippingTypes={shippingTypes}
                totalCostsInSats={totalCostsInSats}
                subtotalCost={subtotal}
                appliedDiscounts={appliedDiscounts}
                discountCodes={discountCodes}
                onBackToCart={toggleCheckout}
                setInvoiceIsPaid={setInvoiceIsPaid}
                setInvoiceGenerationFailed={setInvoiceGenerationFailed}
                setCashuPaymentSent={setCashuPaymentSent}
                setCashuPaymentFailed={setCashuPaymentFailed}
              />
            </div>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {invoiceIsPaid || cashuPaymentSent ? (
        <>
          <Modal
            backdrop="blur"
            isOpen={invoiceIsPaid || cashuPaymentSent}
            onClose={() => {
              setInvoiceIsPaid(false);
              setCashuPaymentSent(false);
              router.push("/orders");
            }}
            classNames={{
              body: "py-6 ",
              backdrop: "bg-[#292f46]/50 backdrop-opacity-60",
              header: "border-b-[1px] border-[#292f46]",
              footer: "border-t-[1px] border-[#292f46]",
              closeButton: "hover:bg-black/5 active:bg-white/10",
            }}
            isDismissable={true}
            scrollBehavior={"normal"}
            placement={"center"}
            size="2xl"
          >
            <ModalContent>
              <ModalHeader className="flex items-center justify-center text-light-text dark:text-dark-text">
                <CheckCircleIcon className="h-6 w-6 text-green-500" />
                <div className="ml-2">Order successful!</div>
              </ModalHeader>
              <ModalBody className="flex flex-col overflow-hidden text-light-text dark:text-dark-text">
                <div className="flex items-center justify-center">
                  The seller will receive a message with your order details.
                </div>
              </ModalBody>
            </ModalContent>
          </Modal>
        </>
      ) : null}

      {/* Invoice Generation Failed Modal */}
      {invoiceGenerationFailed ? (
        <>
          <Modal
            backdrop="blur"
            isOpen={invoiceGenerationFailed}
            onClose={() => setInvoiceGenerationFailed(false)}
            classNames={{
              body: "py-6 ",
              backdrop: "bg-[#292f46]/50 backdrop-opacity-60",
              header: "border-b-[1px] border-[#292f46]",
              footer: "border-t-[1px] border-[#292f46]",
              closeButton: "hover:bg-black/5 active:bg-white/10",
            }}
            isDismissable={true}
            scrollBehavior={"normal"}
            placement={"center"}
            size="2xl"
          >
            <ModalContent>
              <ModalHeader className="flex items-center justify-center text-light-text dark:text-dark-text">
                <XCircleIcon className="h-6 w-6 text-red-500" />
                <div className="ml-2">Invoice generation failed!</div>
              </ModalHeader>
              <ModalBody className="flex flex-col overflow-hidden text-light-text dark:text-dark-text">
                <div className="flex items-center justify-center">
                  The price and/or currency set for this listing was invalid.
                </div>
              </ModalBody>
            </ModalContent>
          </Modal>
        </>
      ) : null}

      {/* Cashu Payment Failed Modal */}
      {cashuPaymentFailed ? (
        <>
          <Modal
            backdrop="blur"
            isOpen={cashuPaymentFailed}
            onClose={() => setCashuPaymentFailed(false)}
            classNames={{
              body: "py-6 ",
              backdrop: "bg-[#292f46]/50 backdrop-opacity-60",
              header: "border-b-[1px] border-[#292f46]",
              footer: "border-t-[1px] border-[#292f46]",
              closeButton: "hover:bg-black/5 active:bg-white/10",
            }}
            isDismissable={true}
            scrollBehavior={"normal"}
            placement={"center"}
            size="2xl"
          >
            <ModalContent>
              <ModalHeader className="flex items-center justify-center text-light-text dark:text-dark-text">
                <XCircleIcon className="h-6 w-6 text-red-500" />
                <div className="ml-2">Purchase failed!</div>
              </ModalHeader>
              <ModalBody className="flex flex-col overflow-hidden text-light-text dark:text-dark-text">
                <div className="flex items-center justify-center">
                  You didn&apos;t have enough balance in your wallet to pay.
                </div>
              </ModalBody>
            </ModalContent>
          </Modal>
        </>
      ) : null}
    </>
  );
}
