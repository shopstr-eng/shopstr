"use client";

import { useEffect, useState, useContext } from "react";
import { useForm, Controller } from "react-hook-form";
import { nip19 } from "nostr-tools";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Input,
  Button,
} from "@nextui-org/react";
import {
  HandThumbUpIcon,
  HandThumbDownIcon,
} from "@heroicons/react/24/outline";
import {
  ChatsContext,
  ProductContext,
  ReviewsContext,
} from "../../utils/context/context";
import { NostrMessageEvent } from "../../utils/types/types";
import ShopstrSpinner from "../utility-components/shopstr-spinner";
import { ProfileWithDropdown } from "@/components/utility-components/profile/profile-dropdown";
import ClaimButton from "@/components/utility-components/claim-button";
import DisplayProductModal from "@/components/display-product-modal";
import parseTags, {
  ProductData,
} from "@/utils/parsers/product-parser-functions";
import {
  constructGiftWrappedEvent,
  constructMessageSeal,
  constructMessageGiftWrap,
  sendGiftWrappedMessageEvent,
  generateKeys,
  publishReviewEvent,
} from "@/utils/nostr/nostr-helper-functions";
import {
  NostrContext,
  SignerContext,
} from "@/components/utility-components/nostr-context-provider";
import { SHOPSTRBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";
import { calculateWeightedScore } from "@/utils/parsers/review-parser-functions";
import { fiat } from "@getalby/lightning-tools";
import currencySelection from "@/public/currencySelection.json";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { Line } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

interface OrderData {
  orderId: string;
  buyerPubkey: string;
  productAddress: string;
  amount: number;
  timestamp: number;
  status: string;
  messageEvent: NostrMessageEvent;
  address?: string;
  pickupLocation?: string;
  selectedSize?: string;
  selectedVolume?: string;
  selectedWeight?: string;
  selectedBulkOption?: number;
  paymentToken?: string;
  paymentMethod?: string;
  productTitle?: string;
  quantity?: number;
  paymentTag?: string;
  paymentProof?: string;
  subject?: string;
  reviewRating?: number;
  isSale?: boolean;
  currency?: string;
  donationAmount?: number;
  donationPercentage?: number;
}

const OrdersDashboard = () => {
  const chatsContext = useContext(ChatsContext);
  const productContext = useContext(ProductContext);
  const [orders, setOrders] = useState<OrderData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [totalOrders, setTotalOrders] = useState(0);
  const [cachedStatuses, setCachedStatuses] = useState<Record<string, string>>(
    {}
  );
  const [selectedProduct, setSelectedProduct] = useState<ProductData | null>(
    null
  );
  const [showProductModal, setShowProductModal] = useState(false);

  const [showShippingModal, setShowShippingModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<OrderData | null>(null);
  const [isSendingShipping, setIsSendingShipping] = useState(false);

  const [randomNpubForSender, setRandomNpubForSender] = useState<string>("");
  const [randomNsecForSender, setRandomNsecForSender] = useState<string>("");
  const [randomNpubForReceiver, setRandomNpubForReceiver] =
    useState<string>("");
  const [randomNsecForReceiver, setRandomNsecForReceiver] =
    useState<string>("");

  const [showReviewModal, setShowReviewModal] = useState(false);
  const [selectedThumb, setSelectedThumb] = useState<"up" | "down" | null>(
    null
  );
  const [reviewOptions, setReviewOptions] = useState<Map<string, number>>(
    new Map([
      ["value", 0],
      ["quality", 0],
      ["delivery", 0],
      ["communication", 0],
    ])
  );

  const [displayCurrency, setDisplayCurrency] = useState<"sats" | "USD">(
    "sats"
  );
  const [currencyRates, setCurrencyRates] = useState<Record<string, number>>(
    {}
  );

  const {
    signer,
    pubkey: userPubkey,
    npub: userNPub,
  } = useContext(SignerContext);
  const { nostr } = useContext(NostrContext);
  const reviewsContext = useContext(ReviewsContext);

  const {
    handleSubmit: handleShippingSubmit,
    control: shippingControl,
    reset: shippingReset,
  } = useForm({
    defaultValues: {
      "Delivery Time": "",
      "Shipping Carrier": "",
      "Tracking Number": "",
    },
  });

  const {
    handleSubmit: handleReviewSubmit,
    control: reviewControl,
    reset: reviewReset,
  } = useForm({
    defaultValues: {
      comment: "",
    },
  });

  useEffect(() => {
    const fetchKeys = async () => {
      const { nsec: nsecForSender, npub: npubForSender } = await generateKeys();
      setRandomNpubForSender(npubForSender);
      setRandomNsecForSender(nsecForSender);
      const { nsec: nsecForReceiver, npub: npubForReceiver } =
        await generateKeys();
      setRandomNpubForReceiver(npubForReceiver);
      setRandomNsecForReceiver(nsecForReceiver);
    };

    fetchKeys();
  }, []);

  useEffect(() => {
    const fetchCurrencyRates = async () => {
      const currenciesToFetch = [
        "USD",
        "EUR",
        "GBP",
        "CAD",
        "AUD",
        "JPY",
        "CNY",
        "INR",
        "CHF",
        "MXN",
        "BRL",
        "KRW",
        "SGD",
        "HKD",
        "NOK",
        "SEK",
        "DKK",
        "NZD",
        "ZAR",
        "RUB",
        "PLN",
        "THB",
        "PHP",
        "IDR",
        "MYR",
        "CZK",
        "ILS",
        "CLP",
        "ARS",
        "COP",
        "PEN",
        "VND",
      ];

      const ratePromises = currenciesToFetch.map(async (currency) => {
        try {
          const sats = await fiat.getSatoshiValue({ amount: 1, currency });
          return { currency: currency.toLowerCase(), rate: sats };
        } catch (err) {
          console.error(`Failed to fetch rate for ${currency}:`, err);
          return { currency: currency.toLowerCase(), rate: 0 };
        }
      });

      const results = await Promise.all(ratePromises);
      const rates: Record<string, number> = {};
      for (const { currency, rate } of results) {
        if (rate > 0) {
          rates[currency] = rate;
        }
      }

      setCurrencyRates(rates);
    };
    fetchCurrencyRates();
  }, []);

  useEffect(() => {
    if (!chatsContext || chatsContext.isLoading) return;
    chatsContext.markAllMessagesAsRead();
  }, [chatsContext?.isLoading]);

  useEffect(() => {
    async function loadCachedStatuses() {
      if (!chatsContext || chatsContext.isLoading) return;

      const orderIds: string[] = [];
      for (const entry of chatsContext.chatsMap) {
        const chat = entry[1] as NostrMessageEvent[];
        for (const messageEvent of chat) {
          const tagsMap = new Map(
            messageEvent.tags.map((tag: string[]) => [tag[0], tag[1]])
          );
          const subject = tagsMap.get("subject") || "";
          if (
            subject === "order-receipt" ||
            subject === "payment-confirmation" ||
            subject === "shipping-info" ||
            subject === "order-completed"
          ) {
            const orderId = tagsMap.get("order") || messageEvent.id;
            if (orderId && !orderIds.includes(orderId)) {
              orderIds.push(orderId);
            }
          }
        }
      }

      if (orderIds.length > 0) {
        try {
          const response = await fetch("/api/db/get-order-statuses", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderIds }),
          });
          if (response.ok) {
            const data = await response.json();
            setCachedStatuses(data.statuses || {});
          }
        } catch (err) {
          console.error("Failed to load cached statuses:", err);
        }
      }
    }

    loadCachedStatuses();
  }, [chatsContext?.isLoading, chatsContext?.chatsMap]);

  useEffect(() => {
    async function loadOrders() {
      if (!chatsContext || chatsContext.isLoading) {
        return;
      }

      const ordersList: OrderData[] = [];

      for (const entry of chatsContext.chatsMap) {
        const chat = entry[1] as NostrMessageEvent[];

        for (const messageEvent of chat) {
          const tagsMap = new Map(
            messageEvent.tags
              .filter((tag): tag is [string, string] => tag.length === 2)
              .map(([k, v]) => [k, v])
          );

          const subject = tagsMap.get("subject");

          if (
            subject === "order-payment" ||
            subject === "order-info" ||
            subject === "payment-change" ||
            subject === "order-receipt" ||
            subject === "shipping-info" ||
            subject === "order-completed" ||
            subject === "zapsnag-order"
          ) {
            const orderId = tagsMap.get("order") || messageEvent.id;
            const itemTag = messageEvent.tags.find((tag) => tag[0] === "item");
            const productAddress =
              tagsMap.get("a") || (itemTag ? itemTag[1] : "") || "";
            const quantity = itemTag && itemTag[2] ? parseInt(itemTag[2]) : 1;
            const amountStr = tagsMap.get("amount") || "0";
            const amount = parseFloat(amountStr);
            const status = tagsMap.get("status") || "pending";
            const buyerPubkey = tagsMap.get("b") || "";
            const address = tagsMap.get("address");
            const pickupLocation = tagsMap.get("pickup");
            const selectedSize = tagsMap.get("size");
            const selectedVolume = tagsMap.get("volume");
            const selectedWeight = tagsMap.get("weight");
            const bulkTag = messageEvent.tags.find((tag) => tag[0] === "bulk");
            const selectedBulkOption =
              bulkTag && bulkTag[1] ? parseInt(bulkTag[1]) : undefined;

            const donationTagArray = messageEvent.tags.find(
              (tag) => tag[0] === "donation_amount"
            );
            const donationAmount =
              donationTagArray && donationTagArray[1]
                ? parseFloat(donationTagArray[1])
                : undefined;
            const donationPercentage =
              donationTagArray && donationTagArray[2]
                ? parseFloat(donationTagArray[2])
                : undefined;

            const paymentTagArray = messageEvent.tags.find(
              (tag) => tag[0] === "payment"
            );
            const paymentType =
              paymentTagArray && paymentTagArray[1] ? paymentTagArray[1] : "";
            const paymentReference =
              paymentTagArray && paymentTagArray[2] ? paymentTagArray[2] : "";
            const paymentProofValue =
              paymentTagArray && paymentTagArray[3] ? paymentTagArray[3] : "";

            let paymentToken: string | undefined;
            if (paymentType === "ecash") {
              paymentToken = paymentProofValue || paymentReference;
            }
            const paymentTag = paymentType || "";
            const paymentProof = paymentProofValue;

            let productTitle = "Unknown Product";
            let isSale = false;
            let productCurrency = "sats";
            let productPrice = 0;
            const addressParts = productAddress.split(":");
            const merchantPubkey =
              addressParts.length >= 2 ? addressParts[1] : null;
            if (merchantPubkey && merchantPubkey === userPubkey) {
              isSale = true;
            }
            if (productAddress && productContext?.productEvents) {
              const productEvent = productContext.productEvents.find(
                (event: any) => {
                  const eventAddress = `30402:${event.pubkey}:${event.tags.find(
                    (tag: any) => tag[0] === "d"
                  )?.[1]}`;
                  return productAddress.includes(eventAddress);
                }
              );
              if (productEvent) {
                const productData = parseTags(productEvent);
                productTitle = productData?.title || "Unknown Product";
                productCurrency = productData?.currency || "sats";
                productPrice = productData?.price || 0;
              }
            }
            const finalAmount = amount > 0 ? amount : productPrice * quantity;

            let paymentMethod = "Not specified";
            if (paymentType) {
              switch (paymentType.toLowerCase()) {
                case "ecash":
                  paymentMethod = "Cashu";
                  break;
                case "lightning":
                  paymentMethod = "Lightning";
                  break;
                case "cashapp":
                case "cash app":
                  paymentMethod = "CashApp";
                  break;
                case "venmo":
                  paymentMethod = "Venmo";
                  break;
                case "zelle":
                  paymentMethod = "Zelle";
                  break;
                case "paypal":
                  paymentMethod = "PayPal";
                  break;
                case "applepay":
                case "apple pay":
                  paymentMethod = "Apple Pay";
                  break;
                case "cash":
                  paymentMethod = "Cash";
                  break;
                default:
                  paymentMethod =
                    paymentType.charAt(0).toUpperCase() + paymentType.slice(1);
              }
            } else if (messageEvent.content) {
              const content = messageEvent.content.toLowerCase();
              if (content.includes("cashapp") || content.includes("cash app")) {
                paymentMethod = "CashApp";
              } else if (
                content.includes("lightning") ||
                content.includes("lnurl")
              ) {
                paymentMethod = "Lightning";
              } else if (
                content.includes("cashu") ||
                content.includes("ecash")
              ) {
                paymentMethod = "Cashu";
              } else if (content.includes("cash")) {
                paymentMethod = "Cash";
              } else if (content.includes("venmo")) {
                paymentMethod = "Venmo";
              } else if (content.includes("paypal")) {
                paymentMethod = "PayPal";
              }
            }

            ordersList.push({
              orderId,
              buyerPubkey,
              productAddress,
              amount: finalAmount,
              timestamp: messageEvent.created_at,
              status,
              messageEvent,
              address,
              pickupLocation,
              selectedSize,
              selectedVolume,
              selectedWeight,
              selectedBulkOption,
              paymentToken,
              paymentMethod,
              productTitle,
              quantity,
              paymentTag,
              paymentProof,
              subject,
              isSale,
              currency: productCurrency,
              donationAmount,
              donationPercentage,
            });
          }
        }
      }

      const consolidatedOrdersMap = new Map<string, OrderData>();

      for (const order of ordersList) {
        const existing = consolidatedOrdersMap.get(order.orderId);

        if (!existing) {
          const cachedStatus = cachedStatuses[order.orderId];
          const statusPriorityInit: Record<string, number> = {
            canceled: 5,
            completed: 4,
            shipped: 3,
            confirmed: 2,
            pending: 1,
          };
          const cachedPriority = cachedStatus
            ? statusPriorityInit[cachedStatus] || 0
            : 0;
          const orderPriority = statusPriorityInit[order.status] || 0;
          consolidatedOrdersMap.set(order.orderId, {
            ...order,
            status:
              cachedPriority > orderPriority && cachedStatus
                ? cachedStatus
                : order.status,
          });
        } else {
          const statusPriority: Record<string, number> = {
            canceled: 5,
            completed: 4,
            shipped: 3,
            confirmed: 2,
            pending: 1,
          };
          const existingPriority = statusPriority[existing.status] || 0;
          const newPriority = statusPriority[order.status] || 0;
          const cachedStatus = cachedStatuses[order.orderId];
          const cachedPriority = cachedStatus
            ? statusPriority[cachedStatus] || 0
            : 0;

          let finalStatus =
            newPriority > existingPriority ? order.status : existing.status;
          if (
            cachedStatus &&
            cachedPriority > (statusPriority[finalStatus] || 0)
          ) {
            finalStatus = cachedStatus;
          }

          consolidatedOrdersMap.set(order.orderId, {
            ...existing,
            status: finalStatus,
            address: order.address || existing.address,
            pickupLocation: order.pickupLocation || existing.pickupLocation,
            selectedSize: order.selectedSize || existing.selectedSize,
            selectedVolume: order.selectedVolume || existing.selectedVolume,
            selectedWeight: order.selectedWeight || existing.selectedWeight,
            selectedBulkOption:
              order.selectedBulkOption || existing.selectedBulkOption,
            paymentToken: order.paymentToken || existing.paymentToken,
            paymentMethod:
              order.paymentMethod !== "Not specified"
                ? order.paymentMethod
                : existing.paymentMethod,
            productTitle:
              order.productTitle !== "Unknown Product"
                ? order.productTitle
                : existing.productTitle,
            productAddress: order.productAddress || existing.productAddress,
            quantity: order.quantity || existing.quantity,
            amount: order.amount || existing.amount,
            timestamp: Math.max(order.timestamp, existing.timestamp),
            subject:
              order.subject === "order-receipt"
                ? order.subject
                : existing.subject === "order-receipt"
                  ? existing.subject
                  : order.subject,
            messageEvent:
              order.timestamp > existing.timestamp
                ? order.messageEvent
                : existing.messageEvent,
            isSale: order.isSale ?? existing.isSale,
            currency: order.currency || existing.currency,
            donationAmount: order.donationAmount ?? existing.donationAmount,
            donationPercentage:
              order.donationPercentage ?? existing.donationPercentage,
          });
        }
      }

      const consolidatedOrders = Array.from(consolidatedOrdersMap.values());
      consolidatedOrders.sort((a, b) => b.timestamp - a.timestamp);

      setOrders(consolidatedOrders);
      setTotalOrders(consolidatedOrders.length);
      setIsLoading(false);

      const statusPriorityForPersist: Record<string, number> = {
        canceled: 5,
        completed: 4,
        shipped: 3,
        confirmed: 2,
        pending: 1,
      };
      for (const order of consolidatedOrders) {
        if (order.status && order.orderId) {
          const currentPriority = statusPriorityForPersist[order.status] || 0;
          const cachedStatusValue = cachedStatuses[order.orderId];
          const cachedPriority = cachedStatusValue
            ? statusPriorityForPersist[cachedStatusValue] || 0
            : 0;
          if (currentPriority > cachedPriority) {
            fetch("/api/db/update-order-status", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                orderId: order.orderId,
                status: order.status,
                messageId: order.messageEvent?.id,
              }),
            }).catch((err) =>
              console.error("Failed to save order status:", err)
            );
          }
        }
      }
    }

    loadOrders();
  }, [chatsContext, productContext, cachedStatuses]);

  const convertToSats = (amount: number, currency: string): number => {
    const curr = currency?.toLowerCase() || "sats";
    if (curr === "sats" || curr === "sat" || curr === "satoshi") return amount;
    if (curr === "btc") return Math.round(amount * 100000000);

    const upperCurrency = currency.toUpperCase();
    if (!currencySelection.hasOwnProperty(upperCurrency)) {
      return amount;
    }

    const rate = currencyRates[curr];
    if (rate && rate > 0) {
      return Math.round(amount * rate);
    }
    return amount;
  };

  const convertToUSD = (amount: number, currency: string): number => {
    const usdRate = currencyRates["usd"];
    if (!usdRate || usdRate === 0) return amount;

    const curr = currency?.toLowerCase() || "sats";
    if (curr === "usd") return amount;
    if (curr === "sats" || curr === "sat" || curr === "satoshi") {
      return amount / usdRate;
    }
    if (curr === "btc") return (amount * 100000000) / usdRate;

    const upperCurrency = currency.toUpperCase();
    if (!currencySelection.hasOwnProperty(upperCurrency)) {
      return amount;
    }

    const currRate = currencyRates[curr];
    if (currRate && currRate > 0) {
      const sats = amount * currRate;
      return sats / usdRate;
    }
    return amount;
  };

  const getConvertedAmount = (amount: number, currency: string): number => {
    if (displayCurrency === "sats") {
      return convertToSats(amount, currency);
    } else {
      return convertToUSD(amount, currency);
    }
  };

  const getDisplayedGMV = (): number => {
    return orders.reduce((sum, order) => {
      return sum + getConvertedAmount(order.amount, order.currency || "sats");
    }, 0);
  };

  const getDisplayedAverage = (): number => {
    const gmv = getDisplayedGMV();
    return orders.length > 0 ? gmv / orders.length : 0;
  };

  const getChartData = () => {
    const valueByDate: { [key: string]: number } = {};

    orders.forEach((order) => {
      const date = new Date(order.timestamp * 1000).toLocaleDateString();
      const convertedAmount = getConvertedAmount(
        order.amount,
        order.currency || "sats"
      );
      valueByDate[date] = (valueByDate[date] || 0) + convertedAmount;
    });

    const sortedDates = Object.keys(valueByDate).sort(
      (a, b) => new Date(a).getTime() - new Date(b).getTime()
    );

    return {
      labels: sortedDates,
      datasets: [
        {
          label: displayCurrency === "sats" ? "Satoshi Value" : "USD Value",
          data: sortedDates.map((date) => valueByDate[date]),
          borderColor: "rgb(147, 51, 234)",
          backgroundColor: "rgba(147, 51, 234, 0.5)",
          tension: 0.3,
        },
      ],
    };
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "top" as const,
      },
      title: {
        display: true,
        text:
          displayCurrency === "sats"
            ? "Total Satoshi Value Over Time"
            : "Total USD Value Over Time",
      },
    },
  };

  const handleProductClick = (productAddress: string) => {
    if (!productContext?.productEvents) return;

    const productEvent = productContext.productEvents.find((event: any) => {
      const eventAddress = `30402:${event.pubkey}:${event.tags.find(
        (tag: any) => tag[0] === "d"
      )?.[1]}`;
      return productAddress.includes(eventAddress);
    });

    if (productEvent) {
      const productData = parseTags(productEvent);
      if (productData) {
        setSelectedProduct(productData);
        setShowProductModal(true);
      }
    }
  };

  const handleModalToggle = () => {
    setShowProductModal(!showProductModal);
  };

  const handleDelete = () => {
    setShowProductModal(false);
  };

  const handleOpenShippingModal = (order: OrderData) => {
    setSelectedOrder(order);
    shippingReset();
    setShowShippingModal(true);
  };

  const handleCloseShippingModal = () => {
    setShowShippingModal(false);
    setSelectedOrder(null);
    shippingReset();
  };

  const onShippingSubmit = async (data: { [x: string]: string }) => {
    if (!selectedOrder || !signer || !nostr) return;

    setIsSendingShipping(true);

    try {
      const decodedRandomPubkeyForSender = nip19.decode(randomNpubForSender);
      const decodedRandomPrivkeyForSender = nip19.decode(randomNsecForSender);
      const decodedRandomPubkeyForReceiver = nip19.decode(
        randomNpubForReceiver
      );
      const decodedRandomPrivkeyForReceiver = nip19.decode(
        randomNsecForReceiver
      );

      const daysToAdd = parseInt(data["Delivery Time"]!);
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const futureTimestamp = currentTimestamp + daysToAdd * 24 * 60 * 60;

      const humanReadableDate = new Date(
        futureTimestamp * 1000
      ).toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });

      const shippingCarrier = data["Shipping Carrier"];
      const trackingNumber = data["Tracking Number"];
      const message =
        "Your order from " +
        userNPub +
        " is expected to arrive on " +
        humanReadableDate +
        ". Your " +
        shippingCarrier +
        " tracking number is: " +
        trackingNumber;

      const giftWrappedMessageEvent = await constructGiftWrappedEvent(
        decodedRandomPubkeyForSender.data as string,
        selectedOrder.buyerPubkey,
        message,
        "shipping-info",
        {
          productAddress: selectedOrder.productAddress,
          type: 4, // Shipping update type
          status: "shipped",
          isOrder: true,
          orderId: selectedOrder.orderId,
          tracking: trackingNumber,
          carrier: shippingCarrier,
          eta: futureTimestamp,
          buyerPubkey: selectedOrder.buyerPubkey,
        }
      );

      const sealedEvent = await constructMessageSeal(
        signer,
        giftWrappedMessageEvent,
        decodedRandomPubkeyForSender.data as string,
        selectedOrder.buyerPubkey,
        decodedRandomPrivkeyForSender.data as Uint8Array
      );

      const giftWrappedEvent = await constructMessageGiftWrap(
        sealedEvent,
        decodedRandomPubkeyForReceiver.data as string,
        decodedRandomPrivkeyForReceiver.data as Uint8Array,
        selectedOrder.buyerPubkey
      );

      await sendGiftWrappedMessageEvent(nostr, giftWrappedEvent);

      // Update local state to shipped status (removes Send Shipping Update button)
      setOrders((prevOrders) =>
        prevOrders.map((order) =>
          order.orderId === selectedOrder.orderId
            ? { ...order, status: "shipped" }
            : order
        )
      );

      // Persist status to database
      fetch("/api/db/update-order-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: selectedOrder.orderId,
          status: "shipped",
        }),
      }).catch((err) =>
        console.error("Failed to persist shipped status:", err)
      );

      handleCloseShippingModal();
    } catch (error) {
      console.error("Error sending shipping info:", error);
    } finally {
      setIsSendingShipping(false);
    }
  };

  const handleOpenReviewModal = (order: OrderData) => {
    setSelectedOrder(order);
    setSelectedThumb(null);
    setReviewOptions(
      new Map([
        ["value", 0],
        ["quality", 0],
        ["delivery", 0],
        ["communication", 0],
      ])
    );
    reviewReset();
    setShowReviewModal(true);
  };

  const handleCloseReviewModal = () => {
    setShowReviewModal(false);
    setSelectedOrder(null);
    setSelectedThumb(null);
    reviewReset();
  };

  const onReviewSubmit = async (data: { [x: string]: string }) => {
    if (!selectedOrder || !signer || !nostr || !selectedThumb) return;

    try {
      const productAddress = selectedOrder.productAddress;
      if (!productAddress || !productAddress.includes(":")) {
        console.error("Invalid product address for review");
        return;
      }

      const addressParts = productAddress.split(":");
      if (addressParts.length < 3) {
        console.error("Malformed product address for review");
        return;
      }

      const merchantPubkey = addressParts[1];
      const dTag = addressParts[2];

      if (!merchantPubkey || !dTag) {
        console.error("Missing merchant pubkey or dTag for review");
        return;
      }

      // Prevent sellers from reviewing their own products
      if (merchantPubkey === userPubkey) {
        console.error("Sellers cannot review their own products");
        return;
      }

      const eventTags = [
        ["d", `a:${productAddress}`],
        ["rating", (selectedThumb === "up" ? 1 : 0).toString(), "thumb"],
      ];
      reviewOptions.forEach((value, key) => {
        eventTags.push(["rating", value.toString(), key]);
      });
      const productReviewsData = new Map<string, string[][]>();
      productReviewsData.set(userPubkey!, eventTags);
      await publishReviewEvent(nostr, signer, data.comment!, eventTags);
      reviewsContext.updateProductReviewsData(
        merchantPubkey,
        dTag,
        productReviewsData
      );
      const merchantScoresMap = reviewsContext.merchantReviewsData;
      if (!merchantScoresMap.has(merchantPubkey)) {
        merchantScoresMap.set(merchantPubkey, []);
      }
      merchantScoresMap
        .get(merchantPubkey)!
        .push(calculateWeightedScore(eventTags));
      reviewsContext.updateMerchantReviewsData(
        merchantPubkey,
        merchantScoresMap.get(merchantPubkey) || [
          calculateWeightedScore(eventTags),
        ]
      );

      const rating = calculateWeightedScore(eventTags);
      setOrders((prevOrders) =>
        prevOrders.map((order) =>
          order.orderId === selectedOrder.orderId
            ? { ...order, reviewRating: rating }
            : order
        )
      );

      handleCloseReviewModal();
    } catch (error) {
      console.error("Error submitting review:", error);
    }
  };

  const canShowReviewButton = (order: OrderData) => {
    if (!order.productAddress || !order.productAddress.includes(":")) {
      return false;
    }

    // Extract merchant pubkey from product address (format: 30402:merchantPubkey:dTag)
    const addressParts = order.productAddress.split(":");
    const merchantPubkey = addressParts.length >= 2 ? addressParts[1] : null;

    // Prevent sellers from reviewing their own products
    if (merchantPubkey && merchantPubkey === userPubkey) {
      return false;
    }

    return (
      order.status === "completed" ||
      order.status === "shipped" ||
      order.subject === "shipping-info" ||
      order.subject === "order-receipt"
    );
  };

  if (isLoading || !chatsContext || chatsContext.isLoading) {
    return (
      <div className="flex h-[66vh] items-center justify-center">
        <ShopstrSpinner />
      </div>
    );
  }

  return (
    <div className="min-w-0 max-w-[98vw] bg-light-bg px-4 py-4 dark:bg-dark-bg sm:py-6">
      <div className="mx-auto w-full min-w-0 max-w-full">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-3xl font-bold text-light-text dark:text-dark-text">
            Orders Dashboard
          </h1>
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Currency Displayed:
            </span>
            <div className="inline-flex rounded-lg bg-gray-100 p-1 dark:bg-gray-700">
              <button
                onClick={() => setDisplayCurrency("sats")}
                className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                  displayCurrency === "sats"
                    ? "bg-purple-600 text-white shadow-sm"
                    : "text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
                }`}
              >
                sats
              </button>
              <button
                onClick={() => setDisplayCurrency("USD")}
                className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                  displayCurrency === "USD"
                    ? "bg-purple-600 text-white shadow-sm"
                    : "text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
                }`}
              >
                USD
              </button>
            </div>
          </div>
        </div>

        <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-3">
          <div className="rounded-lg bg-white p-6 shadow-md dark:bg-gray-800">
            <h3 className="mb-2 text-sm font-medium text-gray-600 dark:text-gray-400">
              Total Orders
            </h3>
            <p className="text-3xl font-bold text-light-text dark:text-dark-text">
              {totalOrders}
            </p>
          </div>

          <div className="rounded-lg bg-white p-6 shadow-md dark:bg-gray-800">
            <h3 className="mb-2 text-sm font-medium text-gray-600 dark:text-gray-400">
              Total GMV
            </h3>
            <p className="text-3xl font-bold text-light-text dark:text-dark-text">
              {displayCurrency === "sats"
                ? `${getDisplayedGMV().toLocaleString()} sats`
                : `$${getDisplayedGMV().toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}`}
            </p>
          </div>

          <div className="rounded-lg bg-white p-6 shadow-md dark:bg-gray-800">
            <h3 className="mb-2 text-sm font-medium text-gray-600 dark:text-gray-400">
              Average Order Size
            </h3>
            <p className="text-3xl font-bold text-light-text dark:text-dark-text">
              {displayCurrency === "sats"
                ? `${getDisplayedAverage().toFixed(0)} sats`
                : `$${getDisplayedAverage().toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}`}
            </p>
          </div>
        </div>

        {orders.length > 0 && (
          <div className="mb-8 rounded-lg bg-white p-6 shadow-md dark:bg-gray-800">
            <div style={{ height: "300px" }}>
              <Line options={chartOptions} data={getChartData()} />
            </div>
          </div>
        )}

        <div className="w-full overflow-hidden rounded-lg shadow-md">
          <div className="max-h-[70vh] overflow-x-auto">
            <table className="min-w-full text-left text-sm text-gray-500 dark:text-gray-400">
              <thead className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-600 dark:text-gray-400">
                    Order ID
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-600 dark:text-gray-400">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-600 dark:text-gray-400">
                    Buyer/Seller
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-600 dark:text-gray-400">
                    Amount
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-600 dark:text-gray-400">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-600 dark:text-gray-400">
                    Date
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-600 dark:text-gray-400">
                    Address
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-600 dark:text-gray-400">
                    Pickup Location
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-600 dark:text-gray-400">
                    Order Specs
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-600 dark:text-gray-400">
                    Payment
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-600 dark:text-gray-400">
                    Product
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-600 dark:text-gray-400">
                    Donation Amount
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {orders.length === 0 ? (
                  <tr>
                    <td
                      colSpan={13}
                      className="px-6 py-4 text-center text-gray-500 dark:text-gray-400"
                    >
                      No orders yet
                    </td>
                  </tr>
                ) : (
                  orders.map((order) => {
                    const isNewOrder = chatsContext.newOrderIds.has(
                      order.messageEvent.id
                    );
                    return (
                      <tr
                        key={order.orderId}
                        className={`hover:bg-gray-50 dark:hover:bg-gray-700 ${
                          isNewOrder
                            ? "border-l-4 border-l-shopstr-purple dark:border-l-shopstr-yellow"
                            : ""
                        }`}
                      >
                        <td className="whitespace-nowrap px-4 py-4 text-sm text-light-text dark:text-dark-text">
                          <div className="flex flex-col gap-1">
                            <span>{order.orderId.substring(0, 8)}...</span>
                            {order.reviewRating !== undefined ? (
                              <span className="text-xs text-shopstr-purple-light underline dark:text-shopstr-yellow-light">
                                Rating: {order.reviewRating.toFixed(1)}
                              </span>
                            ) : canShowReviewButton(order) ? (
                              <button
                                onClick={() => handleOpenReviewModal(order)}
                                className="cursor-pointer text-left text-xs text-shopstr-purple-light underline hover:text-shopstr-purple dark:text-shopstr-yellow-light dark:hover:text-shopstr-yellow"
                              >
                                Leave Review
                              </button>
                            ) : null}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 text-sm">
                          <span
                            className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                              order.isSale
                                ? "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200"
                                : "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200"
                            }`}
                          >
                            {order.isSale ? "Sale" : "Purchase"}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-sm">
                          {(() => {
                            const displayPubkey = order.isSale
                              ? order.buyerPubkey
                              : order.productAddress.split(":")[1] ||
                                order.buyerPubkey;
                            return displayPubkey ? (
                              <ProfileWithDropdown
                                pubkey={displayPubkey}
                                dropDownKeys={["shop", "inquiry", "copy_npub"]}
                                nameClassname="block"
                              />
                            ) : (
                              <span className="text-gray-500 dark:text-gray-400">
                                Not available
                              </span>
                            );
                          })()}
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 text-sm text-light-text dark:text-dark-text">
                          {order.amount > 0
                            ? displayCurrency === "sats"
                              ? `${getConvertedAmount(
                                  order.amount,
                                  order.currency || "sats"
                                ).toLocaleString()} sats`
                              : `$${getConvertedAmount(
                                  order.amount,
                                  order.currency || "sats"
                                ).toLocaleString(undefined, {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}`
                            : "N/A"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 text-sm">
                          <div className="flex flex-col gap-1">
                            <span
                              className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                                order.status === "completed"
                                  ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                                  : order.status === "shipped"
                                    ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                                    : order.status === "pending"
                                      ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                                      : "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200"
                              }`}
                            >
                              {order.status}
                            </span>
                            {order.status === "pending" && (
                              <button
                                onClick={() => handleOpenShippingModal(order)}
                                className="cursor-pointer text-left text-xs text-shopstr-purple-light underline hover:text-shopstr-purple dark:text-shopstr-yellow-light dark:hover:text-shopstr-yellow"
                              >
                                Send Shipping Update
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 text-sm text-light-text dark:text-dark-text">
                          {new Date(
                            order.timestamp * 1000
                          ).toLocaleDateString()}
                        </td>
                        <td className="max-w-xs px-4 py-4 text-sm text-light-text dark:text-dark-text">
                          <div
                            className="truncate"
                            title={order.address || "N/A"}
                          >
                            {order.address || "N/A"}
                          </div>
                        </td>
                        <td className="max-w-xs px-4 py-4 text-sm text-light-text dark:text-dark-text">
                          <div
                            className="truncate"
                            title={order.pickupLocation || "N/A"}
                          >
                            {order.pickupLocation || "N/A"}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 text-sm text-light-text dark:text-dark-text">
                          {(() => {
                            const specs = [];
                            if (order.selectedSize)
                              specs.push(`Size: ${order.selectedSize}`);
                            if (order.selectedVolume)
                              specs.push(`Volume: ${order.selectedVolume}`);
                            if (order.selectedWeight)
                              specs.push(`Weight: ${order.selectedWeight}`);
                            if (order.selectedBulkOption)
                              specs.push(
                                `Bundle: ${order.selectedBulkOption} units`
                              );
                            return specs.length > 0 ? specs.join(", ") : "N/A";
                          })()}
                        </td>
                        <td className="px-4 py-4 text-sm">
                          {order.subject === "order-receipt" ? (
                            <span className="text-green-600 dark:text-green-400">
                              Payment Sent
                            </span>
                          ) : order.paymentToken ? (
                            <ClaimButton token={order.paymentToken} />
                          ) : (
                            <span className="text-gray-600 dark:text-gray-400">
                              {order.paymentMethod}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-sm text-light-text dark:text-dark-text">
                          {order.productAddress ? (
                            <button
                              onClick={() =>
                                handleProductClick(order.productAddress)
                              }
                              className="cursor-pointer text-left underline hover:text-purple-600 dark:hover:text-purple-400"
                            >
                              {order.productTitle} x{" "}
                              {order.selectedBulkOption || order.quantity || 1}
                            </button>
                          ) : (
                            "N/A"
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 text-sm text-light-text dark:text-dark-text">
                          {order.donationAmount !== undefined &&
                          order.donationAmount > 0
                            ? displayCurrency === "sats"
                              ? `${getConvertedAmount(
                                  order.donationAmount,
                                  order.currency || "sats"
                                ).toLocaleString()} sats${
                                  order.donationPercentage !== undefined
                                    ? ` (${order.donationPercentage}%)`
                                    : ""
                                }`
                              : `$${getConvertedAmount(
                                  order.donationAmount,
                                  order.currency || "sats"
                                ).toLocaleString(undefined, {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}${
                                  order.donationPercentage !== undefined
                                    ? ` (${order.donationPercentage}%)`
                                    : ""
                                }`
                            : "N/A"}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {selectedProduct && (
        <DisplayProductModal
          productData={selectedProduct}
          showModal={showProductModal}
          handleModalToggle={handleModalToggle}
          handleDelete={handleDelete}
        />
      )}
      <Modal
        backdrop="blur"
        isOpen={showShippingModal}
        onClose={handleCloseShippingModal}
        classNames={{
          body: "py-6",
          backdrop: "bg-[#292f46]/50 backdrop-opacity-60",
          header: "border-b-[1px] border-[#292f46]",
          footer: "border-t-[1px] border-[#292f46]",
          closeButton: "hover:bg-black/5 active:bg-white/10",
        }}
        scrollBehavior={"outside"}
        size="2xl"
      >
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1 text-light-text dark:text-dark-text">
            Enter Shipping Details
          </ModalHeader>
          <form onSubmit={handleShippingSubmit(onShippingSubmit)}>
            <ModalBody>
              <Controller
                name="Delivery Time"
                control={shippingControl}
                rules={{
                  required: "Expected delivery time is required.",
                }}
                render={({
                  field: { onChange, onBlur, value },
                  fieldState: { error },
                }) => {
                  const isErrored = error !== undefined;
                  const errorMessage: string = error?.message
                    ? error.message
                    : "";
                  return (
                    <Input
                      autoFocus
                      label="Expected Delivery Time (days)"
                      placeholder="e.g. 3"
                      variant="bordered"
                      isInvalid={isErrored}
                      errorMessage={errorMessage}
                      className="text-light-text dark:text-dark-text"
                      type="number"
                      onChange={onChange}
                      onBlur={onBlur}
                      value={value}
                    />
                  );
                }}
              />
              <Controller
                name="Shipping Carrier"
                control={shippingControl}
                rules={{
                  required: "A shipping carrier is required.",
                }}
                render={({
                  field: { onChange, onBlur, value },
                  fieldState: { error },
                }) => {
                  const isErrored = error !== undefined;
                  const errorMessage: string = error?.message
                    ? error.message
                    : "";
                  return (
                    <Input
                      label="Shipping Carrier"
                      variant="bordered"
                      placeholder="Fedex, UPS, etc."
                      isInvalid={isErrored}
                      errorMessage={errorMessage}
                      className="text-light-text dark:text-dark-text"
                      onChange={onChange}
                      onBlur={onBlur}
                      value={value}
                    />
                  );
                }}
              />
              <Controller
                name="Tracking Number"
                control={shippingControl}
                rules={{
                  required: "A tracking number is required.",
                  minLength: {
                    value: 5,
                    message: "Tracking number must be at least 5 characters.",
                  },
                }}
                render={({
                  field: { onChange, onBlur, value },
                  fieldState: { error },
                }) => {
                  const isErrored = error !== undefined;
                  const errorMessage: string = error?.message
                    ? error.message
                    : "";
                  return (
                    <Input
                      label="Tracking Number"
                      variant="bordered"
                      isInvalid={isErrored}
                      errorMessage={errorMessage}
                      className="text-light-text dark:text-dark-text"
                      onChange={onChange}
                      onBlur={onBlur}
                      value={value}
                    />
                  );
                }}
              />
            </ModalBody>
            <ModalFooter>
              <Button
                color="danger"
                variant="light"
                onClick={handleCloseShippingModal}
              >
                Cancel
              </Button>
              <Button
                className={SHOPSTRBUTTONCLASSNAMES}
                type="submit"
                isLoading={isSendingShipping}
              >
                Confirm Shipping
              </Button>
            </ModalFooter>
          </form>
        </ModalContent>
      </Modal>
      <Modal
        backdrop="blur"
        isOpen={showReviewModal}
        onClose={handleCloseReviewModal}
        classNames={{
          body: "py-6",
          backdrop: "bg-[#292f46]/50 backdrop-opacity-60",
          header: "border-b-[1px] border-[#292f46]",
          footer: "border-t-[1px] border-[#292f46]",
          closeButton: "hover:bg-black/5 active:bg-white/10",
        }}
        scrollBehavior={"outside"}
        size="2xl"
      >
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1 text-light-text dark:text-dark-text">
            Leave a Review
          </ModalHeader>
          <form onSubmit={handleReviewSubmit(onReviewSubmit)}>
            <ModalBody>
              <div className="mb-4 flex items-center justify-center gap-16">
                <div className="flex items-center gap-3">
                  <span className="text-light-text dark:text-dark-text">
                    Good Overall
                  </span>
                  <HandThumbUpIcon
                    className={`h-12 w-12 cursor-pointer rounded-lg border-2 p-2 transition-colors ${
                      selectedThumb === "up"
                        ? "border-green-500 text-green-500"
                        : "border-light-text text-light-text hover:border-green-500 hover:text-green-500 dark:border-dark-text dark:text-dark-text"
                    }`}
                    onClick={() => setSelectedThumb("up")}
                  />
                </div>
                <div className="flex items-center gap-3">
                  <HandThumbDownIcon
                    className={`h-12 w-12 cursor-pointer rounded-lg border-2 p-2 transition-colors ${
                      selectedThumb === "down"
                        ? "border-red-500 text-red-500"
                        : "border-light-text text-light-text hover:border-red-500 hover:text-red-500 dark:border-dark-text dark:text-dark-text"
                    }`}
                    onClick={() => setSelectedThumb("down")}
                  />
                  <span className="text-light-text dark:text-dark-text">
                    Bad Overall
                  </span>
                </div>
              </div>

              <div className="mb-4 flex flex-col gap-3">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={reviewOptions.get("value") === 1}
                    onChange={(e) =>
                      setReviewOptions((prev) => {
                        const newMap = new Map(prev);
                        newMap.set("value", e.target.checked ? 1 : 0);
                        return newMap;
                      })
                    }
                  />
                  <span className="text-light-text dark:text-dark-text">
                    Good Value
                  </span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={reviewOptions.get("quality") === 1}
                    onChange={(e) =>
                      setReviewOptions((prev) => {
                        const newMap = new Map(prev);
                        newMap.set("quality", e.target.checked ? 1 : 0);
                        return newMap;
                      })
                    }
                  />
                  <span className="text-light-text dark:text-dark-text">
                    Good Quality
                  </span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={reviewOptions.get("delivery") === 1}
                    onChange={(e) =>
                      setReviewOptions((prev) => {
                        const newMap = new Map(prev);
                        newMap.set("delivery", e.target.checked ? 1 : 0);
                        return newMap;
                      })
                    }
                  />
                  <span className="text-light-text dark:text-dark-text">
                    Quick Delivery
                  </span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={reviewOptions.get("communication") === 1}
                    onChange={(e) =>
                      setReviewOptions((prev) => {
                        const newMap = new Map(prev);
                        newMap.set("communication", e.target.checked ? 1 : 0);
                        return newMap;
                      })
                    }
                  />
                  <span className="text-light-text dark:text-dark-text">
                    Good Communication
                  </span>
                </label>
              </div>

              <Controller
                name="comment"
                control={reviewControl}
                rules={{ required: "A comment is required." }}
                render={({ field, fieldState: { error } }) => (
                  <div>
                    <textarea
                      {...field}
                      className="w-full rounded-md border-2 border-light-fg bg-light-bg p-2 text-light-text dark:border-dark-fg dark:bg-dark-bg dark:text-dark-text"
                      rows={4}
                      placeholder="Write your review comment here..."
                    />
                    {error && <p className="text-red-500">{error.message}</p>}
                  </div>
                )}
              />
            </ModalBody>
            <ModalFooter>
              <Button
                color="danger"
                variant="light"
                onClick={handleCloseReviewModal}
              >
                Cancel
              </Button>
              <Button
                className={SHOPSTRBUTTONCLASSNAMES}
                type="submit"
                isDisabled={!selectedThumb}
              >
                Leave Review
              </Button>
            </ModalFooter>
          </form>
        </ModalContent>
      </Modal>
    </div>
  );
};

export default OrdersDashboard;
