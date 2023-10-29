import React, { useMemo, useState, useRef, useEffect } from "react";
import {
  BoltIcon,
  ClipboardIcon,
  TrashIcon,
  EnvelopeIcon,
} from "@heroicons/react/24/outline";
import { withRouter, NextRouter, useRouter } from "next/router";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Input,
  Image,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  DropdownSection,
} from "@nextui-org/react";
import axios from "axios";
import requestMint from "../api/cashu/request-mint";
import { CashuMint, CashuWallet, getEncodedToken } from "@cashu/cashu-ts";
import { nip19, SimplePool } from "nostr-tools";
import * as CryptoJS from "crypto-js";
import {
  getNsecWithPassphrase,
  getPrivKeyWithPassphrase,
  getPubKey,
} from "../nostr-helpers";

// Define a type for product data
interface ProductData {
  title: string;
  summary: string;
  publishedAt: string;
  images: string[];
  categories: string[];
  location: string;
  price: number;
  currency: string;
  shippingType: string | null;
  shippingCost: number | null;
}

const DisplayProduct = ({
  tags,
  eventId,
  pubkey,
  handleDelete,
}: {
  tags: [][];
  eventId: string;
  pubkey: string;
  handleDelete: (productId: string, passphrase: string) => void;
}) => {
  const router = useRouter();

  const [decryptedNpub, setDecryptedNpub] = useState("");
  const [signIn, setSignIn] = useState("");
  const [relays, setRelays] = useState([]);

  const [productData, setProductData] = useState<ProductData>({
    title: "",
    summary: "",
    publishedAt: "",
    images: [],
    categories: [],
    location: "",
    price: 0,
    currency: "",
    shippingType: null,
    shippingCost: null,
  });

  const {
    title,
    summary,
    publishedAt,
    images,
    categories,
    location,
    price,
    currency,
    shippingType,
    shippingCost,
  } = productData;

  const [currentImage, setCurrentImage] = useState(0);
  const [totalCost, setTotalCost] = useState<number>(0);

  const [checkout, setCheckout] = useState(false);
  const [invoice, setInvoice] = useState("");
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);

  const [enterPassphrase, setEnterPassphrase] = useState(false);
  const [passphrase, setPassphrase] = useState("");

  const [use, setUse] = useState("");

  const [btcSpotPrice, setBtcSpotPrice] = useState();

  useEffect(() => {
    if (typeof window !== "undefined") {
      const signInType = localStorage.getItem("signIn");
      if (signInType) {
        setSignIn(signInType);
        setDecryptedNpub(getPubKey());
        const storedRelays = localStorage.getItem("relays");
        setRelays(storedRelays ? JSON.parse(storedRelays) : []);
      }
    }
  }, []);

  useEffect(() => {
    const parsedTags = parseTags(tags);
    setProductData((prevState) => ({ ...prevState, ...parsedTags }));
    setTotalCost(calculateTotalCost(parsedTags));
  }, [tags]);

  const isButtonDisabled = useMemo(() => {
    if (signIn === "extension") return false; // extension can upload without passphrase
    if (passphrase === "") return true; // nsec needs passphrase
    try {
      let nsec = getNsecWithPassphrase(passphrase);
      if (!nsec) return true; // invalid passphrase
    } catch (e) {
      return true; // invalid passphrase
    }
    return false;
  }, [signIn, passphrase]);

  const buttonClassName = useMemo(() => {
    const disabledStyle = " from-gray-300 to-gray-400 cursor-not-allowed";
    const enabledStyle = " from-purple-600 via-purple-500 to-purple-600";
    const className =
      "text-white shadow-lg bg-gradient-to-tr" +
      (isButtonDisabled ? disabledStyle : enabledStyle);
    return className;
  }, [isButtonDisabled]);

  const passphraseInputRef = useRef(null);

  const confirmActionDropdown = (children, header, label, func) => {
    return (
      <Dropdown backdrop="blur">
        <DropdownTrigger>{children}</DropdownTrigger>
        <DropdownMenu variant="faded" aria-label="Static Actions">
          <DropdownSection title={header} showDivider={true}></DropdownSection>
          <DropdownItem
            key="delete"
            className="text-danger"
            color="danger"
            onClick={func}
          >
            {label}
          </DropdownItem>
        </DropdownMenu>
      </Dropdown>
    );
  };

  const cancel = () => {
    setEnterPassphrase(false);
    setPassphrase("");
  };

  const calculateTotalCost = (parsedTags: ProductData) => {
    const { price, shippingType, shippingCost } = parsedTags;
    let total = price;
    total += shippingCost ? shippingCost : 0;
    return total;
  };

  const parseTags = (tags) => {
    let parsedData: ProductData = {};
    tags.forEach((tag) => {
      const [key, ...values] = tag;
      switch (key) {
        case "title":
          parsedData.title = values[0];
          break;
        case "summary":
          parsedData.summary = values[0];
          break;
        case "published_at":
          parsedData.publishedAt = values[0];
          break;
        case "image":
          if (parsedData.images === undefined) parsedData.images = [];
          parsedData.images.push(values[0]);
          break;
        case "t":
          if (parsedData.categories === undefined) parsedData.categories = [];
          parsedData.categories.push(values[0]);
          break;
        case "location":
          parsedData.location = values[0];
          break;
        case "price":
          const [amount, currency] = values;
          parsedData.price = Number(amount);
          parsedData.currency = currency;
          break;
        case "shipping":
          if (values.length === 3) {
            const [type, cost, currency] = values;
            parsedData.shippingType = type;
            parsedData.shippingCost = Number(cost);
            break;
          }
          // TODO Deprecate Below after 11/07/2023
          else if (values.length === 2) {
            // [cost, currency]
            const [cost, currency] = values;
            parsedData.shippingType = "Added Cost";
            parsedData.shippingCost = Number(cost);
            break;
          } else if (values.length === 1) {
            // [type]
            const [type] = values;
            parsedData.shippingType = type;
            parsedData.shippingCost = 0;
            break;
          }
          break;
        default:
          return;
      }
    });
    return parsedData;
  };

  const sendTokens = async (pk: string, token: string) => {
    if (signIn === "extension") {
      const event = {
        created_at: Math.floor(Date.now() / 1000),
        kind: 4,
        tags: [["p", pk]],
        content: await window.nostr.nip04.encrypt(pk, token),
      };

      const signedEvent = await window.nostr.signEvent(event);

      const pool = new SimplePool();

      await pool.publish(relays, signedEvent);

      let events = await pool.list(relays, [{ kinds: [0, signedEvent.kind] }]); // TODO kind 0 contains profile information
      let postedEvent = await pool.get(relays, {
        ids: [signedEvent.id],
      });
    } else {
      axios({
        method: "POST",
        url: "/api/nostr/post-event",
        headers: {
          "Content-Type": "application/json",
        },
        data: {
          pubkey: decryptedNpub,
          privkey: getPrivKeyWithPassphrase(passphrase),
          created_at: Math.floor(Date.now() / 1000),
          kind: 4,
          tags: [["p", pk]],
          content: token,
          relays: relays,
        },
      });
    }
  };

  async function invoiceHasBeenPaid(
    pk: string,
    wallet: object,
    newPrice: number,
    hash: string
  ) {
    let encoded;

    while (true) {
      try {
        const { proofs } = await wallet.requestTokens(newPrice, hash);

        // Encoded proofs can be spent at the mint
        encoded = getEncodedToken({
          token: [
            {
              mint: "https://legend.lnbits.com/cashu/api/v1/4gr9Xcmz3XEkUNwiBiQGoC",
              proofs,
            },
          ],
        });

        if (encoded) {
          sendTokens(pk, encoded);
          setPaymentConfirmed(true);
          setQrCodeUrl(null);
          setTimeout(() => {
            router.push("/");
          }, 1900);
          break;
        }
      } catch (error) {
        console.error(error);

        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  }

  const handlePayment = async (
    pk: string,
    newPrice: number,
    currency: string
  ) => {
    const wallet = new CashuWallet(
      new CashuMint(
        "https://legend.lnbits.com/cashu/api/v1/4gr9Xcmz3XEkUNwiBiQGoC"
      )
    );
    if (currency === "USD") {
      try {
        const res = await axios.get(
          "https://api.coinbase.com/v2/prices/BTC-USD/spot"
        );
        const btcSpotPrice = Number(res.data.data.amount);
        const numSats = (newPrice / btcSpotPrice) * 100000000;
        newPrice = Math.round(numSats);
      } catch (err) {
        console.log(err);
      }
    }

    const { pr, hash } = await wallet.requestMint(newPrice);

    setInvoice(pr);

    const QRCode = require("qrcode");

    QRCode.toDataURL(pr)
      .then((url) => {
        setQrCodeUrl(url);
      })
      .catch((err) => {
        console.error(err);
      });

    setCheckout(true);

    invoiceHasBeenPaid(pk, wallet, newPrice, hash);
  };

  const handleCheckout = (
    productId: string,
    pk: string,
    newPrice: number,
    currency: string
  ) => {
    if (window.location.pathname.includes("checkout")) {
      if (signIn != "extension") {
        setEnterPassphrase(!enterPassphrase);
        setUse("pay");
      } else {
        handlePayment(pk, newPrice, currency);
      }
    } else {
      router.push(`/checkout/${productId}`);
    }
  };

  const nextImage = () => {
    setCurrentImage((currentImage + 1) % images.length);
  };

  const prevImage = () => {
    setCurrentImage((currentImage - 1 + images.length) % images.length);
  };

  const handleDeleteWithPassphrase = () => {
    if (signIn != "extension") {
      setEnterPassphrase(!enterPassphrase);
      setUse("delete");
    } else {
      handleDelete(eventId, "");
    }
  };

  const handleSubmitPassphrase = () => {
    setEnterPassphrase(false);
    if (use === "pay") {
      handlePayment(pubkey, totalCost, currency);
    } else if (use === "delete") {
      handleDelete(eventId, passphrase);
    }
    setUse("");
  };

  const handleCopyInvoice = () => {
    navigator.clipboard.writeText(invoice);
    // navigator.clipboard.writeText(invoiceString);
    alert("Invoice copied to clipboard!");
  };

  const handleSendMessage = (newPubkey: string) => {
    router.push({
      pathname: "/direct-messages",
      query: { pk: nip19.npubEncode(newPubkey) },
    });
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-2xl font-bold mb-4">{title}</h2>
      <p className="text-gray-700 mb-4">{summary}</p>

      <div className="flex flex-wrap -mx-4 mb-4">
        {images.length >= 1 && (
          <div className="relative">
            <img
              src={images[currentImage]}
              alt={`Product Image ${currentImage + 1}`}
              className="w-full object-cover h-72"
            />
            {images.length > 1 && (
              <>
                {currentImage !== 0 && (
                  <button
                    style={{ left: "10px", border: "2px solid black" }}
                    className="absolute top-1/2 p-2 rounded bg-white text-black"
                    onClick={prevImage}
                  >
                    {"<"}
                  </button>
                )}
                {currentImage !== images.length - 1 && (
                  <button
                    style={{ right: "10px", border: "2px solid black" }}
                    className="absolute top-1/2 p-2 rounded bg-white text-black"
                    onClick={nextImage}
                  >
                    {">"}
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <div className="mb-4">
        {categories && (
          <p>
            <strong className="font-semibold">Categories:</strong>{" "}
            {categories.join(", ")}
          </p>
        )}
        <p>
          <strong className="font-semibold">Location:</strong> {location}
        </p>
        <p>
          <strong className="font-semibold">Price:</strong> {price} {currency}
        </p>
        {shippingType && (
          <p>
            <strong className="font-semibold">Shipping:</strong>
            {` ${shippingType} - ${shippingCost} ${currency}`}
          </p>
        )}

        {totalCost ? (
          <p>
            <strong className="font-semibold">Total Cost:</strong> {totalCost}{" "}
            {currency}
          </p>
        ) : undefined}
      </div>
      <div className="flex justify-center">
        {signIn && (
          <BoltIcon
            className="w-6 h-6 hover:text-yellow-500"
            onClick={() => handleCheckout(eventId, pubkey, totalCost, currency)}
          />
        )}
        {decryptedNpub === pubkey && (
          <TrashIcon
            className="w-6 h-6 hover:text-yellow-500"
            onClick={() => handleDeleteWithPassphrase()}
          />
        )}
        {signIn && decryptedNpub != pubkey && (
          <EnvelopeIcon
            className="w-6 h-6 hover:text-yellow-500"
            onClick={() => {
              handleSendMessage(pubkey);
            }}
          />
        )}
      </div>
      <Modal
        backdrop="blur"
        isOpen={checkout}
        onClose={() => setCheckout(false)}
        classNames={{
          body: "py-6",
          backdrop: "bg-[#292f46]/50 backdrop-opacity-60",
          // base: "border-[#292f46] bg-[#19172c] dark:bg-[#19172c] text-[#a8b0d3]",
          header: "border-b-[1px] border-[#292f46]",
          footer: "border-t-[1px] border-[#292f46]",
          closeButton: "hover:bg-black/5 active:bg-white/10",
        }}
        scrollBehavior={"outside"}
        size="2xl"
      >
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1">Checkout</ModalHeader>

          {!paymentConfirmed ? (
            <ModalBody className="flex flex-col items-center justify-center">
              <Image
                alt="Lightning invoice"
                className="object-cover"
                src={qrCodeUrl}
                width={350}
              />
              <div className="flex items-center justify-center">
                <p className="text-center">
                  {invoice.length > 30
                    ? `${invoice.substring(0, 10)}...${invoice.substring(
                        invoice.length - 10,
                        invoice.length
                      )}`
                    : invoice}
                </p>
                <ClipboardIcon
                  onClick={handleCopyInvoice}
                  className="w-4 h-4 cursor-pointer ml-2"
                />
              </div>
            </ModalBody>
          ) : (
            <ModalBody className="flex flex-col items-center justify-center">
              <h3 className="text-center text-lg leading-6 font-medium text-gray-900 mt-3">
                Payment confirmed!
              </h3>
              <Image
                alt="Payment Confirmed"
                className="object-cover"
                src="../payment-confirmed.gif"
                width={350}
              />
            </ModalBody>
          )}

          <ModalFooter
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            {confirmActionDropdown(
              <Button color="danger" variant="light">
                Cancel
              </Button>,
              "Are you sure you want to cancel?",
              "Cancel",
              () => setCheckout(false)
            )}
          </ModalFooter>
        </ModalContent>
      </Modal>
      <Modal
        backdrop="blur"
        isOpen={enterPassphrase}
        onClose={() => setEnterPassphrase(false)}
        classNames={{
          body: "py-6",
          backdrop: "bg-[#292f46]/50 backdrop-opacity-60",
          // base: "border-[#292f46] bg-[#19172c] dark:bg-[#19172c] text-[#a8b0d3]",
          header: "border-b-[1px] border-[#292f46]",
          footer: "border-t-[1px] border-[#292f46]",
          closeButton: "hover:bg-black/5 active:bg-white/10",
        }}
        scrollBehavior={"outside"}
        size="2xl"
      >
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1">
            Enter Passphrase
          </ModalHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmitPassphrase();
            }}
          >
            <ModalBody>
              {signIn === "nsec" && (
                <Input
                  autoFocus
                  ref={passphraseInputRef}
                  variant="flat"
                  label="Passphrase"
                  labelPlacement="inside"
                  onChange={(e) => setPassphrase(e.target.value)}
                  value={passphrase}
                />
              )}
            </ModalBody>

            <ModalFooter>
              {confirmActionDropdown(
                <Button color="danger" variant="light">
                  Cancel
                </Button>,
                "Are you sure you want to cancel?",
                "Cancel",
                cancel
              )}

              <Button
                className={buttonClassName}
                type="submit"
                onClick={(e) => {
                  if (
                    isButtonDisabled &&
                    signIn === "nsec" &&
                    passphraseInputRef.current
                  ) {
                    e.preventDefault();
                    passphraseInputRef.current.focus();
                  }
                }}
              >
                Submit
              </Button>
            </ModalFooter>
          </form>
        </ModalContent>
      </Modal>
    </div>
  );
};

export default DisplayProduct;
