import { useState, useContext, useEffect } from "react";
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
import { PRIMARYBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";
import { ProductData } from "@/utils/parsers/product-parser-functions";
import { validateZapReceipt } from "@/utils/nostr/zap-validator";

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
      const savedInfo = localStorage.getItem("milk_market_shipping_info");
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
          "milk_market_shipping_info",
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
        className={`${PRIMARYBUTTONCLASSNAMES} w-full text-lg font-bold disabled:opacity-50`}
        onClick={onOpen}
        startContent={!isSoldOut ? <BoltIcon className="h-6 w-6" /> : null}
        isDisabled={isSoldOut || isCheckingInventory}
      >
        {isCheckingInventory
          ? "Checking Stock..."
          : isSoldOut
            ? "Sold Out"
            : remaining !== null
              ? `Zap to Buy (${remaining} left)`
              : `Zap to Buy (${product.price} sats)`}
      </Button>

      <Modal isOpen={isOpen} onClose={onClose} size="2xl">
        <ModalContent>
          <ModalHeader>⚡ Zapsnag: {product.title}</ModalHeader>
          <ModalBody>
            <p className="mb-4 text-sm text-gray-500">
              Flash Sale! Enter your shipping details once, and we&apos;ll
              remember them for next time. Data is encrypted (NIP-17) and sent
              only to the seller.
            </p>

            <div className="flex flex-col gap-4">
              <Input
                label="Full Name"
                placeholder="Satoshi Nakamoto"
                value={shippingInfo.name}
                onValueChange={(v) =>
                  setShippingInfo({ ...shippingInfo, name: v })
                }
                isRequired
              />
              <Input
                label="Street Address"
                placeholder="123 Bitcoin Blvd"
                value={shippingInfo.address}
                onValueChange={(v) =>
                  setShippingInfo({ ...shippingInfo, address: v })
                }
                isRequired
              />
              <Input
                label="Apartment, Suite, Unit (Optional)"
                placeholder="Apt 4B"
                value={shippingInfo.unit}
                onValueChange={(v) =>
                  setShippingInfo({ ...shippingInfo, unit: v })
                }
              />

              <div className="flex gap-2">
                <Input
                  label="City"
                  placeholder="New York"
                  className="flex-1"
                  value={shippingInfo.city}
                  onValueChange={(v) =>
                    setShippingInfo({ ...shippingInfo, city: v })
                  }
                  isRequired
                />
                <Input
                  label="State / Province"
                  placeholder="NY"
                  className="w-1/3"
                  value={shippingInfo.state}
                  onValueChange={(v) =>
                    setShippingInfo({ ...shippingInfo, state: v })
                  }
                />
              </div>

              <div className="flex gap-2">
                <Input
                  label="Postal / Zip Code"
                  placeholder="10001"
                  className="w-1/2"
                  value={shippingInfo.zip}
                  onValueChange={(v) =>
                    setShippingInfo({ ...shippingInfo, zip: v })
                  }
                  isRequired
                />
                <Input
                  label="Country"
                  placeholder="USA"
                  className="w-1/2"
                  value={shippingInfo.country}
                  onValueChange={(v) =>
                    setShippingInfo({ ...shippingInfo, country: v })
                  }
                  isRequired
                />
              </div>
            </div>

            <div className="py-6 text-center text-xl font-bold">
              Total: {product.price} sats
            </div>

            <Button
              isLoading={loading}
              className={PRIMARYBUTTONCLASSNAMES}
              onClick={handleBuy}
              isDisabled={!isValid || loading}
            >
              {loading ? status : "Confirm & Zap"}
            </Button>
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
  );
}
