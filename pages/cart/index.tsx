/* eslint-disable @next/next/no-img-element */

import React, { useEffect, useState } from "react";
import Image from "next/image";
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
import { ShippingOptionsType, NEO_BTN } from "@/utils/STATIC-VARIABLES";
import { ProductData } from "@/utils/parsers/product-parser-functions";
import CartInvoiceCard from "../../components/cart-invoice-card";
import { fiat } from "@getalby/lightning-tools";
import { sanitizeUrl } from "@braintree/sanitize-url";
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
    <div className="mt-2 flex w-fit items-center overflow-hidden rounded-lg border border-zinc-700 bg-[#111]">
      <button
        onClick={onDecrease}
        disabled={value <= min}
        className="flex h-10 w-10 items-center justify-center text-zinc-400 hover:bg-zinc-800 hover:text-white disabled:opacity-30"
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
        className="w-12 bg-transparent text-center font-bold text-white text-base outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <button
        onClick={onIncrease}
        disabled={value >= max}
        className="flex h-10 w-10 items-center justify-center text-zinc-400 hover:bg-zinc-800 hover:text-white disabled:opacity-30"
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
        <div className="flex min-h-screen flex-col bg-[#111] p-4 text-white">
          <div className="mx-auto w-full max-w-4xl pt-20">
            <div className="mb-6 flex items-center">
              <h1 className="w-full text-left text-4xl font-black uppercase tracking-tighter">
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
                            className="flex flex-col rounded-xl border border-zinc-800 bg-[#161616] p-6 md:flex-row md:items-start md:justify-between"
                          >
                            <div className="flex w-full md:w-auto">
                              <Image
                                src={sanitizeUrl(product.images[0])}
                                alt={product.title}
                                width={96}
                                height={96}
                                className="mr-6 h-24 w-24 rounded-lg border border-zinc-700 object-cover"
                              />
                              <div className="flex-1">
                                <div className="flex flex-col md:flex-row md:items-start md:justify-between md:gap-5">
                                  <h2 className="mb-2 text-xl font-bold md:mb-0">
                                    {product.title}
                                  </h2>
                                  <p className="text-lg font-black text-yellow-400">
                                    {satPrices[product.id] !== undefined
                                      ? satPrices[product.id] !== null
                                        ? `${satPrices[product.id]} sats`
                                        : "Price unavailable"
                                      : "Loading..."}
                                  </p>
                                </div>
                                {product.quantity && (
                                  <div className="mt-2">
                                    <p className="mb-2 text-xs font-bold uppercase tracking-wider text-green-400">
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
                                className="ml-auto font-bold uppercase tracking-wider text-red-500 hover:bg-red-500/10"
                                onClick={() => handleRemoveFromCart(product.id)}
                              >
                                Remove
                              </Button>
                            </div>
                          </div>
                        ))}

                        {/* Discount code section for this seller */}
                        <div className="rounded-xl border border-zinc-800 bg-[#161616] p-6">
                          <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-zinc-400">
                            Have a discount code from this seller?
                          </h3>
                          <p className="mb-1 text-xs font-bold uppercase tracking-wider text-zinc-500">
                            Discount Code
                          </p>
                          <div className="flex items-start gap-2">
                            <Input
                              placeholder="Enter code"
                              value={discountCodes[sellerPubkey] || ""}
                              onChange={(e) =>
                                setDiscountCodes({
                                  ...discountCodes,
                                  [sellerPubkey]: e.target.value.toUpperCase(),
                                })
                              }
                              className="flex-1"
                              variant="bordered"
                              classNames={{
                                input: "text-white text-base",
                                inputWrapper:
                                  "bg-[#111] border-zinc-700 data-[hover=true]:border-zinc-500 group-data-[focus=true]:border-yellow-400 h-10",
                              }}
                              disabled={appliedDiscounts[sellerPubkey]! > 0}
                              isInvalid={!!discountErrors[sellerPubkey]}
                              errorMessage={discountErrors[sellerPubkey]}
                            />
                            {appliedDiscounts[sellerPubkey]! > 0 ? (
                              <Button
                                className="h-10 rounded-lg bg-red-500 font-bold uppercase tracking-wider text-white"
                                onClick={() =>
                                  handleRemoveDiscount(sellerPubkey)
                                }
                              >
                                Remove
                              </Button>
                            ) : (
                              <Button
                                className="h-10 rounded-lg border border-zinc-700 bg-[#161616] font-bold uppercase tracking-wider text-zinc-300 hover:bg-zinc-800 hover:text-white"
                                onClick={() =>
                                  handleApplyDiscount(sellerPubkey)
                                }
                              >
                                Apply
                              </Button>
                            )}
                          </div>
                          {appliedDiscounts[sellerPubkey]! > 0 && (
                            <p className="mt-2 text-sm font-bold text-green-400">
                              {appliedDiscounts[sellerPubkey]}% discount applied
                              to all items from this seller!
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  )}
                </div>
                <div className="mt-6 flex flex-col items-end border-t border-zinc-800 pt-6">
                  <p className="mb-4 text-xl font-black uppercase tracking-tight">
                    Subtotal ({products.length}{" "}
                    {products.length === 1 ? "item" : "items"}): {subtotal} sats
                  </p>
                  <Button
                    className={`${NEO_BTN} w-full h-14 text-lg font-black tracking-widest md:w-1/2`}
                    onClick={toggleCheckout}
                    size="lg"
                  >
                    Proceed To Checkout
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex min-h-[60vh] flex-col items-center justify-center rounded-xl border border-zinc-800 bg-[#161616] py-16">
                <div className="mb-8 flex items-center justify-center rounded-full border border-zinc-700 bg-[#111] p-6">
                  <ShoppingBagIcon className="h-16 w-16 text-zinc-500" />
                </div>
                <h2 className="mb-2 text-center text-3xl font-black uppercase tracking-tighter text-white">
                  Your cart is empty . . .
                </h2>
                <p className="mb-6 max-w-md text-center text-zinc-400">
                  Go add some items to your cart!
                </p>
                <Button
                  className={`${NEO_BTN} h-12 px-8 text-sm font-black tracking-widest`}
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
        <div className="flex min-h-screen w-full bg-[#111] text-white sm:items-center sm:justify-center">
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
              base: "bg-[#161616] border border-zinc-800 rounded-2xl",
              body: "py-8",
              backdrop: "bg-black/80 backdrop-blur-sm",
              header: "border-b border-zinc-800 text-white",
              closeButton: "hover:bg-white/10 text-white",
            }}
            isDismissable={true}
            scrollBehavior={"normal"}
            placement={"center"}
            size="md"
          >
            <ModalContent>
              <ModalHeader className="flex items-center justify-center font-black uppercase tracking-tighter">
                <CheckCircleIcon className="h-6 w-6 text-green-500" />
                <div className="ml-2">Order successful!</div>
              </ModalHeader>
              <ModalBody className="flex flex-col overflow-hidden text-zinc-300 font-medium">
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
              base: "bg-[#161616] border border-zinc-800 rounded-2xl",
              body: "py-8",
              backdrop: "bg-black/80 backdrop-blur-sm",
              header: "border-b border-zinc-800 text-white",
              closeButton: "hover:bg-white/10 text-white",
            }}
            isDismissable={true}
            scrollBehavior={"normal"}
            placement={"center"}
            size="md"
          >
            <ModalContent>
              <ModalHeader className="flex items-center justify-center font-black uppercase tracking-tighter">
                <XCircleIcon className="h-6 w-6 text-red-500" />
                <div className="ml-2">Invoice generation failed!</div>
              </ModalHeader>
              <ModalBody className="flex flex-col overflow-hidden text-zinc-300 font-medium">
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
              base: "bg-[#161616] border border-zinc-800 rounded-2xl",
              body: "py-8",
              backdrop: "bg-black/80 backdrop-blur-sm",
              header: "border-b border-zinc-800 text-white",
              closeButton: "hover:bg-white/10 text-white",
            }}
            isDismissable={true}
            scrollBehavior={"normal"}
            placement={"center"}
            size="md"
          >
            <ModalContent>
              <ModalHeader className="flex items-center justify-center font-black uppercase tracking-tighter">
                <XCircleIcon className="h-6 w-6 text-red-500" />
                <div className="ml-2">Purchase failed!</div>
              </ModalHeader>
              <ModalBody className="flex flex-col overflow-hidden text-zinc-300 font-medium">
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
