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
import AddressChangeModal from "@/components/utility-components/address-change-modal";
import {
  SignerContext,
  NostrContext,
} from "@/components/utility-components/nostr-context-provider";
import MilkMarketSpinner from "@/components/utility-components/mm-spinner";
import { ProfileWithDropdown } from "@/components/utility-components/profile/profile-dropdown";
import {
  BLUEBUTTONCLASSNAMES,
  DANGERBUTTONCLASSNAMES,
} from "@/utils/STATIC-VARIABLES";
import {
  constructGiftWrappedEvent,
  constructMessageSeal,
  constructMessageGiftWrap,
  sendGiftWrappedMessageEvent,
  generateKeys,
} from "@/utils/nostr/nostr-helper-functions";
import {
  buildCancelSubscriptionProof,
  buildSignedHttpRequestProofTemplate,
  buildUpdateSubscriptionProof,
  SIGNED_EVENT_HEADER,
} from "@/utils/nostr/request-auth";

interface SubscriptionData {
  id: number;
  stripe_subscription_id: string;
  stripe_customer_id: string;
  buyer_pubkey: string | null;
  buyer_email: string;
  seller_pubkey: string;
  product_event_id: string;
  product_title: string | null;
  quantity: number;
  variant_info: any;
  frequency: string;
  discount_percent: number;
  base_price: number;
  subscription_price: number;
  currency: string;
  shipping_address: any;
  status: string;
  next_billing_date: string | null;
  next_shipping_date: string | null;
  created_at: string;
  updated_at: string;
}

const FREQUENCY_LABELS: Record<string, string> = {
  weekly: "Weekly",
  every_2_weeks: "Every 2 Weeks",
  monthly: "Monthly",
  every_2_months: "Every 2 Months",
  quarterly: "Quarterly",
};

const SubscriptionManagement = () => {
  const [subscriptions, setSubscriptions] = useState<SubscriptionData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [guestEmail, setGuestEmail] = useState("");
  const [guestSubId, setGuestSubId] = useState("");
  const [isGuestMode, setIsGuestMode] = useState(false);
  const [guestLookupDone, setGuestLookupDone] = useState(false);

  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelSubscription, setCancelSubscription] =
    useState<SubscriptionData | null>(null);
  const [isCanceling, setIsCanceling] = useState(false);

  const [showDateModal, setShowDateModal] = useState(false);
  const [dateSubscription, setDateSubscription] =
    useState<SubscriptionData | null>(null);
  const [isUpdatingDate, setIsUpdatingDate] = useState(false);

  const [showAddressModal, setShowAddressModal] = useState(false);
  const [addressSubscription, setAddressSubscription] =
    useState<SubscriptionData | null>(null);
  const [isUpdatingAddress, setIsUpdatingAddress] = useState(false);

  const [randomNpubForSender, setRandomNpubForSender] = useState("");
  const [randomNsecForSender, setRandomNsecForSender] = useState("");
  const [randomNpubForReceiver, setRandomNpubForReceiver] = useState("");
  const [randomNsecForReceiver, setRandomNsecForReceiver] = useState("");

  const { signer, pubkey: userPubkey, isLoggedIn } = useContext(SignerContext);
  const { nostr } = useContext(NostrContext);

  const {
    handleSubmit: handleDateSubmit,
    control: dateControl,
    reset: dateReset,
  } = useForm({
    defaultValues: {
      newDate: "",
    },
  });

  useEffect(() => {
    const fetchKeys = async () => {
      const { nsec: nsecS, npub: npubS } = await generateKeys();
      setRandomNpubForSender(npubS);
      setRandomNsecForSender(nsecS);
      const { nsec: nsecR, npub: npubR } = await generateKeys();
      setRandomNpubForReceiver(npubR);
      setRandomNsecForReceiver(nsecR);
    };
    fetchKeys();
  }, []);

  useEffect(() => {
    if (isLoggedIn && userPubkey) {
      fetchSubscriptions();
    } else {
      setIsLoading(false);
    }
  }, [isLoggedIn, userPubkey]);

  const fetchSubscriptions = async () => {
    setIsLoading(true);
    try {
      const params = userPubkey
        ? `pubkey=${userPubkey}`
        : `email=${encodeURIComponent(guestEmail)}`;
      const response = await fetch(`/api/stripe/get-subscriptions?${params}`);
      if (response.ok) {
        const data = await response.json();
        setSubscriptions(data.subscriptions || []);
      }
    } catch (error) {
      console.error("Failed to fetch subscriptions:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGuestLookup = async () => {
    if (!guestEmail) return;
    setIsLoading(true);
    setGuestLookupDone(true);
    try {
      let url = `/api/stripe/get-subscriptions?email=${encodeURIComponent(
        guestEmail
      )}`;
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        let subs = data.subscriptions || [];
        if (guestSubId) {
          subs = subs.filter(
            (s: SubscriptionData) =>
              s.stripe_subscription_id === guestSubId ||
              s.id.toString() === guestSubId
          );
        }
        setSubscriptions(subs);
        setIsGuestMode(true);
      }
    } catch (error) {
      console.error("Failed to fetch guest subscriptions:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelClick = (sub: SubscriptionData) => {
    setCancelSubscription(sub);
    setShowCancelModal(true);
  };

  const handleConfirmCancel = async () => {
    if (!cancelSubscription) return;
    setIsCanceling(true);
    try {
      if (!signer || !userPubkey) {
        throw new Error("Sign in with Nostr to manage this subscription");
      }
      const subscriptionId = cancelSubscription.stripe_subscription_id;
      const signedEvent = await signer.sign(
        buildSignedHttpRequestProofTemplate(
          buildCancelSubscriptionProof({
            pubkey: userPubkey,
            subscriptionId,
          })
        )
      );
      const response = await fetch("/api/stripe/cancel-subscription", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [SIGNED_EVENT_HEADER]: JSON.stringify(signedEvent),
        },
        body: JSON.stringify({
          subscriptionId,
        }),
      });
      if (response.ok) {
        setSubscriptions((prev) =>
          prev.map((s) =>
            s.id === cancelSubscription.id ? { ...s, status: "canceled" } : s
          )
        );

        fetch("/api/email/send-subscription-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "cancellation",
            buyerEmail: cancelSubscription.buyer_email,
            productTitle:
              cancelSubscription.product_title ||
              cancelSubscription.product_event_id,
            endDate:
              cancelSubscription.next_billing_date || new Date().toISOString(),
            subscriptionId: cancelSubscription.stripe_subscription_id,
          }),
        }).catch(() => {});
      }
    } catch (error) {
      console.error("Failed to cancel subscription:", error);
    } finally {
      setIsCanceling(false);
      setShowCancelModal(false);
      setCancelSubscription(null);
    }
  };

  const handleChangeDateClick = (sub: SubscriptionData) => {
    setDateSubscription(sub);
    dateReset();
    setShowDateModal(true);
  };

  const onDateSubmit = async (data: { newDate: string }) => {
    if (!dateSubscription || !data.newDate) return;
    setIsUpdatingDate(true);
    try {
      if (!signer || !userPubkey) {
        throw new Error("Sign in with Nostr to manage this subscription");
      }
      const subscriptionId = dateSubscription.stripe_subscription_id;
      const signedEvent = await signer.sign(
        buildSignedHttpRequestProofTemplate(
          buildUpdateSubscriptionProof({
            pubkey: userPubkey,
            subscriptionId,
          })
        )
      );
      const response = await fetch("/api/stripe/update-subscription", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [SIGNED_EVENT_HEADER]: JSON.stringify(signedEvent),
        },
        body: JSON.stringify({
          subscriptionId,
          nextBillingDate: data.newDate,
        }),
      });
      if (response.ok) {
        setSubscriptions((prev) =>
          prev.map((s) =>
            s.id === dateSubscription.id
              ? {
                  ...s,
                  next_billing_date: data.newDate,
                  next_shipping_date: data.newDate,
                }
              : s
          )
        );
      }
    } catch (error) {
      console.error("Failed to update delivery date:", error);
    } finally {
      setIsUpdatingDate(false);
      setShowDateModal(false);
      setDateSubscription(null);
    }
  };

  const handleChangeAddressClick = (sub: SubscriptionData) => {
    setAddressSubscription(sub);
    setShowAddressModal(true);
  };

  const onAddressSubmit = async (newAddress: string) => {
    if (!addressSubscription || !newAddress) return;
    setIsUpdatingAddress(true);
    try {
      if (!signer || !userPubkey) {
        throw new Error("Sign in with Nostr to manage this subscription");
      }
      const subscriptionId = addressSubscription.stripe_subscription_id;
      const signedEvent = await signer.sign(
        buildSignedHttpRequestProofTemplate(
          buildUpdateSubscriptionProof({
            pubkey: userPubkey,
            subscriptionId,
          })
        )
      );
      const response = await fetch("/api/stripe/update-subscription", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [SIGNED_EVENT_HEADER]: JSON.stringify(signedEvent),
        },
        body: JSON.stringify({
          subscriptionId,
          shippingAddress: { address: newAddress },
        }),
      });

      if (response.ok) {
        setSubscriptions((prev) =>
          prev.map((s) =>
            s.id === addressSubscription.id
              ? { ...s, shipping_address: { address: newAddress } }
              : s
          )
        );

        if (
          signer &&
          nostr &&
          userPubkey &&
          addressSubscription.seller_pubkey
        ) {
          try {
            const decodedRandomPubkeyForSender =
              nip19.decode(randomNpubForSender);
            const decodedRandomPrivkeyForSender =
              nip19.decode(randomNsecForSender);
            const decodedRandomPubkeyForReceiver = nip19.decode(
              randomNpubForReceiver
            );
            const decodedRandomPrivkeyForReceiver = nip19.decode(
              randomNsecForReceiver
            );

            const message = `Address change for subscription ${addressSubscription.stripe_subscription_id}\n\nNew Address: ${newAddress}`;

            const giftWrappedMessageEvent = await constructGiftWrappedEvent(
              decodedRandomPubkeyForSender.data as string,
              addressSubscription.seller_pubkey,
              message,
              "address-change",
              {
                productAddress: addressSubscription.product_event_id,
                type: 4,
                isOrder: true,
                orderId: addressSubscription.stripe_subscription_id,
                buyerPubkey: userPubkey,
              }
            );

            const sealedEvent = await constructMessageSeal(
              signer,
              giftWrappedMessageEvent,
              decodedRandomPubkeyForSender.data as string,
              addressSubscription.seller_pubkey,
              decodedRandomPrivkeyForSender.data as Uint8Array
            );

            const giftWrappedEvent = await constructMessageGiftWrap(
              sealedEvent,
              decodedRandomPubkeyForReceiver.data as string,
              decodedRandomPrivkeyForReceiver.data as Uint8Array,
              addressSubscription.seller_pubkey
            );

            await sendGiftWrappedMessageEvent(nostr, giftWrappedEvent);
          } catch (dmError) {
            console.error("Failed to send address change DM:", dmError);
          }
        }

        fetch("/api/email/send-subscription-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "address_change",
            buyerEmail: addressSubscription.buyer_email,
            productTitle:
              addressSubscription.product_title ||
              addressSubscription.product_event_id,
            newAddress: newAddress,
            subscriptionId: addressSubscription.stripe_subscription_id,
          }),
        }).catch(() => {});
      }
    } catch (error) {
      console.error("Failed to update address:", error);
    } finally {
      setIsUpdatingAddress(false);
      setShowAddressModal(false);
      setAddressSubscription(null);
    }
  };

  const formatAddress = (addr: any): string => {
    if (!addr) return "N/A";
    if (typeof addr === "string") return addr;
    if (addr.address) return addr.address;
    const parts = [
      addr.line1,
      addr.line2,
      addr.city,
      addr.state,
      addr.postal_code,
      addr.country,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(", ") : "N/A";
  };

  const neoModalClasses = {
    wrapper: "shadow-neo",
    base: "border-2 border-black rounded-md",
    backdrop: "bg-black/20 backdrop-blur-sm",
    header: "border-b-2 border-black bg-white rounded-t-md text-black",
    body: "py-6 bg-white",
    footer: "border-t-2 border-black bg-white rounded-b-md",
    closeButton: "hover:bg-black/5 active:bg-white/10",
  };

  if (!isLoggedIn && !isGuestMode) {
    return (
      <div className="max-w-[98vw] min-w-0 bg-white px-4 py-4 sm:py-6">
        <div className="mx-auto w-full max-w-lg">
          <h1 className="mb-6 text-3xl font-bold text-black">
            Manage Subscriptions
          </h1>
          <div className="shadow-neo rounded-md border-2 border-black bg-white p-6">
            <p className="mb-4 text-sm text-black">
              Enter your email and optionally your subscription ID to manage
              your subscriptions.
            </p>
            <div className="flex flex-col gap-4">
              <Input
                label="Email Address"
                placeholder="you@example.com"
                variant="bordered"
                value={guestEmail}
                onChange={(e) => setGuestEmail(e.target.value)}
                className="text-black"
                type="email"
              />
              <Input
                label="Subscription ID (optional)"
                placeholder="sub_..."
                variant="bordered"
                value={guestSubId}
                onChange={(e) => setGuestSubId(e.target.value)}
                className="text-black"
              />
              <Button
                className={BLUEBUTTONCLASSNAMES}
                onClick={handleGuestLookup}
                isLoading={isLoading}
              >
                Look Up Subscriptions
              </Button>
              {guestLookupDone && subscriptions.length === 0 && !isLoading && (
                <p className="text-center text-sm text-gray-500">
                  No subscriptions found for this email.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-[66vh] items-center justify-center">
        <MilkMarketSpinner />
      </div>
    );
  }

  const activeSubscriptions = subscriptions.filter(
    (s) => s.status === "active"
  );
  const inactiveSubscriptions = subscriptions.filter(
    (s) => s.status !== "active"
  );

  return (
    <div className="max-w-[98vw] min-w-0 bg-white px-4 py-4 sm:py-6">
      <div className="mx-auto w-full max-w-full min-w-0">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-3xl font-bold text-black">My Subscriptions</h1>
          {isGuestMode && (
            <Button
              className="text-sm font-bold text-black underline"
              variant="light"
              onClick={() => {
                setIsGuestMode(false);
                setGuestLookupDone(false);
                setSubscriptions([]);
                setGuestEmail("");
                setGuestSubId("");
              }}
            >
              Back to Lookup
            </Button>
          )}
        </div>

        {subscriptions.length === 0 ? (
          <div className="shadow-neo rounded-md border-2 border-black bg-white p-8 text-center">
            <p className="text-lg text-black">No subscriptions found.</p>
          </div>
        ) : (
          <>
            {activeSubscriptions.length > 0 && (
              <div className="mb-8">
                <h2 className="mb-4 text-xl font-bold text-black">
                  Active Subscriptions
                </h2>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {activeSubscriptions.map((sub) => (
                    <div
                      key={sub.id}
                      className="shadow-neo flex flex-col justify-between rounded-md border-2 border-black bg-white p-6"
                    >
                      <div>
                        <div className="mb-3 flex items-center justify-between">
                          <span className="inline-flex rounded-md border-2 border-black bg-green-200 px-2 py-1 text-xs font-bold text-black">
                            Active
                          </span>
                          <span className="text-xs text-gray-500">
                            #{sub.stripe_subscription_id.substring(0, 12)}...
                          </span>
                        </div>

                        <div className="mb-2">
                          <span className="text-sm font-medium text-gray-600">
                            Seller:
                          </span>
                          <div className="mt-1">
                            {sub.seller_pubkey ? (
                              <ProfileWithDropdown
                                pubkey={sub.seller_pubkey}
                                dropDownKeys={["shop", "copy_npub"]}
                                nameClassname="block text-black text-sm"
                              />
                            ) : (
                              <span className="text-sm text-black">N/A</span>
                            )}
                          </div>
                        </div>

                        <div className="mb-4 space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Frequency:</span>
                            <span className="font-bold text-black">
                              {FREQUENCY_LABELS[sub.frequency] || sub.frequency}
                            </span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Price:</span>
                            <span className="font-bold text-black">
                              {sub.subscription_price}{" "}
                              {sub.currency.toUpperCase()}
                            </span>
                          </div>
                          {sub.discount_percent > 0 && (
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-600">Discount:</span>
                              <span className="font-bold text-green-600">
                                {sub.discount_percent}% off
                              </span>
                            </div>
                          )}
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Base Price:</span>
                            <span className="text-black line-through">
                              {sub.base_price} {sub.currency.toUpperCase()}
                            </span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Quantity:</span>
                            <span className="font-bold text-black">
                              {sub.quantity}
                            </span>
                          </div>
                          {sub.variant_info && (
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-600">Variant:</span>
                              <span className="text-black">
                                {typeof sub.variant_info === "string"
                                  ? sub.variant_info
                                  : Object.entries(sub.variant_info)
                                      .map(([k, v]) => `${k}: ${v}`)
                                      .join(", ")}
                              </span>
                            </div>
                          )}
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Next Billing:</span>
                            <span className="font-bold text-black">
                              {sub.next_billing_date
                                ? new Date(
                                    sub.next_billing_date
                                  ).toLocaleDateString()
                                : "N/A"}
                            </span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Address:</span>
                            <span
                              className="max-w-[50%] truncate text-right text-black"
                              title={formatAddress(sub.shipping_address)}
                            >
                              {formatAddress(sub.shipping_address)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 border-t-2 border-black pt-4">
                        <button
                          onClick={() => handleChangeDateClick(sub)}
                          className="bg-primary-yellow shadow-neo flex-1 rounded-md border-2 border-black px-3 py-2 text-xs font-bold text-black transition-transform hover:-translate-y-0.5 active:translate-y-0.5"
                        >
                          Change Date
                        </button>
                        <button
                          onClick={() => handleChangeAddressClick(sub)}
                          className="shadow-neo flex-1 rounded-md border-2 border-black bg-white px-3 py-2 text-xs font-bold text-black transition-transform hover:-translate-y-0.5 active:translate-y-0.5"
                        >
                          Change Address
                        </button>
                        <button
                          onClick={() => handleCancelClick(sub)}
                          className="shadow-neo flex-1 rounded-md border-2 border-black bg-red-500 px-3 py-2 text-xs font-bold text-white transition-transform hover:-translate-y-0.5 active:translate-y-0.5"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {inactiveSubscriptions.length > 0 && (
              <div>
                <h2 className="mb-4 text-xl font-bold text-black">
                  Past Subscriptions
                </h2>
                <div className="shadow-neo w-full overflow-hidden rounded-md border-2 border-black bg-white">
                  <div className="max-h-[40vh] overflow-x-auto">
                    <table className="min-w-full text-left text-sm text-black">
                      <thead className="border-b-2 border-black bg-white">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-bold tracking-wider text-black uppercase">
                            Subscription ID
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-bold tracking-wider text-black uppercase">
                            Seller
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-bold tracking-wider text-black uppercase">
                            Frequency
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-bold tracking-wider text-black uppercase">
                            Price
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-bold tracking-wider text-black uppercase">
                            Status
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-bold tracking-wider text-black uppercase">
                            Created
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-black bg-white">
                        {inactiveSubscriptions.map((sub) => (
                          <tr
                            key={sub.id}
                            className="bg-white hover:bg-gray-50"
                          >
                            <td className="px-4 py-4 text-sm whitespace-nowrap text-black">
                              {sub.stripe_subscription_id.substring(0, 12)}...
                            </td>
                            <td className="px-4 py-4 text-sm text-black">
                              {sub.seller_pubkey ? (
                                <ProfileWithDropdown
                                  pubkey={sub.seller_pubkey}
                                  dropDownKeys={["shop", "copy_npub"]}
                                  nameClassname="block text-black text-sm"
                                />
                              ) : (
                                "N/A"
                              )}
                            </td>
                            <td className="px-4 py-4 text-sm whitespace-nowrap text-black">
                              {FREQUENCY_LABELS[sub.frequency] || sub.frequency}
                            </td>
                            <td className="px-4 py-4 text-sm whitespace-nowrap text-black">
                              {sub.subscription_price}{" "}
                              {sub.currency.toUpperCase()}
                            </td>
                            <td className="px-4 py-4 text-sm whitespace-nowrap">
                              <span
                                className={`inline-flex rounded-md border-2 border-black px-2 py-1 text-xs font-bold ${
                                  sub.status === "paused"
                                    ? "bg-yellow-200 text-black"
                                    : "bg-gray-200 text-black"
                                }`}
                              >
                                {sub.status}
                              </span>
                            </td>
                            <td className="px-4 py-4 text-sm whitespace-nowrap text-black">
                              {new Date(sub.created_at).toLocaleDateString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <Modal
        backdrop="blur"
        isOpen={showCancelModal}
        onClose={() => {
          setShowCancelModal(false);
          setCancelSubscription(null);
        }}
        classNames={neoModalClasses}
        scrollBehavior="outside"
        size="md"
      >
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1 text-black">
            Cancel Subscription
          </ModalHeader>
          <ModalBody>
            <p className="text-sm text-black">
              Are you sure you want to cancel this subscription? It will remain
              active until the end of the current billing period
              {cancelSubscription?.next_billing_date
                ? ` (${new Date(
                    cancelSubscription.next_billing_date
                  ).toLocaleDateString()})`
                : ""}
              .
            </p>
          </ModalBody>
          <ModalFooter>
            <Button
              color="default"
              variant="light"
              onClick={() => {
                setShowCancelModal(false);
                setCancelSubscription(null);
              }}
            >
              Keep Subscription
            </Button>
            <Button
              className={DANGERBUTTONCLASSNAMES}
              onClick={handleConfirmCancel}
              isLoading={isCanceling}
            >
              Confirm Cancellation
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal
        backdrop="blur"
        isOpen={showDateModal}
        onClose={() => {
          setShowDateModal(false);
          setDateSubscription(null);
        }}
        classNames={neoModalClasses}
        scrollBehavior="outside"
        size="md"
      >
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1 text-black">
            Change Delivery Date
          </ModalHeader>
          <form onSubmit={handleDateSubmit(onDateSubmit)}>
            <ModalBody>
              <p className="mb-2 text-sm text-black">
                Select a new billing/delivery date for your subscription.
              </p>
              <Controller
                name="newDate"
                control={dateControl}
                rules={{ required: "A new date is required." }}
                render={({
                  field: { onChange, onBlur, value },
                  fieldState: { error },
                }) => (
                  <Input
                    autoFocus
                    label="New Delivery Date"
                    variant="bordered"
                    isInvalid={!!error}
                    errorMessage={error?.message || ""}
                    className="text-black"
                    type="date"
                    onChange={onChange}
                    onBlur={onBlur}
                    value={value}
                    min={
                      new Date(Date.now() + 86400000)
                        .toISOString()
                        .split("T")[0]
                    }
                  />
                )}
              />
            </ModalBody>
            <ModalFooter>
              <Button
                color="default"
                variant="light"
                onClick={() => {
                  setShowDateModal(false);
                  setDateSubscription(null);
                }}
              >
                Cancel
              </Button>
              <Button
                className={BLUEBUTTONCLASSNAMES}
                type="submit"
                isLoading={isUpdatingDate}
              >
                Update Date
              </Button>
            </ModalFooter>
          </form>
        </ModalContent>
      </Modal>

      <AddressChangeModal
        isOpen={showAddressModal}
        onClose={() => {
          setShowAddressModal(false);
          setAddressSubscription(null);
        }}
        onSubmit={onAddressSubmit}
        isLoading={isUpdatingAddress}
        productTitle={
          addressSubscription?.product_title ||
          addressSubscription?.product_event_id
        }
        currentAddress={formatAddress(addressSubscription?.shipping_address)}
        subscriptionId={addressSubscription?.stripe_subscription_id}
      />
    </div>
  );
};

export default SubscriptionManagement;
