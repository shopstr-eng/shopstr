import React, { useState, useContext, useEffect } from "react";
import {
  Button,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  Input,
  useDisclosure,
} from "@nextui-org/react";
import { BoltIcon } from "@heroicons/react/24/outline";
import { LightningAddress } from "@getalby/lightning-tools";
import { webln } from "@getalby/sdk";
import {
  NostrContext,
  SignerContext,
} from "@/components/utility-components/nostr-context-provider";
import {
  getLocalStorageData,
  constructGiftWrappedEvent,
  constructMessageSeal,
  constructMessageGiftWrap,
  sendGiftWrappedMessageEvent,
} from "@/utils/nostr/nostr-helper-functions";
import { generateSecretKey, getPublicKey } from "nostr-tools";
import { ProductData } from "@/utils/parsers/product-parser-functions";
import { validateZapReceipt } from "@/utils/nostr/zap-validator";
import { NEO_BTN } from "@/utils/STATIC-VARIABLES";

export default function ZapsnagButton({ product }: { product: ProductData }) {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [soldCount, setSoldCount] = useState(0);
  const [isCheckingInventory, setIsCheckingInventory] = useState(true);

  const [shippingInfo, setShippingInfo] = useState({
    name: "",
    address: "",
    unit: "",
    city: "",
    state: "",
    zip: "",
    country: "",
  });

  const { nostr: nostrManager } = useContext(NostrContext);
  const { signer, isLoggedIn, pubkey: userPubkey } = useContext(SignerContext);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedInfo = localStorage.getItem("shopstr_shipping_info");
      if (savedInfo) {
        try {
          const parsed = JSON.parse(savedInfo);
          setShippingInfo((prev) => ({ ...prev, ...parsed }));
        } catch (e) {
          console.error("Failed to load saved shipping info", e);
        }
      }
    }
  }, []);

  useEffect(() => {
    const checkInventory = async () => {
      if (!nostrManager || !product.id) return;

      if (!product.quantity || product.quantity <= 0) {
        setIsCheckingInventory(false);
        return;
      }

      try {
        const filter = { kinds: [9735], "#e": [product.id] };
        const zaps = await nostrManager.fetch([filter]);
        setSoldCount(zaps.length);
      } catch (e) {
        console.error("Failed to check inventory", e);
      } finally {
        setIsCheckingInventory(false);
      }
    };
    checkInventory();
  }, [nostrManager, product.id, product.quantity]);

  const handleBuy = async () => {
    let originalWebLN: any;
    if (!signer || !isLoggedIn || !userPubkey) {
      alert("Please sign in to purchase.");
      return;
    }

    if (product.price <= 0) {
      alert("Could not determine a valid price. Cannot Zap.");
      return;
    }

    setLoading(true);
    setStatus("Finding seller address...");
    try {
      const profileFilter = { kinds: [0], authors: [product.pubkey] };
      const events = (await nostrManager?.fetch([profileFilter])) || [];
      let lud16 = "";

      if (events.length > 0) {
        const kind0 = events.sort((a, b) => b.created_at - a.created_at)[0];
        if (kind0) {
          try {
            const content = JSON.parse(kind0.content || "{}");
            lud16 = content.lud16 || content.lnurl || "";
          } catch (e) {
            console.warn("Failed to parse seller profile", e);
          }
        }
      }

      if (!lud16) {
        throw new Error("Seller has not set up a Lightning Address (LUD16).");
      }

      originalWebLN = (window as any).webln;
      const { nwcString } = getLocalStorageData();
      if (nwcString) {
        const nwcProvider = new webln.NostrWebLNProvider({
          nostrWalletConnectUrl: nwcString,
        });
        await nwcProvider.enable();
        (window as any).webln = nwcProvider;
      } else if (typeof (window as any).webln !== "undefined") {
        await (window as any).webln.enable();
      } else {
        throw new Error(
          "No wallet connected. Please connect a wallet in Settings."
        );
      }

      setStatus("Encrypting shipping info...");
      const ephemeralPrivBytes = generateSecretKey();
      const ephemeralPubHex = getPublicKey(ephemeralPrivBytes);

      const orderId = crypto.randomUUID();
      const shippingMessage = JSON.stringify({
        type: "zapsnag_order",
        orderId: orderId,
        item: product.id,
        shipping: shippingInfo,
      });

      const giftWrap = await constructGiftWrappedEvent(
        userPubkey,
        product.pubkey,
        shippingMessage,
        "zapsnag-order",
        {
          isOrder: true,
          orderId: orderId,
          buyerPubkey: userPubkey,
        }
      );

      const seal = await constructMessageSeal(
        signer,
        giftWrap,
        userPubkey,
        product.pubkey
      );
      const finalEvent = await constructMessageGiftWrap(
        seal,
        ephemeralPubHex,
        ephemeralPrivBytes,
        product.pubkey
      );

      await sendGiftWrappedMessageEvent(nostrManager!, finalEvent);

      setStatus("Paying via Lightning...");
      const ln = new LightningAddress(lud16);
      await ln.fetch();

      const { relays: userRelays } = getLocalStorageData();
      const targetRelays =
        userRelays.length > 0
          ? userRelays
          : ["wss://relay.damus.io", "wss://nos.lol"];

      const zapArgs = {
        satoshi: product.price,
        comment: `Order #${orderId}`,
        e: product.id,
        relays: targetRelays,
      };

      const startTime = Math.floor(Date.now() / 1000);
      const response = await ln.zap(zapArgs);

      if (response.preimage) {
        localStorage.setItem(
          "shopstr_shipping_info",
          JSON.stringify(shippingInfo)
        );

        setStatus("Verifying receipt...");
        const receiptFound = await validateZapReceipt(
          nostrManager!,
          product.id,
          startTime
        );

        if (receiptFound) {
          alert(
            "Order Placed & Verified! Preimage: " +
              response.preimage.substring(0, 8) +
              "..."
          );
        } else {
          alert(
            "Payment sent (Preimage received), but receipt not found on relay yet. Order is likely successful."
          );
        }
        onClose();
      }
    } catch (e: any) {
      console.error(e);
      alert("Order failed: " + e.message);
    } finally {
      if ((window as any).webln !== originalWebLN) {
        (window as any).webln = originalWebLN;
      }
      setLoading(false);
      setStatus("");
    }
  };

  const isValid =
    shippingInfo.name &&
    shippingInfo.address &&
    shippingInfo.city &&
    shippingInfo.zip &&
    shippingInfo.country;

  // Inventory Logic
  const hasQuantityLimit = product.quantity && product.quantity > 0;
  const isSoldOut = hasQuantityLimit ? soldCount >= product.quantity! : false;
  const remaining = hasQuantityLimit ? product.quantity! - soldCount : null;

  return (
    <>
      <Button
        className={`${NEO_BTN} h-14 w-full text-lg font-black tracking-widest`}
        onClick={onOpen}
        startContent={!isSoldOut ? <BoltIcon className="h-6 w-6" /> : null}
        isDisabled={isSoldOut || isCheckingInventory}
      >
        {isCheckingInventory
          ? "Checking Stock..."
          : isSoldOut
            ? "Sold Out"
            : remaining !== null
              ? `ZAP TO BUY (${remaining} LEFT)`
              : `ZAP TO BUY (${product.price} SATS)`}
      </Button>

      <Modal
        isOpen={isOpen}
        onClose={onClose}
        size="2xl"
        backdrop="blur"
        classNames={{
          base: "bg-[#161616] border border-zinc-800",
          header: "border-b border-zinc-800",
          body: "py-6 max-h-[85vh] overflow-y-auto", // Ensure long forms don't clip on small screens
          closeButton: "hover:bg-white/10 text-white",
        }}
      >
        <ModalContent>
          <ModalHeader className="text-xl font-black uppercase italic tracking-tighter text-white md:text-2xl">
            ⚡ Zapsnag: {product.title}
          </ModalHeader>
          <ModalBody>
            <p className="mb-4 text-sm text-zinc-400">
              Flash Sale! Enter your shipping details once, and we&apos;ll
              remember them for next time. Data is encrypted (NIP-17) and sent
              only to the seller.
            </p>

            <div className="flex flex-col gap-4">
              <Input
                label="FULL NAME"
                labelPlacement="outside"
                placeholder="Satoshi Nakamoto"
                value={shippingInfo.name}
                onValueChange={(v) =>
                  setShippingInfo({ ...shippingInfo, name: v })
                }
                variant="bordered"
                classNames={{
                  label:
                    "text-zinc-500 font-bold uppercase tracking-wider text-xs",
                  input: "text-white text-base", // Prevent iOS zoom
                  inputWrapper:
                    "bg-[#111] border-zinc-700 data-[hover=true]:border-zinc-500 group-data-[focus=true]:border-yellow-400",
                }}
                isRequired
              />
              <Input
                label="STREET ADDRESS"
                labelPlacement="outside"
                placeholder="123 Bitcoin Blvd"
                value={shippingInfo.address}
                onValueChange={(v) =>
                  setShippingInfo({ ...shippingInfo, address: v })
                }
                variant="bordered"
                classNames={{
                  label:
                    "text-zinc-500 font-bold uppercase tracking-wider text-xs",
                  input: "text-white text-base", // Prevent iOS zoom
                  inputWrapper:
                    "bg-[#111] border-zinc-700 data-[hover=true]:border-zinc-500 group-data-[focus=true]:border-yellow-400",
                }}
                isRequired
              />
              <Input
                label="APARTMENT, SUITE, UNIT (OPTIONAL)"
                labelPlacement="outside"
                placeholder="Apt 4B"
                value={shippingInfo.unit}
                onValueChange={(v) =>
                  setShippingInfo({ ...shippingInfo, unit: v })
                }
                variant="bordered"
                classNames={{
                  label:
                    "text-zinc-500 font-bold uppercase tracking-wider text-xs",
                  input: "text-white text-base", // Prevent iOS zoom
                  inputWrapper:
                    "bg-[#111] border-zinc-700 data-[hover=true]:border-zinc-500 group-data-[focus=true]:border-yellow-400",
                }}
              />

              <div className="flex flex-col gap-4 sm:flex-row sm:gap-2">
                <Input
                  label="CITY"
                  labelPlacement="outside"
                  placeholder="New York"
                  className="flex-1"
                  value={shippingInfo.city}
                  onValueChange={(v) =>
                    setShippingInfo({ ...shippingInfo, city: v })
                  }
                  variant="bordered"
                  classNames={{
                    label:
                      "text-zinc-500 font-bold uppercase tracking-wider text-xs",
                    input: "text-white text-base", // Prevent iOS zoom
                    inputWrapper:
                      "bg-[#111] border-zinc-700 data-[hover=true]:border-zinc-500 group-data-[focus=true]:border-yellow-400",
                  }}
                  isRequired
                />
                <Input
                  label="STATE / PROVINCE"
                  labelPlacement="outside"
                  placeholder="NY"
                  className="w-full sm:w-1/3"
                  value={shippingInfo.state}
                  onValueChange={(v) =>
                    setShippingInfo({ ...shippingInfo, state: v })
                  }
                  variant="bordered"
                  classNames={{
                    label:
                      "text-zinc-500 font-bold uppercase tracking-wider text-xs",
                    input: "text-white text-base", // Prevent iOS zoom
                    inputWrapper:
                      "bg-[#111] border-zinc-700 data-[hover=true]:border-zinc-500 group-data-[focus=true]:border-yellow-400",
                  }}
                />
              </div>

              <div className="flex flex-col gap-4 sm:flex-row sm:gap-2">
                <Input
                  label="POSTAL / ZIP CODE"
                  labelPlacement="outside"
                  placeholder="10001"
                  className="w-full sm:w-1/2"
                  value={shippingInfo.zip}
                  onValueChange={(v) =>
                    setShippingInfo({ ...shippingInfo, zip: v })
                  }
                  variant="bordered"
                  classNames={{
                    label:
                      "text-zinc-500 font-bold uppercase tracking-wider text-xs",
                    input: "text-white text-base", // Prevent iOS zoom
                    inputWrapper:
                      "bg-[#111] border-zinc-700 data-[hover=true]:border-zinc-500 group-data-[focus=true]:border-yellow-400",
                  }}
                  isRequired
                />
                <Input
                  label="COUNTRY"
                  labelPlacement="outside"
                  placeholder="USA"
                  className="w-full sm:w-1/2"
                  value={shippingInfo.country}
                  onValueChange={(v) =>
                    setShippingInfo({ ...shippingInfo, country: v })
                  }
                  variant="bordered"
                  classNames={{
                    label:
                      "text-zinc-500 font-bold uppercase tracking-wider text-xs",
                    input: "text-white text-base", // Prevent iOS zoom
                    inputWrapper:
                      "bg-[#111] border-zinc-700 data-[hover=true]:border-zinc-500 group-data-[focus=true]:border-yellow-400",
                  }}
                  isRequired
                />
              </div>
            </div>

            <div className="py-8 text-center">
              <span className="mr-2 font-bold uppercase tracking-wider text-zinc-500">
                Total:
              </span>
              <span className="text-3xl font-black text-yellow-400">
                {product.price} sats
              </span>
            </div>

            <Button
              isLoading={loading}
              className={`${NEO_BTN} h-14 w-full text-lg font-black tracking-widest`}
              onClick={handleBuy}
              isDisabled={!isValid || loading}
            >
              {loading ? status : "CONFIRM & ZAP"}
            </Button>
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
  );
}
