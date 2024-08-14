//TODO: perhaps see if we can abstract away some payment logic into reusable functions
import React, { useContext, useState, useEffect } from "react";
import {
  ProfileMapContext,
  CashuWalletContext,
} from "../utils/context/context";
import { useRouter } from "next/router";
import { useForm, Controller } from "react-hook-form";
import {
  Button,
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  Divider,
  Image,
  Input,
  useDisclosure,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Select,
  SelectItem,
  Textarea,
} from "@nextui-org/react";
import axios from "axios";
import {
  BanknotesIcon,
  BoltIcon,
  CheckIcon,
  ClipboardIcon,
  EnvelopeIcon,
} from "@heroicons/react/24/outline";
import { fiat } from "@getalby/lightning-tools";
import {
  CashuMint,
  CashuWallet,
  getEncodedToken,
  Proof,
} from "@cashu/cashu-ts";
import {
  getLocalStorageData,
  validPassphrase,
  isUserLoggedIn,
  publishWalletEvent,
  publishProofEvent,
  publishSpendingHistoryEvent,
} from "./utility/nostr-helper-functions";
import { nip19 } from "nostr-tools";
import { ProductData } from "./utility/product-parser-functions";
import {
  DisplayCostBreakdown,
  formatWithCommas,
} from "./utility-components/display-monetary-info";
import { SHOPSTRBUTTONCLASSNAMES } from "./utility/STATIC-VARIABLES";
import {
  captureCashuPaidMetric,
  captureInvoicePaidmetric,
} from "./utility/metrics-helper-functions";
import SignInModal from "./sign-in/SignInModal";
import CountryDropdown from "./utility-components/dropdowns/country-dropdown";
import currencySelection from "../public/currencySelection.json";
import RequestPassphraseModal from "@/components/utility-components/request-passphrase-modal";

export default function InvoiceCard({
  productData,
  setInvoiceIsPaid,
  setInvoiceGenerationFailed,
  setCashuPaymentSent,
  setCashuPaymentFailed,
}: {
  productData: ProductData;
  setInvoiceIsPaid?: (invoiceIsPaid: boolean) => void;
  setInvoiceGenerationFailed?: (invoiceGenerationFailed: boolean) => void;
  setCashuPaymentSent?: (cashuPaymentSent: boolean) => void;
  setCashuPaymentFailed?: (cashuPaymentFailef: boolean) => void;
}) {
  const router = useRouter();
  const { id, pubkey, currency, totalCost, shippingType } = productData;
  const pubkeyOfProductBeingSold = pubkey;
  const { signInMethod, userNPub, userPubkey, relays, mints, tokens, history } =
    getLocalStorageData();

  const [enterPassphrase, setEnterPassphrase] = useState(false);
  const [passphrase, setPassphrase] = useState("");

  const [showInvoiceCard, setShowInvoiceCard] = useState(false);

  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [invoice, setInvoice] = useState("");
  const [copiedToClipboard, setCopiedToClipboard] = useState(false);

  const [name, setName] = useState("");
  const profileContext = useContext(ProfileMapContext);
  const walletContext = useContext(CashuWalletContext);
  const [dTag, setDTag] = useState("");

  const [randomNpub, setRandomNpub] = useState<string>("");
  const [randomNsec, setRandomNsec] = useState<string>("");

  const { isOpen, onOpen, onClose } = useDisclosure();

  const [showShippingModal, setShowShippingModal] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  const [showShippingOption, setShowShippingOption] = useState(false);
  const [isCashuPayment, setIsCashuPayment] = useState(false);

  const {
    handleSubmit: handleShippingSubmit,
    formState: shippingFormState,
    control: shippingControl,
    reset: shippingReset,
  } = useForm();

  const {
    handleSubmit: handleContactSubmit,
    formState: contactFormState,
    control: contactControl,
    reset: contactReset,
  } = useForm();

  useEffect(() => {
    if (signInMethod === "nsec" && !validPassphrase(passphrase)) {
      setEnterPassphrase(true);
    }
  }, [signInMethod, passphrase]);

  useEffect(() => {
    axios({
      method: "GET",
      url: "/api/nostr/generate-keys",
    })
      .then((response) => {
        setRandomNpub(response.data.npub);
        setRandomNsec(response.data.nsec);
      })
      .catch((error) => {
        console.error(error);
      });
  }, []);

  useEffect(() => {
    const profileMap = profileContext.profileData;
    const profile = profileMap.has(userPubkey)
      ? profileMap.get(userPubkey)
      : undefined;
    setName(profile && profile.content.name ? profile.content.name : userNPub);
  }, [profileContext]);

  useEffect(() => {
    const walletEvent = walletContext.mostRecentWalletEvent;
    if (walletEvent?.tags) {
      const walletTag = walletEvent.tags.find(
        (tag: string[]) => tag[0] === "d",
      )?.[1];
      setDTag(walletTag);
    }
  }, [walletContext]);

  const onShippingSubmit = async (data: { [x: string]: any }) => {
    let shippingName = data["Name"];
    let shippingAddress = data["Address"];
    let shippingUnitNo = data["Unit"];
    let shippingCity = data["City"];
    let shippingPostalCode = data["Postal Code"];
    let shippingState = data["State/Province"];
    let shippingCountry = data["Country"];
    setShowShippingModal(false);
    if (isCashuPayment) {
      await handleCashuPayment(
        shippingName,
        shippingAddress,
        shippingUnitNo,
        shippingCity,
        shippingPostalCode,
        shippingState,
        shippingCountry,
      );
    } else {
      await handleLightningPayment(
        shippingName,
        shippingAddress,
        shippingUnitNo,
        shippingCity,
        shippingPostalCode,
        shippingState,
        shippingCountry,
      );
    }
  };

  const onContactSubmit = async (data: { [x: string]: any }) => {
    let contact = data["Contact"];
    let contactType = data["Contact Type"];
    let contactInstructions = data["Instructions"];
    setShowContactModal(false);
    if (isCashuPayment) {
      await handleCashuPayment(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        contact,
        contactType,
        contactInstructions,
      );
    } else {
      await handleLightningPayment(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        contact,
        contactType,
        contactInstructions,
      );
    }
  };

  const handleToggleShippingModal = () => {
    shippingReset();
    setShowShippingModal(!showShippingModal);
  };

  const handleToggleContactModal = () => {
    contactReset();
    setShowContactModal(!showContactModal);
  };

  const handleLightningPayment = async (
    shippingName?: string,
    shippingAddress?: string,
    shippingUnitNo?: string,
    shippingCity?: string,
    shippingPostalCode?: string,
    shippingState?: string,
    shippingCountry?: string,
    contact?: string,
    contactType?: string,
    contactInstructions?: string,
  ) => {
    try {
      setShowInvoiceCard(true);
      let newPrice = totalCost;
      const wallet = new CashuWallet(new CashuMint(mints[0]));
      if (!currencySelection.hasOwnProperty(currency)) {
        throw new Error(`${currency} is not a supported currency.`);
      } else if (
        currencySelection.hasOwnProperty(currency) &&
        currency.toLowerCase() !== "sats" &&
        currency.toLowerCase() !== "sat"
      ) {
        try {
          const currencyData = { amount: newPrice, currency: currency };
          const numSats = await fiat.getSatoshiValue(currencyData);
          newPrice = Math.round(numSats);
        } catch (err) {
          console.error("ERROR", err);
        }
      } else if (currency.toLowerCase() === "btc") {
        newPrice = newPrice * 100000000;
      }

      if (newPrice < 1) {
        throw new Error("Listing price is less than 1 sat.");
      }

      const invoiceMinted = await axios.post("/api/cashu/request-mint", {
        mintUrl: mints[0],
        total: newPrice,
        currency,
      });

      const { id, pr, hash } = invoiceMinted.data;

      setInvoice(pr);

      const QRCode = require("qrcode");

      QRCode.toDataURL(pr)
        .then((url: string) => {
          setQrCodeUrl(url);
        })
        .catch((err: any) => {
          console.error("ERROR", err);
        });

      invoiceHasBeenPaid(
        wallet,
        newPrice,
        hash,
        id,
        shippingName ? shippingName : undefined,
        shippingAddress ? shippingAddress : undefined,
        shippingUnitNo ? shippingUnitNo : undefined,
        shippingCity ? shippingCity : undefined,
        shippingPostalCode ? shippingPostalCode : undefined,
        shippingState ? shippingState : undefined,
        shippingCountry ? shippingCountry : undefined,
        contact ? contact : undefined,
        contactType ? contactType : undefined,
        contactInstructions ? contactInstructions : undefined,
      );
    } catch (error) {
      console.error(error);
      if (setInvoiceGenerationFailed) {
        setInvoiceGenerationFailed(true);
        setShowInvoiceCard(false);
        setInvoice("");
        setQrCodeUrl(null);
      }
    }
  };

  /** CHECKS WHETHER INVOICE HAS BEEN PAID */
  async function invoiceHasBeenPaid(
    wallet: CashuWallet,
    newPrice: number,
    hash: string,
    metricsInvoiceId: string,
    shippingName?: string,
    shippingAddress?: string,
    shippingUnitNo?: string,
    shippingCity?: string,
    shippingPostalCode?: string,
    shippingState?: string,
    shippingCountry?: string,
    contact?: string,
    contactType?: string,
    contactInstructions?: string,
  ) {
    let encoded;

    while (true) {
      try {
        const { proofs } = await wallet.requestTokens(newPrice, hash);

        // Encoded proofs can be spent at the mint
        encoded = getEncodedToken({
          token: [
            {
              mint: mints[0],
              proofs,
            },
          ],
        });

        if (encoded) {
          sendTokens(
            encoded,
            shippingName ? shippingName : undefined,
            shippingAddress ? shippingAddress : undefined,
            shippingUnitNo ? shippingUnitNo : undefined,
            shippingCity ? shippingCity : undefined,
            shippingPostalCode ? shippingPostalCode : undefined,
            shippingState ? shippingState : undefined,
            shippingCountry ? shippingCountry : undefined,
            contact ? contact : undefined,
            contactType ? contactType : undefined,
            contactInstructions ? contactInstructions : undefined,
          );
          captureInvoicePaidmetric(metricsInvoiceId, productData);
          setPaymentConfirmed(true);
          setQrCodeUrl(null);
          if (setInvoiceIsPaid) {
            setInvoiceIsPaid(true);
          }
          break;
        }
      } catch (error) {
        console.error(error);

        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  }

  const sendTokens = async (
    token: string,
    shippingName?: string,
    shippingAddress?: string,
    shippingUnitNo?: string,
    shippingCity?: string,
    shippingPostalCode?: string,
    shippingState?: string,
    shippingCountry?: string,
    contact?: string,
    contactType?: string,
    contactInstructions?: string,
  ) => {
    const { title } = productData;
    const decryptedRandomNpub = nip19.decode(randomNpub);
    const decryptedRandomNsec = nip19.decode(randomNsec);
    const paymentMessage =
      "This is a Cashu token payment from " +
      name +
      " for your " +
      title +
      " listing on Shopstr: " +
      token;
    axios({
      method: "POST",
      url: "/api/nostr/post-event",
      headers: {
        "Content-Type": "application/json",
      },
      data: {
        pubkey: decryptedRandomNpub.data,
        privkey: decryptedRandomNsec.data,
        created_at: Math.floor(Date.now() / 1000),
        kind: 4,
        tags: [["p", pubkeyOfProductBeingSold]],
        content: paymentMessage,
        relays: relays,
      },
    });
    if (
      shippingName &&
      shippingAddress &&
      shippingUnitNo &&
      shippingCity &&
      shippingPostalCode &&
      shippingState &&
      shippingCountry
    ) {
      let contactMessage;
      if (!shippingUnitNo) {
        contactMessage =
          "Please ship the product to " +
          shippingName +
          " at " +
          shippingAddress +
          ", " +
          shippingCity +
          ", " +
          shippingPostalCode +
          ", " +
          shippingState +
          ", " +
          shippingCountry +
          ".";
      } else {
        contactMessage =
          "Please ship the product to " +
          shippingName +
          " at " +
          shippingAddress +
          " " +
          shippingUnitNo +
          ", " +
          shippingCity +
          ", " +
          shippingPostalCode +
          ", " +
          shippingState +
          ", " +
          shippingCountry +
          ".";
      }
      axios({
        method: "POST",
        url: "/api/nostr/post-event",
        headers: {
          "Content-Type": "application/json",
        },
        data: {
          pubkey: decryptedRandomNpub.data,
          privkey: decryptedRandomNsec.data,
          created_at: Math.floor(Date.now() / 1000),
          kind: 4,
          tags: [["p", pubkeyOfProductBeingSold]],
          content: contactMessage,
          relays: relays,
        },
      });
    } else if (contact && contactType && contactInstructions) {
      const contactMessage =
        "To finalize the sale of your " +
        title +
        " listing on Shopstr, please contact " +
        contact +
        " over " +
        contactType +
        " using the following instructions: " +
        contactInstructions;
      axios({
        method: "POST",
        url: "/api/nostr/post-event",
        headers: {
          "Content-Type": "application/json",
        },
        data: {
          pubkey: decryptedRandomNpub.data,
          privkey: decryptedRandomNsec.data,
          created_at: Math.floor(Date.now() / 1000),
          kind: 4,
          tags: [["p", pubkeyOfProductBeingSold]],
          content: contactMessage,
          relays: relays,
        },
      });
    }
  };

  const handleCopyInvoice = () => {
    navigator.clipboard.writeText(invoice);
    setCopiedToClipboard(true);
    // after 2 seconds, set copiedToClipboard back to false
    setTimeout(() => {
      setCopiedToClipboard(false);
    }, 2000);
  };

  const handleSendMessage = (pubkeyToOpenChatWith: string) => {
    let { signInMethod } = getLocalStorageData();
    if (!signInMethod) {
      onOpen();
      return;
    }
    router.push({
      pathname: "/messages",
      query: { pk: nip19.npubEncode(pubkeyToOpenChatWith) },
    });
  };

  const formattedTotalCost = formatWithCommas(totalCost, currency);

  const handleCashuPayment = async (
    shippingName?: string,
    shippingAddress?: string,
    shippingUnitNo?: string,
    shippingCity?: string,
    shippingPostalCode?: string,
    shippingState?: string,
    shippingCountry?: string,
    contact?: string,
    contactType?: string,
    contactInstructions?: string,
  ) => {
    try {
      let price = totalCost;
      const mint = new CashuMint(mints[0]);
      const wallet = new CashuWallet(mint);
      if (!currencySelection.hasOwnProperty(currency)) {
        throw new Error(`${currency} is not a supported currency.`);
      } else if (
        currencySelection.hasOwnProperty(currency) &&
        currency.toLowerCase() !== "sats" &&
        currency.toLowerCase() !== "sat"
      ) {
        try {
          const currencyData = { amount: price, currency: currency };
          const numSats = await fiat.getSatoshiValue(currencyData);
          price = Math.round(numSats);
        } catch (err) {
          console.error("ERROR", err);
        }
      } else if (currency.toLowerCase() === "btc") {
        price = price * 100000000;
      }
      if (price < 1) {
        throw new Error("Listing price is less than 1 sat.");
      }
      const mintKeySetResponse = await mint.getKeySets();
      const mintKeySetIds = mintKeySetResponse?.keysets;
      const filteredProofs = tokens.filter(
        (p: Proof) => mintKeySetIds?.includes(p.id),
      );
      const tokenToSend = await wallet.send(price, filteredProofs);
      const encodedSendToken = getEncodedToken({
        token: [
          {
            mint: mints[0],
            proofs: tokenToSend.send,
          },
        ],
      });
      sendTokens(
        encodedSendToken,
        shippingName ? shippingName : undefined,
        shippingAddress ? shippingAddress : undefined,
        shippingUnitNo ? shippingUnitNo : undefined,
        shippingCity ? shippingCity : undefined,
        shippingPostalCode ? shippingPostalCode : undefined,
        shippingState ? shippingState : undefined,
        shippingCountry ? shippingCountry : undefined,
        contact ? contact : undefined,
        contactType ? contactType : undefined,
        contactInstructions ? contactInstructions : undefined,
      )
        .then(() => {
          captureCashuPaidMetric(productData);
        })
        .catch(console.log);
      const changeProofs = tokenToSend?.returnChange;
      const remainingProofs = tokens.filter(
        (p: Proof) => !mintKeySetIds?.includes(p.id),
      );
      let proofArray;
      if (changeProofs.length >= 1 && changeProofs) {
        proofArray = [...remainingProofs, ...changeProofs];
      } else {
        proofArray = [...remainingProofs];
      }
      localStorage.setItem("tokens", JSON.stringify(proofArray));
      localStorage.setItem(
        "history",
        JSON.stringify([
          { type: 5, amount: price, date: Math.floor(Date.now() / 1000) },
          ...history,
        ]),
      );
      const eventIds = walletContext.proofEvents.map((event) => event.id);
      await publishSpendingHistoryEvent(
        "out",
        String(price),
        eventIds,
        passphrase,
        dTag,
      );
      if (changeProofs && changeProofs.length > 0) {
        await publishProofEvent(mints[0], changeProofs, "in", passphrase, dTag);
      }
      await publishWalletEvent(passphrase, dTag);
      if (setCashuPaymentSent) {
        setCashuPaymentSent(true);
      }
    } catch (error) {
      console.error(error);
      if (setCashuPaymentFailed) {
        setCashuPaymentFailed(true);
      }
    }
  };

  return (
    <>
      {!showInvoiceCard && (
        <>
          <Button
            type="submit"
            className={SHOPSTRBUTTONCLASSNAMES + " mt-3"}
            onClick={() => {
              handleSendMessage(pubkeyOfProductBeingSold);
            }}
            startContent={
              <EnvelopeIcon className="h-6 w-6 hover:text-yellow-500" />
            }
          >
            Message
          </Button>
          <Button
            type="submit"
            className={SHOPSTRBUTTONCLASSNAMES + " mt-3"}
            onClick={() => {
              if (randomNsec !== "") {
                if (shippingType === "Free" || shippingType === "Added Cost") {
                  setIsCashuPayment(false);
                  handleToggleShippingModal();
                } else if (
                  shippingType === "N/A" ||
                  shippingType === "Pickup"
                ) {
                  setIsCashuPayment(false);
                  handleToggleContactModal();
                } else if (shippingType === "Free/Pickup") {
                  setIsCashuPayment(false);
                  setShowShippingOption(true);
                } else {
                  setIsCashuPayment(false);
                  handleToggleContactModal();
                }
              }
            }}
            startContent={
              <BoltIcon className="h-6 w-6 hover:text-yellow-500" />
            }
          >
            Pay with Lightning: {formattedTotalCost}
          </Button>
          <Button
            type="submit"
            className={SHOPSTRBUTTONCLASSNAMES + " mt-3"}
            onClick={() => {
              let userLoggedIn = isUserLoggedIn();
              if (!userLoggedIn) {
                onOpen();
                return;
              }
              if (randomNsec !== "") {
                if (shippingType === "Free" || shippingType === "Added Cost") {
                  setIsCashuPayment(true);
                  handleToggleShippingModal();
                } else if (
                  shippingType === "N/A" ||
                  shippingType === "Pickup"
                ) {
                  setIsCashuPayment(true);
                  handleToggleContactModal();
                } else if (shippingType === "Free/Pickup") {
                  setIsCashuPayment(true);
                  setShowShippingOption(true);
                } else {
                  setIsCashuPayment(true);
                  handleToggleContactModal();
                }
              }
            }}
            startContent={
              <BanknotesIcon className="h-6 w-6 hover:text-yellow-500" />
            }
          >
            Pay with Cashu: {formattedTotalCost}
          </Button>
        </>
      )}
      {showInvoiceCard && (
        <Card className="mt-3 max-w-[700px]">
          <CardHeader className="flex justify-center gap-3">
            <span className="text-xl font-bold">Lightning Invoice</span>
          </CardHeader>
          <Divider />
          <CardBody className="flex flex-col items-center">
            <DisplayCostBreakdown monetaryInfo={productData} />
          </CardBody>
          <CardFooter className="flex flex-col items-center">
            {!paymentConfirmed ? (
              <div className="flex flex-col items-center justify-center">
                {qrCodeUrl ? (
                  <>
                    <Image
                      alt="Lightning invoice"
                      className="object-cover"
                      src={qrCodeUrl}
                    />
                    <div className="flex items-center justify-center">
                      <p className="text-center">
                        {invoice.length > 30
                          ? `${invoice.substring(0, 10)}...${invoice.substring(
                              invoice.length - 10,
                              invoice.length,
                            )}`
                          : invoice}
                      </p>
                      <ClipboardIcon
                        onClick={handleCopyInvoice}
                        className={`ml-2 h-4 w-4 cursor-pointer ${
                          copiedToClipboard ? "hidden" : ""
                        }`}
                      />
                      <CheckIcon
                        className={`ml-2 h-4 w-4 cursor-pointer ${
                          copiedToClipboard ? "" : "hidden"
                        }`}
                      />
                    </div>
                  </>
                ) : (
                  <div>
                    <p>Waiting for lightning invoice...</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center">
                <h3 className="mt-3 text-center text-lg font-medium leading-6 text-gray-900">
                  Payment confirmed!
                </h3>
                <Image
                  alt="Payment Confirmed"
                  className="object-cover"
                  src="../payment-confirmed.gif"
                  width={350}
                />
              </div>
            )}
          </CardFooter>
        </Card>
      )}
      <Modal
        backdrop="blur"
        isOpen={showShippingOption}
        onClose={() => {
          setShowShippingOption(false);
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
            Select your delivery option:
          </ModalHeader>
          <ModalBody className="flex flex-col overflow-hidden text-light-text dark:text-dark-text">
            <div className="flex items-center justify-center">
              <Select label="Delivery Method" className="max-w-xs">
                <SelectItem
                  key="free"
                  onClick={() => {
                    handleToggleShippingModal();
                    setShowShippingOption(false);
                  }}
                >
                  Free shipping
                </SelectItem>
                <SelectItem
                  key="pickup"
                  onClick={() => {
                    handleToggleContactModal();
                    setShowShippingOption(false);
                  }}
                >
                  Pickup
                </SelectItem>
              </Select>
            </div>
          </ModalBody>
        </ModalContent>
      </Modal>
      <Modal
        backdrop="blur"
        isOpen={showShippingModal}
        onClose={handleToggleShippingModal}
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
          <ModalHeader className="flex flex-col gap-1 text-light-text dark:text-dark-text">
            Enter Shipping Info
          </ModalHeader>
          <form onSubmit={handleShippingSubmit(onShippingSubmit)}>
            <ModalBody>
              <Controller
                name="Name"
                control={shippingControl}
                rules={{
                  required: "A name is required.",
                  maxLength: {
                    value: 50,
                    message: "This input exceed maxLength of 50.",
                  },
                }}
                render={({
                  field: { onChange, onBlur, value },
                  fieldState: { error },
                }) => {
                  let isErrored = error !== undefined;
                  let errorMessage: string = error?.message
                    ? error.message
                    : "";
                  return (
                    <Input
                      className="text-light-text dark:text-dark-text"
                      autoFocus
                      variant="bordered"
                      fullWidth={true}
                      label="Name"
                      labelPlacement="inside"
                      isInvalid={isErrored}
                      errorMessage={errorMessage}
                      // controller props
                      onChange={onChange} // send value to hook form
                      onBlur={onBlur} // notify when input is touched/blur
                      value={value}
                    />
                  );
                }}
              />

              <Controller
                name="Address"
                control={shippingControl}
                rules={{
                  required: "An address is required.",
                  maxLength: {
                    value: 50,
                    message: "This input exceed maxLength of 50.",
                  },
                }}
                render={({
                  field: { onChange, onBlur, value },
                  fieldState: { error },
                }) => {
                  let isErrored = error !== undefined;
                  let errorMessage: string = error?.message
                    ? error.message
                    : "";
                  return (
                    <Input
                      className="text-light-text dark:text-dark-text"
                      autoFocus
                      variant="bordered"
                      fullWidth={true}
                      label="Address"
                      labelPlacement="inside"
                      isInvalid={isErrored}
                      errorMessage={errorMessage}
                      // controller props
                      onChange={onChange} // send value to hook form
                      onBlur={onBlur} // notify when input is touched/blur
                      value={value}
                    />
                  );
                }}
              />

              <Controller
                name="Unit"
                control={shippingControl}
                rules={{
                  maxLength: {
                    value: 50,
                    message: "This input exceed maxLength of 50.",
                  },
                }}
                render={({
                  field: { onChange, onBlur, value },
                  fieldState: { error },
                }) => {
                  let isErrored = error !== undefined;
                  let errorMessage: string = error?.message
                    ? error.message
                    : "";
                  return (
                    <Input
                      className="text-light-text dark:text-dark-text"
                      autoFocus
                      variant="bordered"
                      fullWidth={true}
                      label="Apt, suite, unit, etc."
                      labelPlacement="inside"
                      isInvalid={isErrored}
                      errorMessage={errorMessage}
                      // controller props
                      onChange={onChange} // send value to hook form
                      onBlur={onBlur} // notify when input is touched/blur
                      value={value}
                    />
                  );
                }}
              />

              <Controller
                name="City"
                control={shippingControl}
                rules={{
                  required: "A city is required.",
                  maxLength: {
                    value: 50,
                    message: "This input exceed maxLength of 50.",
                  },
                }}
                render={({
                  field: { onChange, onBlur, value },
                  fieldState: { error },
                }) => {
                  let isErrored = error !== undefined;
                  let errorMessage: string = error?.message
                    ? error.message
                    : "";
                  return (
                    <Input
                      className="text-light-text dark:text-dark-text"
                      autoFocus
                      variant="bordered"
                      fullWidth={true}
                      label="City"
                      labelPlacement="inside"
                      isInvalid={isErrored}
                      errorMessage={errorMessage}
                      // controller props
                      onChange={onChange} // send value to hook form
                      onBlur={onBlur} // notify when input is touched/blur
                      value={value}
                    />
                  );
                }}
              />

              <Controller
                name="Postal Code"
                control={shippingControl}
                rules={{
                  required: "A postal code is required.",
                  maxLength: {
                    value: 50,
                    message: "This input exceed maxLength of 50.",
                  },
                }}
                render={({
                  field: { onChange, onBlur, value },
                  fieldState: { error },
                }) => {
                  let isErrored = error !== undefined;
                  let errorMessage: string = error?.message
                    ? error.message
                    : "";
                  return (
                    <Input
                      className="text-light-text dark:text-dark-text"
                      autoFocus
                      variant="bordered"
                      fullWidth={true}
                      label="Postal code"
                      labelPlacement="inside"
                      isInvalid={isErrored}
                      errorMessage={errorMessage}
                      // controller props
                      onChange={onChange} // send value to hook form
                      onBlur={onBlur} // notify when input is touched/blur
                      value={value}
                    />
                  );
                }}
              />

              <Controller
                name="State/Province"
                control={shippingControl}
                rules={{
                  required: "A state/province is required.",
                }}
                render={({
                  field: { onChange, onBlur, value },
                  fieldState: { error },
                }) => {
                  let isErrored = error !== undefined;
                  let errorMessage: string = error?.message
                    ? error.message
                    : "";
                  return (
                    <Input
                      className="text-light-text dark:text-dark-text"
                      autoFocus
                      variant="bordered"
                      fullWidth={true}
                      label="State/Province"
                      labelPlacement="inside"
                      isInvalid={isErrored}
                      errorMessage={errorMessage}
                      // controller props
                      onChange={onChange} // send value to hook form
                      onBlur={onBlur} // notify when input is touched/blur
                      value={value}
                    />
                  );
                }}
              />

              <Controller
                name="Country"
                control={shippingControl}
                rules={{
                  required: "A country is required.",
                }}
                render={({
                  field: { onChange, onBlur, value },
                  fieldState: { error },
                }) => {
                  let isErrored = error !== undefined;
                  let errorMessage: string = error?.message
                    ? error.message
                    : "";
                  return (
                    <CountryDropdown
                      autoFocus
                      variant="bordered"
                      aria-label="Select Country"
                      label="Country"
                      labelPlacement="inside"
                      isInvalid={isErrored}
                      errorMessage={errorMessage}
                      // controller props
                      onChange={onChange} // send value to hook form
                      onBlur={onBlur} // notify when input is touched/blur
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
                onClick={handleToggleShippingModal}
              >
                Cancel
              </Button>

              <Button className={SHOPSTRBUTTONCLASSNAMES} type="submit">
                Submit
              </Button>
            </ModalFooter>
          </form>
        </ModalContent>
      </Modal>

      <Modal
        backdrop="blur"
        isOpen={showContactModal}
        onClose={handleToggleContactModal}
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
          <ModalHeader className="flex flex-col gap-1 text-light-text dark:text-dark-text">
            Enter Contact Info
          </ModalHeader>
          <form onSubmit={handleContactSubmit(onContactSubmit)}>
            <ModalBody>
              <Controller
                name="Contact"
                control={contactControl}
                rules={{
                  required: "A contact is required.",
                  maxLength: {
                    value: 50,
                    message: "This input exceed maxLength of 50.",
                  },
                }}
                render={({
                  field: { onChange, onBlur, value },
                  fieldState: { error },
                }) => {
                  let isErrored = error !== undefined;
                  let errorMessage: string = error?.message
                    ? error.message
                    : "";
                  return (
                    <Input
                      className="text-light-text dark:text-dark-text"
                      autoFocus
                      variant="bordered"
                      fullWidth={true}
                      label="Contact"
                      labelPlacement="inside"
                      placeholder="shopstr@shopstr.store"
                      isInvalid={isErrored}
                      errorMessage={errorMessage}
                      // controller props
                      onChange={onChange} // send value to hook form
                      onBlur={onBlur} // notify when input is touched/blur
                      value={value}
                    />
                  );
                }}
              />

              <Controller
                name="Contact Type"
                control={contactControl}
                rules={{
                  required: "A contact type is required.",
                  maxLength: {
                    value: 50,
                    message: "This input exceed maxLength of 50.",
                  },
                }}
                render={({
                  field: { onChange, onBlur, value },
                  fieldState: { error },
                }) => {
                  let isErrored = error !== undefined;
                  let errorMessage: string = error?.message
                    ? error.message
                    : "";
                  return (
                    <Input
                      className="text-light-text dark:text-dark-text"
                      autoFocus
                      variant="bordered"
                      fullWidth={true}
                      label="Contact type"
                      labelPlacement="inside"
                      placeholder="Nostr, Signal, Telegram, email, phone, etc."
                      isInvalid={isErrored}
                      errorMessage={errorMessage}
                      // controller props
                      onChange={onChange} // send value to hook form
                      onBlur={onBlur} // notify when input is touched/blur
                      value={value}
                    />
                  );
                }}
              />

              <Controller
                name="Instructions"
                control={contactControl}
                rules={{
                  required: "Delivery instructions are required.",
                }}
                render={({
                  field: { onChange, onBlur, value },
                  fieldState: { error },
                }) => {
                  let isErrored = error !== undefined;
                  let errorMessage: string = error?.message
                    ? error.message
                    : "";
                  return (
                    <Textarea
                      className="text-light-text dark:text-dark-text"
                      variant="bordered"
                      fullWidth={true}
                      label="Delivery instructions"
                      labelPlacement="inside"
                      placeholder="Meet me by . . .; Send file to . . ."
                      isInvalid={isErrored}
                      errorMessage={errorMessage}
                      // controller props
                      onChange={onChange} // send value to hook form
                      onBlur={onBlur} // notify when input is touched/blur
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
                onClick={handleToggleContactModal}
              >
                Cancel
              </Button>

              <Button className={SHOPSTRBUTTONCLASSNAMES} type="submit">
                Submit
              </Button>
            </ModalFooter>
          </form>
        </ModalContent>
      </Modal>
      <SignInModal isOpen={isOpen} onClose={onClose} />
      <RequestPassphraseModal
        passphrase={passphrase}
        setCorrectPassphrase={setPassphrase}
        isOpen={enterPassphrase}
        setIsOpen={setEnterPassphrase}
        onCancelRouteTo={`/${id}`}
      />
    </>
  );
}
