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
} from "@heroui/react";
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
import MilkMarketSpinner from "../utility-components/mm-spinner";
import { ProfileWithDropdown } from "@/components/utility-components/profile/profile-dropdown";
import ClaimButton from "@/components/utility-components/claim-button";
import DisplayProductModal from "@/components/display-product-modal";
import parseTags, {
  ProductData,
} from "@/utils/parsers/product-parser-functions";
import {
  buildOrderGroupingKey,
  getOrderConsolidationKey,
  getOrderStatusLookupKeys,
  registerTaggedOrderGroupingKey,
  resolveExplicitPaymentMethod,
} from "@/utils/messages/order-message-utils";
import {
  constructGiftWrappedEvent,
  constructMessageSeal,
  constructMessageGiftWrap,
  sendGiftWrappedMessageEvent,
  generateKeys,
  publishReviewEvent,
  blossomUpload,
  getLocalStorageData,
} from "@/utils/nostr/nostr-helper-functions";
import { viewEncryptedAgreement } from "@/utils/encryption/agreement-viewer";
import { encryptFileWithNip44 } from "@/utils/encryption/file-encryption";
import PDFAnnotator from "@/components/utility-components/pdf-annotator";
import FailureModal from "@/components/utility-components/failure-modal";
import AddressChangeModal from "@/components/utility-components/address-change-modal";
import { DocumentTextIcon } from "@heroicons/react/24/outline";
import {
  NostrContext,
  SignerContext,
} from "@/components/utility-components/nostr-context-provider";
import { BLUEBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";
import { calculateWeightedScore } from "@/utils/parsers/review-parser-functions";
import { createNip98AuthorizationHeader } from "@/utils/nostr/nip98-auth";
import {
  buildSignedHttpRequestProofTemplate,
  buildUpdateSubscriptionProof,
  SIGNED_EVENT_HEADER,
} from "@/utils/nostr/request-auth";
import { getSatoshiValue } from "@getalby/lightning-tools";
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
  orderTag?: string;
  orderGroupKey: string;
  statusLookupKeys: string[];
  buyerPubkey: string;
  buyerEmail?: string;
  isGuest?: boolean;
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
  unsignedHerdshareUrl?: string;
  signedHerdshareUrl?: string;
  sellerPubkey?: string;
  isSubscription?: boolean;
  subscriptionFrequency?: string;
  subscriptionId?: string;
  returnRequestSent?: boolean;
  hasReturnRequest?: boolean;
  returnRequestType?: string;
}

interface OrdersDashboardProps {
  filterBySellerPubkey?: string;
}

const OrdersDashboard = ({
  filterBySellerPubkey,
}: OrdersDashboardProps = {}) => {
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

  const [showAddressChangeModal, setShowAddressChangeModal] = useState(false);
  const [addressChangeOrder, setAddressChangeOrder] =
    useState<OrderData | null>(null);
  const [isSendingAddressChange, setIsSendingAddressChange] = useState(false);

  const [showReturnRequestModal, setShowReturnRequestModal] = useState(false);
  const [returnRequestOrder, setReturnRequestOrder] =
    useState<OrderData | null>(null);
  const [returnRequestType, setReturnRequestType] = useState<
    "return" | "refund" | "exchange"
  >("return");
  const [returnRequestMessage, setReturnRequestMessage] = useState("");
  const [isSendingReturnRequest, setIsSendingReturnRequest] = useState(false);

  const [showHerdshareModal, setShowHerdshareModal] = useState(false);
  const [currentPdfUrl, setCurrentPdfUrl] = useState("");
  const [annotations, setAnnotations] = useState<any[]>([]);
  const [isLoadingAgreement, setIsLoadingAgreement] = useState(false);
  const [isUploadingSignedAgreement, setIsUploadingSignedAgreement] =
    useState(false);
  const [showFailureModal, setShowFailureModal] = useState(false);
  const [failureText, setFailureText] = useState("");
  const [herdshareOrder, setHerdshareOrder] = useState<OrderData | null>(null);
  const [isViewMode, setIsViewMode] = useState(false);

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
          const sats = await getSatoshiValue({ amount: 1, currency });
          return { currency: currency.toLowerCase(), rate: sats };
        } catch (err) {
          // The third-party rate API 404s for some less-common currencies.
          // Use console.warn (not console.error) so the Next.js dev
          // overlay doesn't treat this benign, already-handled fallback
          // as a Runtime Error popup.
          console.warn(`Failed to fetch rate for ${currency}:`, err);
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

      const orderIdSet = new Set<string>();
      for (const entry of chatsContext.chatsMap) {
        const chat = entry[1] as NostrMessageEvent[];
        for (const messageEvent of chat) {
          const tagsMap = new Map(
            messageEvent.tags
              .filter((tag): tag is [string, string] => tag.length >= 2)
              .map(([key, value]) => [key, value])
          );
          const subject = tagsMap.get("subject") || "";
          if (
            subject === "order-receipt" ||
            subject === "payment-confirmation" ||
            subject === "shipping-info" ||
            subject === "order-completed"
          ) {
            const orderStatusKeys = getOrderStatusLookupKeys(messageEvent);
            for (const statusKey of orderStatusKeys) {
              orderIdSet.add(statusKey);
            }
          }
        }
      }

      if (orderIdSet.size > 0) {
        try {
          const response = await fetch("/api/db/get-order-statuses", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderIds: Array.from(orderIdSet) }),
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
            const orderTag = tagsMap.get("order") || "";
            const orderGroupKey = buildOrderGroupingKey(messageEvent);
            const statusLookupKeys = getOrderStatusLookupKeys(messageEvent);
            const orderId = orderTag || messageEvent.id;
            const itemTag = messageEvent.tags.find((tag) => tag[0] === "item");
            const productAddress =
              tagsMap.get("a") || (itemTag ? itemTag[1] : "") || "";
            const quantity = itemTag && itemTag[2] ? parseInt(itemTag[2]) : 1;
            const amountStr = tagsMap.get("amount") || "0";
            const amount = parseFloat(amountStr);
            const status = tagsMap.get("status") || "pending";
            const buyerPubkey = tagsMap.get("b") || "";
            const buyerEmailTag = tagsMap.get("buyer_email") || "";
            const isGuest = (tagsMap.get("buyer_type") || "") === "guest";
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

            const subscriptionTagArray = messageEvent.tags.find(
              (tag: string[]) => tag[0] === "subscription"
            );
            const isSubscription =
              subscriptionTagArray &&
              (subscriptionTagArray[1] === "yes" ||
                subscriptionTagArray[1] === "true");
            const subscriptionFrequency =
              subscriptionTagArray && subscriptionTagArray[2]
                ? subscriptionTagArray[2]
                : undefined;
            const subscriptionId =
              subscriptionTagArray && subscriptionTagArray[3]
                ? subscriptionTagArray[3]
                : undefined;

            let paymentToken: string | undefined;
            if (paymentType === "ecash") {
              paymentToken = paymentProofValue || paymentReference;
            }
            const paymentTag = paymentType || "";
            const paymentProof = paymentProofValue;

            const orderCurrency = tagsMap.get("currency") || "";

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
                  const eventAddress = `30402:${event.pubkey}:${
                    event.tags.find((tag: any) => tag[0] === "d")?.[1]
                  }`;
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
            const resolvedCurrency = orderCurrency || productCurrency;
            const finalAmount = amount > 0 ? amount : productPrice * quantity;

            const paymentMethod = resolveExplicitPaymentMethod(paymentType);

            ordersList.push({
              orderId,
              orderTag: orderTag || undefined,
              orderGroupKey,
              statusLookupKeys,
              buyerPubkey,
              buyerEmail: buyerEmailTag || undefined,
              isGuest: isGuest || undefined,
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
              currency: resolvedCurrency,
              donationAmount,
              donationPercentage,
              sellerPubkey: merchantPubkey || undefined,
              isSubscription: !!isSubscription,
              subscriptionFrequency,
              subscriptionId,
            });
          }
        }
      }

      const herdshareMessagesByChat = new Map<
        string,
        { unsigned?: string; signed?: string; timestamp?: number }
      >();
      for (const entry of chatsContext.chatsMap) {
        const chatKey = entry[0];
        const chat = entry[1] as NostrMessageEvent[];
        const herdshareData: {
          unsigned?: string;
          signed?: string;
          timestamp?: number;
        } = {};

        for (const messageEvent of chat) {
          const content = messageEvent.content;
          const urlRegex = /https?:\/\/[^\s]+\.pdf/gi;
          const matches = content.match(urlRegex);

          if (matches && matches.length > 0) {
            const isSignedAgreement = content
              .toLowerCase()
              .includes("signed herdshare agreement");
            const isUnsignedAgreement =
              content.toLowerCase().includes("finalize") &&
              content.toLowerCase().includes("herdshare agreement");

            if (isSignedAgreement) {
              if (
                !herdshareData.timestamp ||
                messageEvent.created_at > herdshareData.timestamp
              ) {
                herdshareData.signed = matches[0];
                herdshareData.timestamp = messageEvent.created_at;
              }
            } else if (isUnsignedAgreement && !herdshareData.signed) {
              herdshareData.unsigned = matches[0];
            }
          }
        }

        if (herdshareData.unsigned || herdshareData.signed) {
          herdshareMessagesByChat.set(chatKey, herdshareData);
        }
      }

      const returnRequestOrderIds = new Set<string>();
      const returnRequestTypes = new Map<string, string>();
      for (const entry of chatsContext.chatsMap) {
        const chat = entry[1] as NostrMessageEvent[];
        for (const messageEvent of chat) {
          const tagsMap = new Map(
            messageEvent.tags
              .filter((tag): tag is [string, string] => tag.length === 2)
              .map(([k, v]) => [k, v])
          );
          const subject = tagsMap.get("subject");
          if (subject === "return-request") {
            const orderId = tagsMap.get("order") || "";
            if (orderId) {
              returnRequestOrderIds.add(orderId);
              const reqType = tagsMap.get("status") || "return";
              returnRequestTypes.set(orderId, reqType);
            }
          }
        }
      }

      const consolidatedOrdersMap = new Map<string, OrderData>();
      const taggedOrderGroupKeys = new Map<string, string | null>();

      const getCachedStatusForOrder = (order: OrderData) => {
        for (const lookupKey of order.statusLookupKeys) {
          const cachedStatus = cachedStatuses[lookupKey];
          if (cachedStatus) {
            return cachedStatus;
          }
        }

        return undefined;
      };

      for (const order of ordersList) {
        const consolidationKey = getOrderConsolidationKey(
          order,
          taggedOrderGroupKeys
        );
        const existing = consolidatedOrdersMap.get(consolidationKey);

        if (!existing) {
          const cachedStatus = getCachedStatusForOrder(order);
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
          consolidatedOrdersMap.set(consolidationKey, {
            ...order,
            orderId: order.orderTag || order.orderId,
            status:
              cachedPriority > orderPriority && cachedStatus
                ? cachedStatus
                : order.status,
          });
          registerTaggedOrderGroupingKey(
            order,
            taggedOrderGroupKeys,
            consolidationKey
          );
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
          const cachedStatus = getCachedStatusForOrder(order);
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

          const mergedStatusLookupKeys = Array.from(
            new Set([...existing.statusLookupKeys, ...order.statusLookupKeys])
          );

          consolidatedOrdersMap.set(consolidationKey, {
            ...existing,
            orderTag: existing.orderTag || order.orderTag,
            orderId: existing.orderTag || order.orderTag || existing.orderId,
            statusLookupKeys: mergedStatusLookupKeys,
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
            buyerEmail: order.buyerEmail || existing.buyerEmail,
            isGuest: order.isGuest ?? existing.isGuest,
            isSale: order.isSale ?? existing.isSale,
            currency: order.currency || existing.currency,
            donationAmount: order.donationAmount ?? existing.donationAmount,
            donationPercentage:
              order.donationPercentage ?? existing.donationPercentage,
            isSubscription: order.isSubscription || existing.isSubscription,
            subscriptionFrequency:
              order.subscriptionFrequency || existing.subscriptionFrequency,
            subscriptionId: order.subscriptionId || existing.subscriptionId,
          });
          registerTaggedOrderGroupingKey(
            order,
            taggedOrderGroupKeys,
            consolidationKey
          );
        }
      }

      const consolidatedOrders = Array.from(consolidatedOrdersMap.values());
      consolidatedOrders.sort((a, b) => b.timestamp - a.timestamp);

      for (const order of consolidatedOrders) {
        const sellerPubkey =
          order.sellerPubkey || order.productAddress.split(":")[1];
        order.sellerPubkey = sellerPubkey || undefined;

        const chatCounterparty = order.isSale
          ? order.buyerPubkey
          : sellerPubkey;
        if (chatCounterparty) {
          const herdshareData = herdshareMessagesByChat.get(chatCounterparty);
          if (herdshareData) {
            if (herdshareData.signed) {
              order.signedHerdshareUrl = herdshareData.signed;
            } else if (herdshareData.unsigned) {
              order.unsignedHerdshareUrl = herdshareData.unsigned;
            }
          }
        }
      }

      for (const order of consolidatedOrders) {
        if (returnRequestOrderIds.has(order.orderId)) {
          order.hasReturnRequest = true;
          order.returnRequestType =
            returnRequestTypes.get(order.orderId) || "return";
          if (!order.isSale) {
            order.returnRequestSent = true;
          }
        }
      }

      const finalOrders = filterBySellerPubkey
        ? consolidatedOrders.filter(
            (o) => o.sellerPubkey === filterBySellerPubkey
          )
        : consolidatedOrders;

      setOrders(finalOrders);
      setTotalOrders(finalOrders.length);
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
          const cachedStatusValue = order.statusLookupKeys
            .map((lookupKey) => cachedStatuses[lookupKey])
            .find((status): status is string => Boolean(status));
          const cachedPriority = cachedStatusValue
            ? statusPriorityForPersist[cachedStatusValue] || 0
            : 0;
          if (currentPriority > cachedPriority) {
            const body = JSON.stringify({
              orderId: order.orderId,
              status: order.status,
              messageId: order.messageEvent?.id,
            });
            createNip98AuthorizationHeader(
              signer!,
              `${window.location.origin}/api/db/update-order-status`,
              "POST",
              body
            )
              .then((authHeader) =>
                fetch("/api/db/update-order-status", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: authHeader,
                  },
                  body,
                })
              )
              .catch((err) =>
                console.error("Failed to save order status:", err)
              );
          }
        }
      }
    }

    loadOrders();
  }, [
    chatsContext,
    productContext,
    cachedStatuses,
    signer,
    filterBySellerPubkey,
  ]);

  const ceilCents = (n: number): number => Math.ceil(n * 100) / 100;

  const convertToSats = (amount: number, currency: string): number => {
    const curr = currency?.toLowerCase() || "sats";
    if (curr === "sats" || curr === "sat" || curr === "satoshi") {
      return Math.ceil(amount);
    }
    if (curr === "btc") return Math.ceil(amount * 100000000);

    const upperCurrency = currency.toUpperCase();
    if (!currencySelection.hasOwnProperty(upperCurrency)) {
      return Math.ceil(amount);
    }

    const rate = currencyRates[curr];
    if (rate && rate > 0) {
      return Math.ceil(amount * rate);
    }
    return Math.ceil(amount);
  };

  const convertToUSD = (amount: number, currency: string): number => {
    const usdRate = currencyRates["usd"];
    if (!usdRate || usdRate === 0) return ceilCents(amount);

    const curr = currency?.toLowerCase() || "sats";
    if (curr === "usd") return ceilCents(amount);
    if (curr === "sats" || curr === "sat" || curr === "satoshi") {
      return ceilCents(amount / usdRate);
    }
    if (curr === "btc") return ceilCents((amount * 100000000) / usdRate);

    const upperCurrency = currency.toUpperCase();
    if (!currencySelection.hasOwnProperty(upperCurrency)) {
      return ceilCents(amount);
    }

    const currRate = currencyRates[curr];
    if (currRate && currRate > 0) {
      const sats = amount * currRate;
      return ceilCents(sats / usdRate);
    }
    return ceilCents(amount);
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
      const eventAddress = `30402:${event.pubkey}:${
        event.tags.find((tag: any) => tag[0] === "d")?.[1]
      }`;
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

  const handleDelete = async (_productId: string): Promise<void> => {
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

      if (!selectedOrder.isGuest) {
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

        await sendGiftWrappedMessageEvent(nostr, giftWrappedEvent, signer);
      }

      // Update local state to shipped status (removes Send Shipping Update button)
      setOrders((prevOrders) =>
        prevOrders.map((order) =>
          order.orderId === selectedOrder.orderId
            ? { ...order, status: "shipped" }
            : order
        )
      );

      // Persist status to database
      const body = JSON.stringify({
        orderId: selectedOrder.orderId,
        status: "shipped",
      });
      const authHeader = await createNip98AuthorizationHeader(
        signer,
        `${window.location.origin}/api/db/update-order-status`,
        "POST",
        body
      );

      fetch("/api/db/update-order-status", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader,
        },
        body,
      }).catch((err) =>
        console.error("Failed to persist shipped status:", err)
      );

      fetch("/api/email/send-update-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: selectedOrder.orderId,
          productTitle: selectedOrder.productTitle || "your order",
          updateType: "shipping",
          message:
            "Your order has been shipped!" +
            (trackingNumber ? ` Tracking: ${trackingNumber}` : ""),
          trackingNumber: trackingNumber || undefined,
          carrier: shippingCarrier || undefined,
        }),
      }).catch(() => {});

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

  const canShowReturnButton = (order: OrderData) => {
    if (order.isSale) return false;
    if (order.returnRequestSent) return false;
    if (!order.productAddress || !order.productAddress.includes(":"))
      return false;
    const merchantPubkey = order.productAddress.split(":")[1];
    if (merchantPubkey && merchantPubkey === userPubkey) return false;
    return (
      order.status === "completed" ||
      order.status === "shipped" ||
      order.status === "confirmed" ||
      order.subject === "shipping-info" ||
      order.subject === "order-receipt"
    );
  };

  const getDefaultReturnMessage = (
    type: "return" | "refund" | "exchange",
    productTitle?: string
  ) => {
    const product = productTitle || "the product";
    switch (type) {
      case "return":
        return `Hi, I would like to request a return for ${product}. Please let me know the return process and any details I need to follow.`;
      case "refund":
        return `Hi, I would like to request a refund for ${product}. Please let me know how to proceed.`;
      case "exchange":
        return `Hi, I would like to request an exchange for ${product}. Please let me know the available options and how to proceed.`;
    }
  };

  const handleOpenReturnRequestModal = (order: OrderData) => {
    setReturnRequestOrder(order);
    setReturnRequestType("return");
    setReturnRequestMessage(
      getDefaultReturnMessage("return", order.productTitle)
    );
    setShowReturnRequestModal(true);
  };

  const handleCloseReturnRequestModal = () => {
    setShowReturnRequestModal(false);
    setReturnRequestOrder(null);
    setReturnRequestType("return");
    setReturnRequestMessage("");
  };

  const handleReturnRequestTypeChange = (
    type: "return" | "refund" | "exchange"
  ) => {
    setReturnRequestType(type);
    setReturnRequestMessage(
      getDefaultReturnMessage(type, returnRequestOrder?.productTitle)
    );
  };

  const handleSubmitReturnRequest = async () => {
    if (
      !returnRequestOrder ||
      !signer ||
      !nostr ||
      !returnRequestMessage.trim()
    )
      return;

    setIsSendingReturnRequest(true);

    try {
      const decodedRandomPubkeyForSender = nip19.decode(randomNpubForSender);
      const decodedRandomPrivkeyForSender = nip19.decode(randomNsecForSender);
      const decodedRandomPubkeyForReceiver = nip19.decode(
        randomNpubForReceiver
      );
      const decodedRandomPrivkeyForReceiver = nip19.decode(
        randomNsecForReceiver
      );

      const sellerPubkey =
        returnRequestOrder.sellerPubkey ||
        returnRequestOrder.productAddress.split(":")[1];

      if (!sellerPubkey) {
        setFailureText("Could not determine seller for this order.");
        setShowFailureModal(true);
        return;
      }

      const typeLabel =
        returnRequestType === "return"
          ? "Return"
          : returnRequestType === "refund"
            ? "Refund"
            : "Exchange";

      const message = `${typeLabel} Request for order #${returnRequestOrder.orderId.slice(
        0,
        8
      )}\nProduct: ${
        returnRequestOrder.productTitle || "Unknown Product"
      }\n\n${returnRequestMessage}`;

      const giftWrappedMessageEvent = await constructGiftWrappedEvent(
        decodedRandomPubkeyForSender.data as string,
        sellerPubkey,
        message,
        "return-request",
        {
          productAddress: returnRequestOrder.productAddress,
          type: 4,
          isOrder: true,
          orderId: returnRequestOrder.orderId,
          buyerPubkey: userPubkey,
          status: returnRequestType,
        }
      );

      const sealedEvent = await constructMessageSeal(
        signer,
        giftWrappedMessageEvent,
        decodedRandomPubkeyForSender.data as string,
        sellerPubkey,
        decodedRandomPrivkeyForSender.data as Uint8Array
      );

      const giftWrappedEvent = await constructMessageGiftWrap(
        sealedEvent,
        decodedRandomPubkeyForReceiver.data as string,
        decodedRandomPrivkeyForReceiver.data as Uint8Array,
        sellerPubkey
      );

      await sendGiftWrappedMessageEvent(nostr, giftWrappedEvent, signer);

      setOrders((prevOrders) =>
        prevOrders.map((order) =>
          order.orderId === returnRequestOrder.orderId
            ? { ...order, returnRequestSent: true, returnRequestType }
            : order
        )
      );

      fetch("/api/email/send-return-request-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: returnRequestOrder.orderId,
          productTitle: returnRequestOrder.productTitle || "Unknown Product",
          requestType: returnRequestType,
          message: returnRequestMessage,
          sellerPubkey,
          buyerName: userNPub,
        }),
      }).catch(() => {});

      handleCloseReturnRequestModal();
    } catch (error) {
      console.error("Error sending return request:", error);
      setFailureText("Failed to send return request. Please try again.");
      setShowFailureModal(true);
    } finally {
      setIsSendingReturnRequest(false);
    }
  };

  const handleSignHerdshare = async (order: OrderData) => {
    if (!order.unsignedHerdshareUrl || !signer) {
      setFailureText("Please log in to sign agreements.");
      setShowFailureModal(true);
      return;
    }

    setIsLoadingAgreement(true);
    setHerdshareOrder(order);
    setIsViewMode(false);

    try {
      const sellerNpub = order.sellerPubkey
        ? nip19.npubEncode(order.sellerPubkey)
        : "";
      const decryptedBlob = await viewEncryptedAgreement(
        order.unsignedHerdshareUrl,
        sellerNpub
      );

      if (!decryptedBlob || decryptedBlob.size === 0) {
        setFailureText("Failed to decrypt agreement or received empty data.");
        setShowFailureModal(true);
        return;
      }

      const blobUrl = URL.createObjectURL(decryptedBlob);
      setCurrentPdfUrl(blobUrl);
      setShowHerdshareModal(true);
    } catch (error) {
      console.error("Error loading agreement:", error);
      setFailureText(
        "An error occurred while trying to view the agreement: " +
          (error as Error).message
      );
      setShowFailureModal(true);
    } finally {
      setIsLoadingAgreement(false);
    }
  };

  const handleViewHerdshare = async (order: OrderData) => {
    if (!order.signedHerdshareUrl || !signer) {
      setFailureText("Please log in to view agreements.");
      setShowFailureModal(true);
      return;
    }

    setIsLoadingAgreement(true);
    setHerdshareOrder(order);
    setIsViewMode(true);

    try {
      const sellerNpub = order.sellerPubkey
        ? nip19.npubEncode(order.sellerPubkey)
        : "";
      const decryptedBlob = await viewEncryptedAgreement(
        order.signedHerdshareUrl,
        sellerNpub,
        signer
      );

      if (!decryptedBlob || decryptedBlob.size === 0) {
        setFailureText("Failed to decrypt agreement or received empty data.");
        setShowFailureModal(true);
        return;
      }

      const blobUrl = URL.createObjectURL(decryptedBlob);
      setCurrentPdfUrl(blobUrl);
      setShowHerdshareModal(true);
    } catch (error) {
      console.error("Error loading signed agreement:", error);
      setFailureText(
        "An error occurred while trying to view the agreement: " +
          (error as Error).message
      );
      setShowFailureModal(true);
    } finally {
      setIsLoadingAgreement(false);
    }
  };

  const handleFinishSigning = async () => {
    if (!herdshareOrder || !signer || !nostr || !currentPdfUrl) return;

    setIsUploadingSignedAgreement(true);

    try {
      const response = await fetch(currentPdfUrl);
      const pdfBlob = await response.blob();

      const formData = new FormData();
      formData.append("pdf", pdfBlob, "agreement.pdf");
      formData.append("annotations", JSON.stringify(annotations));

      const processResponse = await fetch("/api/process-pdf-annotations", {
        method: "POST",
        body: formData,
      });

      if (!processResponse.ok) {
        throw new Error("Failed to process PDF annotations");
      }

      const annotatedPdfBlob = await processResponse.blob();
      const sellerNpub = herdshareOrder.sellerPubkey
        ? nip19.npubEncode(herdshareOrder.sellerPubkey)
        : "";
      const encryptedFile = await encryptFileWithNip44(
        new File([annotatedPdfBlob], "signed-agreement.pdf", {
          type: "application/pdf",
        }),
        sellerNpub,
        true,
        signer
      );

      const encryptedPdfBlob = new Blob([await encryptedFile.arrayBuffer()], {
        type: "application/pdf",
      });

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const file = new File(
        [encryptedPdfBlob],
        `encrypted-signed-agreement-${timestamp}.pdf`,
        { type: "application/pdf" }
      );

      const { blossomServers } = getLocalStorageData();
      const servers =
        blossomServers && blossomServers.length > 0
          ? blossomServers
          : ["https://cdn.nostrcheck.me"];

      let uploadTags = null;
      for (const server of servers) {
        try {
          uploadTags = await blossomUpload(file, false, signer, [server]);
          if (uploadTags && Array.isArray(uploadTags)) {
            const url = uploadTags.find((tag) => tag[0] === "url")?.[1];
            if (url) {
              break;
            }
          }
        } catch (err) {
          console.error(`Failed to upload to ${server}:`, err);
        }
      }

      if (!uploadTags) {
        throw new Error("Failed to upload PDF to any server");
      }

      const signedPdfUrl = uploadTags.find((tag) => tag[0] === "url")?.[1];
      if (!signedPdfUrl) {
        throw new Error("Upload succeeded but no URL returned from server");
      }

      const decodedRandomPubkeyForSender = nip19.decode(randomNpubForSender);
      const decodedRandomPrivkeyForSender = nip19.decode(randomNsecForSender);
      const decodedRandomPubkeyForReceiver = nip19.decode(
        randomNpubForReceiver
      );
      const decodedRandomPrivkeyForReceiver = nip19.decode(
        randomNsecForReceiver
      );

      const message = `Here is the encrypted signed herdshare agreement from ${userNPub}: ${signedPdfUrl}`;
      const giftWrappedMessageEvent = await constructGiftWrappedEvent(
        userPubkey!,
        herdshareOrder.sellerPubkey!,
        message,
        "order-info"
      );

      const sealedEvent = await constructMessageSeal(
        signer,
        giftWrappedMessageEvent,
        decodedRandomPubkeyForSender.data as string,
        herdshareOrder.sellerPubkey!,
        decodedRandomPrivkeyForSender.data as Uint8Array
      );

      const giftWrappedEvent = await constructMessageGiftWrap(
        sealedEvent,
        decodedRandomPubkeyForReceiver.data as string,
        decodedRandomPrivkeyForReceiver.data as Uint8Array,
        herdshareOrder.sellerPubkey!
      );

      await sendGiftWrappedMessageEvent(nostr, giftWrappedEvent);

      setOrders((prevOrders) =>
        prevOrders.map((order) =>
          order.orderId === herdshareOrder.orderId
            ? {
                ...order,
                signedHerdshareUrl: signedPdfUrl,
                unsignedHerdshareUrl: undefined,
              }
            : order
        )
      );

      handleCloseHerdshareModal();
    } catch (error) {
      console.error("Error signing agreement:", error);
      setFailureText(
        "An error occurred while signing the agreement: " +
          (error as Error).message
      );
      setShowFailureModal(true);
    } finally {
      setIsUploadingSignedAgreement(false);
    }
  };

  const handleCloseHerdshareModal = () => {
    setShowHerdshareModal(false);
    if (currentPdfUrl && currentPdfUrl.startsWith("blob:")) {
      URL.revokeObjectURL(currentPdfUrl);
    }
    setCurrentPdfUrl("");
    setAnnotations([]);
    setHerdshareOrder(null);
    setIsViewMode(false);
  };

  const handleOpenAddressChangeModal = (order: OrderData) => {
    setAddressChangeOrder(order);
    setShowAddressChangeModal(true);
  };

  const handleCloseAddressChangeModal = () => {
    setShowAddressChangeModal(false);
    setAddressChangeOrder(null);
  };

  const onAddressChangeSubmit = async (newAddress: string) => {
    if (!addressChangeOrder || !signer || !nostr) return;

    setIsSendingAddressChange(true);

    try {
      const decodedRandomPubkeyForSender = nip19.decode(randomNpubForSender);
      const decodedRandomPrivkeyForSender = nip19.decode(randomNsecForSender);
      const decodedRandomPubkeyForReceiver = nip19.decode(
        randomNpubForReceiver
      );
      const decodedRandomPrivkeyForReceiver = nip19.decode(
        randomNsecForReceiver
      );

      const sellerPubkey =
        addressChangeOrder.sellerPubkey ||
        addressChangeOrder.productAddress.split(":")[1];

      if (!sellerPubkey) return;

      const message =
        `Address change request for order ${addressChangeOrder.orderId.substring(
          0,
          8
        )}...` +
        (addressChangeOrder.subscriptionId
          ? ` (Subscription: ${addressChangeOrder.subscriptionId})`
          : "") +
        `\n\nNew Address: ${newAddress}`;

      const giftWrappedMessageEvent = await constructGiftWrappedEvent(
        decodedRandomPubkeyForSender.data as string,
        sellerPubkey,
        message,
        "address-change",
        {
          productAddress: addressChangeOrder.productAddress,
          type: 4,
          isOrder: true,
          orderId: addressChangeOrder.orderId,
          buyerPubkey: addressChangeOrder.buyerPubkey,
        }
      );

      const sealedEvent = await constructMessageSeal(
        signer,
        giftWrappedMessageEvent,
        decodedRandomPubkeyForSender.data as string,
        sellerPubkey,
        decodedRandomPrivkeyForSender.data as Uint8Array
      );

      const giftWrappedEvent = await constructMessageGiftWrap(
        sealedEvent,
        decodedRandomPubkeyForReceiver.data as string,
        decodedRandomPrivkeyForReceiver.data as Uint8Array,
        sellerPubkey
      );

      await sendGiftWrappedMessageEvent(nostr, giftWrappedEvent, signer);

      if (addressChangeOrder.subscriptionId && signer && userPubkey) {
        const subscriptionId = addressChangeOrder.subscriptionId;
        signer
          .sign(
            buildSignedHttpRequestProofTemplate(
              buildUpdateSubscriptionProof({
                pubkey: userPubkey,
                subscriptionId,
              })
            )
          )
          .then((signedEvent) =>
            fetch("/api/stripe/update-subscription", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                [SIGNED_EVENT_HEADER]: JSON.stringify(signedEvent),
              },
              body: JSON.stringify({
                subscriptionId,
                shippingAddress: { address: newAddress },
              }),
            })
          )
          .catch((err) =>
            console.error("Failed to update subscription address in DB:", err)
          );
      }

      fetch("/api/email/send-subscription-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "address_change",
          buyerEmail: "",
          productTitle: addressChangeOrder.productTitle || "Your product",
          newAddress: newAddress,
          subscriptionId: addressChangeOrder.subscriptionId,
        }),
      }).catch(() => {});

      setOrders((prevOrders) =>
        prevOrders.map((order) =>
          order.orderId === addressChangeOrder.orderId
            ? { ...order, address: newAddress }
            : order
        )
      );

      handleCloseAddressChangeModal();
    } catch (error) {
      console.error("Error sending address change:", error);
    } finally {
      setIsSendingAddressChange(false);
    }
  };

  if (isLoading || !chatsContext || chatsContext.isLoading) {
    return (
      <div className="flex h-[66vh] items-center justify-center">
        <MilkMarketSpinner />
      </div>
    );
  }

  return (
    <div className="max-w-[98vw] min-w-0 bg-white px-4 py-4 sm:py-6">
      <div className="mx-auto w-full max-w-full min-w-0">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-3xl font-bold text-black">Orders Dashboard</h1>
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold text-black">
              Currency Displayed:
            </span>
            <div className="inline-flex rounded-md border-2 border-black bg-white p-1">
              <button
                onClick={() => setDisplayCurrency("sats")}
                className={`rounded-md px-4 py-2 text-sm font-bold transition-transform ${
                  displayCurrency === "sats"
                    ? "bg-primary-yellow shadow-neo border-2 border-black text-black"
                    : "border-2 border-transparent bg-white text-black hover:-translate-y-0.5"
                }`}
              >
                sats
              </button>
              <button
                onClick={() => setDisplayCurrency("USD")}
                className={`rounded-md px-4 py-2 text-sm font-bold transition-transform ${
                  displayCurrency === "USD"
                    ? "bg-primary-yellow shadow-neo border-2 border-black text-black"
                    : "border-2 border-transparent bg-white text-black hover:-translate-y-0.5"
                }`}
              >
                USD
              </button>
            </div>
          </div>
        </div>

        <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-3">
          <div className="shadow-neo rounded-md border-2 border-black bg-white p-6">
            <h3 className="mb-2 text-sm font-medium text-black">
              Total Orders
            </h3>
            <p className="text-3xl font-bold text-black">{totalOrders}</p>
          </div>

          <div className="shadow-neo rounded-md border-2 border-black bg-white p-6">
            <h3 className="mb-2 text-sm font-medium text-black">Total GMV</h3>
            <p className="text-3xl font-bold text-black">
              {displayCurrency === "sats"
                ? `${getDisplayedGMV().toLocaleString()} sats`
                : `$${getDisplayedGMV().toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}`}
            </p>
          </div>

          <div className="shadow-neo rounded-md border-2 border-black bg-white p-6">
            <h3 className="mb-2 text-sm font-medium text-black">
              Average Order Size
            </h3>
            <p className="text-3xl font-bold text-black">
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
          <div className="shadow-neo mb-8 rounded-md border-2 border-black bg-white p-6">
            <div style={{ height: "300px" }}>
              <Line options={chartOptions} data={getChartData()} />
            </div>
          </div>
        )}

        <div className="shadow-neo w-full overflow-hidden rounded-md border-2 border-black bg-white">
          <div className="max-h-[70vh] overflow-x-auto">
            <table className="min-w-full text-left text-sm text-black">
              <thead className="border-b-2 border-black bg-white">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-bold tracking-wider text-black uppercase">
                    Order ID
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold tracking-wider text-black uppercase">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold tracking-wider text-black uppercase">
                    Shopper/Vendor
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold tracking-wider text-black uppercase">
                    Amount
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold tracking-wider text-black uppercase">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold tracking-wider text-black uppercase">
                    Date
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold tracking-wider text-black uppercase">
                    Address
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold tracking-wider text-black uppercase">
                    Pickup Location
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold tracking-wider text-black uppercase">
                    Order Specs
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold tracking-wider text-black uppercase">
                    Payment
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold tracking-wider text-black uppercase">
                    Product
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold tracking-wider text-black uppercase">
                    Donation Amount
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold tracking-wider text-black uppercase">
                    Subscription
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold tracking-wider text-black uppercase">
                    Herdshare Agreement
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black bg-white">
                {orders.length === 0 ? (
                  <tr>
                    <td
                      colSpan={14}
                      className="px-6 py-4 text-center text-black"
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
                        className={`bg-white hover:bg-gray-50 ${
                          isNewOrder ? "border-l-primary-yellow border-l-4" : ""
                        }`}
                      >
                        <td className="px-4 py-4 text-sm whitespace-nowrap text-black">
                          <div className="flex flex-col gap-1">
                            <span>{order.orderId.substring(0, 8)}...</span>
                            {order.reviewRating !== undefined ? (
                              <span className="text-primary-yellow text-xs underline">
                                Rating: {order.reviewRating.toFixed(1)}
                              </span>
                            ) : canShowReviewButton(order) ? (
                              <button
                                onClick={() => handleOpenReviewModal(order)}
                                className="text-primary-yellow cursor-pointer text-left text-xs underline hover:text-yellow-600"
                              >
                                Leave Review
                              </button>
                            ) : null}
                            {order.returnRequestSent && !order.isSale ? (
                              <span className="text-xs text-orange-500">
                                Return Requested
                              </span>
                            ) : canShowReturnButton(order) ? (
                              <button
                                onClick={() =>
                                  handleOpenReturnRequestModal(order)
                                }
                                className="cursor-pointer text-left text-xs text-orange-500 underline hover:text-orange-700"
                              >
                                Request Return
                              </button>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-sm whitespace-nowrap">
                          <span
                            className={`inline-flex rounded-md border-2 border-black px-2 py-1 text-xs font-bold ${
                              order.isSale
                                ? "bg-purple-200 text-black"
                                : "bg-orange-200 text-black"
                            }`}
                          >
                            {order.isSale ? "Sale" : "Purchase"}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-sm text-black">
                          {(() => {
                            if (order.isSale && order.isGuest) {
                              return (
                                <div className="flex flex-col gap-1">
                                  <span className="inline-flex w-fit rounded-md border-2 border-black bg-yellow-200 px-2 py-0.5 text-xs font-bold text-black">
                                    Guest
                                  </span>
                                  {order.buyerEmail ? (
                                    <a
                                      href={`mailto:${order.buyerEmail}`}
                                      className="block break-all text-black underline hover:text-purple-700"
                                    >
                                      {order.buyerEmail}
                                    </a>
                                  ) : (
                                    <span className="text-black">
                                      No contact provided
                                    </span>
                                  )}
                                </div>
                              );
                            }
                            const displayPubkey = order.isSale
                              ? order.buyerPubkey
                              : order.productAddress.split(":")[1] ||
                                order.buyerPubkey;
                            return displayPubkey ? (
                              <ProfileWithDropdown
                                pubkey={displayPubkey}
                                dropDownKeys={["shop", "inquiry", "copy_npub"]}
                                nameClassname="block text-black"
                              />
                            ) : (
                              <span className="text-black">Not available</span>
                            );
                          })()}
                        </td>
                        <td className="px-4 py-4 text-sm whitespace-nowrap text-black">
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
                        <td className="px-4 py-4 text-sm whitespace-nowrap">
                          <div className="flex flex-col gap-1">
                            <span
                              className={`inline-flex rounded-md border-2 border-black px-2 py-1 text-xs font-bold ${
                                order.status === "completed"
                                  ? "bg-blue-200 text-black"
                                  : order.status === "shipped"
                                    ? "bg-green-200 text-black"
                                    : order.status === "pending"
                                      ? "bg-primary-yellow text-black"
                                      : "bg-gray-200 text-black"
                              }`}
                            >
                              {order.status}
                            </span>
                            {order.status === "pending" && (
                              <button
                                onClick={() => handleOpenShippingModal(order)}
                                className="text-primary-yellow cursor-pointer text-left text-xs underline hover:text-yellow-600"
                              >
                                Send Shipping Update
                              </button>
                            )}
                            {order.hasReturnRequest && order.isSale && (
                              <span className="inline-flex items-center gap-1 rounded-md border border-orange-300 bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-700">
                                {(order.returnRequestType || "return")
                                  .charAt(0)
                                  .toUpperCase() +
                                  (order.returnRequestType || "return").slice(
                                    1
                                  )}{" "}
                                Request
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-sm whitespace-nowrap text-black">
                          {new Date(
                            order.timestamp * 1000
                          ).toLocaleDateString()}
                        </td>
                        <td className="max-w-xs px-4 py-4 text-sm text-black">
                          <div
                            className="truncate"
                            title={order.address || "N/A"}
                          >
                            {order.address || "N/A"}
                          </div>
                        </td>
                        <td className="max-w-xs px-4 py-4 text-sm text-black">
                          <div
                            className="truncate"
                            title={order.pickupLocation || "N/A"}
                          >
                            {order.pickupLocation || "N/A"}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-sm whitespace-nowrap text-black">
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
                            <span className="font-bold text-green-600">
                              Payment Sent
                            </span>
                          ) : order.paymentToken ? (
                            <ClaimButton token={order.paymentToken} />
                          ) : (
                            <span className="text-black">
                              {order.paymentMethod}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-sm text-black">
                          {order.productAddress ? (
                            <button
                              onClick={() =>
                                handleProductClick(order.productAddress)
                              }
                              className="cursor-pointer text-left text-black underline hover:text-purple-600"
                            >
                              {order.productTitle} x{" "}
                              {order.selectedBulkOption || order.quantity || 1}
                            </button>
                          ) : (
                            "N/A"
                          )}
                        </td>
                        <td className="px-4 py-4 text-sm whitespace-nowrap text-black">
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
                        <td className="px-4 py-4 text-sm whitespace-nowrap">
                          <div className="flex flex-col gap-1">
                            <span
                              className={`inline-flex rounded-md border-2 border-black px-2 py-1 text-xs font-bold ${
                                order.isSubscription
                                  ? "bg-green-200 text-black"
                                  : "bg-gray-200 text-black"
                              }`}
                            >
                              {order.isSubscription ? "Yes" : "No"}
                            </span>
                            {order.isSubscription &&
                              order.subscriptionFrequency && (
                                <span className="text-xs text-gray-600">
                                  {order.subscriptionFrequency}
                                </span>
                              )}
                            {order.isSubscription && !order.isSale && (
                              <button
                                onClick={() =>
                                  handleOpenAddressChangeModal(order)
                                }
                                className="text-primary-yellow cursor-pointer text-left text-xs underline hover:text-yellow-600"
                              >
                                Change Address
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-sm whitespace-nowrap">
                          {order.signedHerdshareUrl ? (
                            <button
                              onClick={() => handleViewHerdshare(order)}
                              disabled={isLoadingAgreement}
                              className="inline-flex items-center gap-1 rounded-md border-2 border-black bg-blue-200 px-2 py-1 text-xs font-bold text-black hover:bg-blue-300"
                            >
                              <DocumentTextIcon className="h-4 w-4" />
                              {isLoadingAgreement &&
                              herdshareOrder?.orderId === order.orderId
                                ? "Loading..."
                                : "View Herdshare"}
                            </button>
                          ) : order.unsignedHerdshareUrl && !order.isSale ? (
                            <button
                              onClick={() => handleSignHerdshare(order)}
                              disabled={isLoadingAgreement}
                              className="bg-primary-yellow inline-flex items-center gap-1 rounded-md border-2 border-black px-2 py-1 text-xs font-bold text-black hover:bg-yellow-400"
                            >
                              <DocumentTextIcon className="h-4 w-4" />
                              {isLoadingAgreement &&
                              herdshareOrder?.orderId === order.orderId
                                ? "Loading..."
                                : "Sign Herdshare"}
                            </button>
                          ) : (
                            <span className="text-gray-400">N/A</span>
                          )}
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
          wrapper: "shadow-neo",
          base: "border-2 border-black rounded-md",
          backdrop: "bg-black/20 backdrop-blur-sm",
          header: "border-b-2 border-black bg-white rounded-t-md text-black",
          body: "py-6 bg-white",
          footer: "border-t-2 border-black bg-white rounded-b-md",
          closeButton: "hover:bg-black/5 active:bg-white/10",
        }}
        scrollBehavior={"outside"}
        size="2xl"
      >
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1 text-black">
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
                      className="text-black"
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
                      className="text-black"
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
                      className="text-black"
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
                className={BLUEBUTTONCLASSNAMES}
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
          wrapper: "shadow-neo",
          base: "border-2 border-black rounded-md",
          backdrop: "bg-black/20 backdrop-blur-sm",
          header: "border-b-2 border-black bg-white rounded-t-md text-black",
          body: "py-6 bg-white",
          footer: "border-t-2 border-black bg-white rounded-b-md",
          closeButton: "hover:bg-black/5 active:bg-white/10",
        }}
        scrollBehavior={"outside"}
        size="2xl"
      >
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1 text-black">
            Leave a Review
          </ModalHeader>
          <form onSubmit={handleReviewSubmit(onReviewSubmit)}>
            <ModalBody>
              <div className="mb-4 flex items-center justify-center gap-16">
                <div className="flex items-center gap-3">
                  <span className="text-black">Good Overall</span>
                  <HandThumbUpIcon
                    className={`h-12 w-12 cursor-pointer rounded-md border-2 p-2 transition-colors ${
                      selectedThumb === "up"
                        ? "border-green-500 text-green-500"
                        : "border-black text-black hover:border-green-500 hover:text-green-500"
                    }`}
                    onClick={() => setSelectedThumb("up")}
                  />
                </div>
                <div className="flex items-center gap-3">
                  <HandThumbDownIcon
                    className={`h-12 w-12 cursor-pointer rounded-md border-2 p-2 transition-colors ${
                      selectedThumb === "down"
                        ? "border-red-500 text-red-500"
                        : "border-black text-black hover:border-red-500 hover:text-red-500"
                    }`}
                    onClick={() => setSelectedThumb("down")}
                  />
                  <span className="text-black">Bad Overall</span>
                </div>
              </div>

              <div className="mb-4 flex flex-col gap-3">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="accent-primary-yellow h-4 w-4 rounded border-2 border-black"
                    checked={reviewOptions.get("value") === 1}
                    onChange={(e) =>
                      setReviewOptions((prev) => {
                        const newMap = new Map(prev);
                        newMap.set("value", e.target.checked ? 1 : 0);
                        return newMap;
                      })
                    }
                  />
                  <span className="text-black">Good Value</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="accent-primary-yellow h-4 w-4 rounded border-2 border-black"
                    checked={reviewOptions.get("quality") === 1}
                    onChange={(e) =>
                      setReviewOptions((prev) => {
                        const newMap = new Map(prev);
                        newMap.set("quality", e.target.checked ? 1 : 0);
                        return newMap;
                      })
                    }
                  />
                  <span className="text-black">Good Quality</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="accent-primary-yellow h-4 w-4 rounded border-2 border-black"
                    checked={reviewOptions.get("delivery") === 1}
                    onChange={(e) =>
                      setReviewOptions((prev) => {
                        const newMap = new Map(prev);
                        newMap.set("delivery", e.target.checked ? 1 : 0);
                        return newMap;
                      })
                    }
                  />
                  <span className="text-black">Quick Delivery</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="accent-primary-yellow h-4 w-4 rounded border-2 border-black"
                    checked={reviewOptions.get("communication") === 1}
                    onChange={(e) =>
                      setReviewOptions((prev) => {
                        const newMap = new Map(prev);
                        newMap.set("communication", e.target.checked ? 1 : 0);
                        return newMap;
                      })
                    }
                  />
                  <span className="text-black">Good Communication</span>
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
                      className="w-full rounded-md border-2 border-black bg-white p-2 text-black"
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
                className={BLUEBUTTONCLASSNAMES}
                type="submit"
                isDisabled={!selectedThumb}
              >
                Leave Review
              </Button>
            </ModalFooter>
          </form>
        </ModalContent>
      </Modal>

      {showHerdshareModal && currentPdfUrl && (
        <Modal
          isOpen={showHerdshareModal}
          onOpenChange={(isOpen) => {
            if (!isOpen) {
              handleCloseHerdshareModal();
            }
          }}
          size="5xl"
          scrollBehavior="inside"
          classNames={{
            body: "py-6 bg-white",
            backdrop: "bg-black/20 backdrop-blur-sm",
            header: "border-b-2 border-black bg-white rounded-t-md text-black",
            footer: "border-t-2 border-black bg-white rounded-b-md",
            closeButton: "hover:bg-black/5 active:bg-white/10",
          }}
          className="max-h-[90vh]"
        >
          <ModalContent className="flex h-full flex-col">
            <ModalHeader className="flex-shrink-0 border-b bg-white">
              <div className="flex items-center gap-2 text-black">
                <DocumentTextIcon className="h-5 w-5" />
                {isViewMode
                  ? "View Signed Agreement"
                  : "Review & Sign Agreement"}
              </div>
            </ModalHeader>
            <ModalBody className="flex flex-grow flex-col p-4">
              <div className="flex h-full flex-col rounded-lg border bg-white">
                <div className="flex-grow overflow-auto p-4">
                  <PDFAnnotator
                    pdfUrl={currentPdfUrl}
                    annotations={annotations}
                    onAnnotationsChange={setAnnotations}
                  />
                </div>
              </div>
            </ModalBody>
            <ModalFooter className="flex-shrink-0 border-t bg-gray-50">
              <div className="flex w-full justify-end gap-3">
                <Button
                  color="default"
                  variant="light"
                  onPress={handleCloseHerdshareModal}
                >
                  {isViewMode ? "Close" : "Cancel"}
                </Button>
                {!isViewMode && (
                  <Button
                    color="warning"
                    onPress={handleFinishSigning}
                    isLoading={isUploadingSignedAgreement}
                    disabled={isUploadingSignedAgreement}
                  >
                    {isUploadingSignedAgreement
                      ? "Processing..."
                      : "Finish Signing"}
                  </Button>
                )}
              </div>
            </ModalFooter>
          </ModalContent>
        </Modal>
      )}

      <Modal
        backdrop="blur"
        isOpen={showReturnRequestModal}
        onClose={handleCloseReturnRequestModal}
        classNames={{
          wrapper: "shadow-neo",
          base: "border-2 border-black rounded-md",
          backdrop: "bg-black/20 backdrop-blur-sm",
          header: "border-b-2 border-black bg-white rounded-t-md text-black",
          body: "bg-white text-black",
          footer: "border-t-2 border-black bg-white rounded-b-md",
        }}
      >
        <ModalContent>
          <ModalHeader>
            <span>Request Return / Refund / Exchange</span>
          </ModalHeader>
          <ModalBody>
            <div className="flex flex-col gap-4">
              <div>
                <p className="mb-1 text-sm font-semibold text-black">
                  Order: {returnRequestOrder?.orderId?.substring(0, 8)}...
                </p>
                <p className="text-sm text-gray-600">
                  Product: {returnRequestOrder?.productTitle || "Unknown"}
                </p>
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-black">
                  Request Type
                </label>
                <div className="flex gap-3">
                  {(["return", "refund", "exchange"] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() => handleReturnRequestTypeChange(type)}
                      className={`rounded-md border-2 px-3 py-1.5 text-sm font-bold transition-colors ${
                        returnRequestType === type
                          ? "border-black bg-orange-200 text-black"
                          : "border-gray-300 bg-white text-gray-600 hover:border-black"
                      }`}
                    >
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-black">
                  Message to Vendor
                </label>
                <textarea
                  value={returnRequestMessage}
                  onChange={(e) => setReturnRequestMessage(e.target.value)}
                  rows={5}
                  className="w-full rounded-md border-2 border-gray-300 bg-white p-3 text-sm text-black focus:border-black focus:outline-none"
                  placeholder="Describe the reason for your request..."
                />
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button
              color="danger"
              variant="light"
              onClick={handleCloseReturnRequestModal}
            >
              Cancel
            </Button>
            <Button
              className="border-2 border-black bg-orange-200 font-bold text-black hover:bg-orange-300"
              onClick={handleSubmitReturnRequest}
              isLoading={isSendingReturnRequest}
              disabled={isSendingReturnRequest || !returnRequestMessage.trim()}
            >
              {isSendingReturnRequest ? "Sending..." : "Submit Request"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <AddressChangeModal
        isOpen={showAddressChangeModal}
        onClose={handleCloseAddressChangeModal}
        onSubmit={onAddressChangeSubmit}
        isLoading={isSendingAddressChange}
        orderId={addressChangeOrder?.orderId}
        productTitle={addressChangeOrder?.productTitle}
        currentAddress={addressChangeOrder?.address}
        subscriptionId={addressChangeOrder?.subscriptionId}
      />

      <FailureModal
        bodyText={failureText}
        isOpen={showFailureModal}
        onClose={() => {
          setShowFailureModal(false);
          setFailureText("");
        }}
      />
    </div>
  );
};

export default OrdersDashboard;
