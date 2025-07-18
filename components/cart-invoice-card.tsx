import React, { useContext, useState, useEffect, useMemo } from "react";
import { useRouter } from "next/router";
import {
  CashuWalletContext,
  ChatsContext,
  ProfileMapContext,
} from "../utils/context/context";
import { useForm } from "react-hook-form";
import {
  Button,
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  Divider,
  Image,
  useDisclosure,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  Select,
  SelectItem,
} from "@nextui-org/react";
import {
  BanknotesIcon,
  BoltIcon,
  CheckIcon,
  ClipboardIcon,
  CheckCircleIcon,
  CurrencyDollarIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import {
  CashuMint,
  CashuWallet,
  getEncodedToken,
  Proof,
  MintKeyset,
} from "@cashu/cashu-ts";
import {
  constructGiftWrappedEvent,
  constructMessageSeal,
  constructMessageGiftWrap,
  sendGiftWrappedMessageEvent,
  generateKeys,
  getLocalStorageData,
  publishProofEvent,
} from "@/utils/nostr/nostr-helper-functions";
import { addChatMessagesToCache } from "@/utils/nostr/cache-service";
import { LightningAddress } from "@getalby/lightning-tools";
import QRCode from "qrcode";
import { v4 as uuidv4 } from "uuid";
import { nip19 } from "nostr-tools";
import { ProductData } from "@/utils/parsers/product-parser-functions";
import {
  DisplayCostBreakdown,
  formatWithCommas,
} from "./utility-components/display-monetary-info";
import { SHOPSTRBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";
import SignInModal from "./sign-in/SignInModal";
import FailureModal from "@/components/utility-components/failure-modal";
import ShippingForm from "./shipping-form";
import ContactForm from "./contact-form";
import CombinedContactForm from "./combined-contact-form";
import {
  NostrContext,
  SignerContext,
} from "@/components/utility-components/nostr-context-provider";
import {
  ShippingFormData,
  ContactFormData,
  CombinedFormData,
} from "@/utils/types/types";

export default function CartInvoiceCard({
  products,
  quantities,
  shippingTypes,
  totalCostsInSats,
  subtotal,
  totalShippingCost,
  totalCost,
}: {
  products: ProductData[];
  quantities: { [key: string]: number };
  shippingTypes: { [key: string]: string };
  totalCostsInSats: { [key: string]: number };
  subtotal: number;
  totalShippingCost: number;
  totalCost: number;
}) {
  const { mints, tokens, history } = getLocalStorageData();
  const router = useRouter();

  const chatsContext = useContext(ChatsContext);
  const profileContext = useContext(ProfileMapContext);
  const { nostr } = useContext(NostrContext);
  const { signer, isLoggedIn: userLoggedIn } = useContext(SignerContext);

  const [showInvoiceCard, setShowInvoiceCard] = useState(false);

  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [invoice, setInvoice] = useState("");
  const [copiedToClipboard, setCopiedToClipboard] = useState(false);

  const [fiatOrderIsPlaced, setFiatOrderIsPlaced] = useState(false);

  const walletContext = useContext(CashuWalletContext);

  const { isOpen, onOpen, onClose } = useDisclosure();

  const [showShippingModal, setShowShippingModal] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  const [showCombinedModal, setShowCombinedModal] = useState(false);
  const [showShippingOption, setShowShippingOption] = useState(false);
  const [isCashuPayment, setIsCashuPayment] = useState(false);
  const [isFiatPayment, setIsFiatPayment] = useState(false);

  const [invoiceIsPaid, setInvoiceIsPaid] = useState(false);
  const [invoiceGenerationFailed, setInvoiceGenerationFailed] = useState(false);
  const [cashuPaymentSent, setCashuPaymentSent] = useState(false);
  const [cashuPaymentFailed, setCashuPaymentFailed] = useState(false);

  const [showPurchaseTypeOption, setShowPurchaseTypeOption] = useState(false);
  const [needsShippingInfo, setNeedsShippingInfo] = useState(false);
  const [needsCombinedInfo, setNeedsCombinedInfo] = useState(false);

  const [fiatPaymentOptions, setFiatPaymentOptions] = useState([]);
  const [showFiatTypeOption, setShowFiatTypeOption] = useState(false);
  const [selectedFiatOption, setSelectedFiatOption] = useState("");

  const [showFailureModal, setShowFailureModal] = useState(false);
  const [failureText, setFailureText] = useState("");
  const [requiredInfo, setRequiredInfo] = useState("");

  useEffect(() => {
    if (products && products.length > 0) {
      const requiredFields = products
        .map((product) => product.required)
        .filter((field) => field)
        .join(", ");
      setRequiredInfo(requiredFields);
    }
  }, [products]);

  const uniqueShippingTypes = useMemo(() => {
    return Array.from(new Set(Object.values(shippingTypes)));
  }, [shippingTypes]);

  const {
    handleSubmit: handleShippingSubmit,
    control: shippingControl,
    reset: shippingReset,
  } = useForm();

  const {
    handleSubmit: handleContactSubmit,
    control: contactControl,
    reset: contactReset,
  } = useForm();

  const {
    handleSubmit: handleCombinedSubmit,
    control: combinedControl,
    reset: combinedReset,
  } = useForm();

  useEffect(() => {
    if (!products || products.length === 0) {
      setFiatPaymentOptions([]);
      return;
    } else {
      const firstProduct = products[0]!;
      const firstSellerProfile = profileContext.profileData.get(
        firstProduct.pubkey
      );
      let commonFiatOptions = firstSellerProfile?.content?.fiat_options || [];

      for (let i = 1; i < products.length; i++) {
        const productData = products[i]!;
        const sellerProfile = profileContext.profileData.get(
          productData.pubkey
        );
        const currentFiatOptions = sellerProfile?.content?.fiat_options || [];

        commonFiatOptions = commonFiatOptions.filter((option: string) =>
          currentFiatOptions.includes(option)
        );

        if (commonFiatOptions.length === 0) break;
      }

      setFiatPaymentOptions(commonFiatOptions);
    }
  }, [products, profileContext.profileData]);

  const generateNewKeys = async () => {
    try {
      const { nsec: nsecForSender, npub: npubForSender } = await generateKeys();
      const { nsec: nsecForReceiver, npub: npubForReceiver } =
        await generateKeys();

      return {
        senderNpub: npubForSender,
        senderNsec: nsecForSender,
        receiverNpub: npubForReceiver,
        receiverNsec: nsecForReceiver,
      };
    } catch (error) {
      console.error(error);
      return null;
    }
  };

  const sendPaymentAndContactMessage = async (
    pubkeyToReceiveMessage: string,
    message: string,
    product: ProductData,
    isPayment?: boolean,
    isReceipt?: boolean,
    isDonation?: boolean,
    orderId?: string,
    paymentType?: string,
    paymentReference?: string,
    paymentProof?: string,
    messageAmount?: number,
    productQuantity?: number
  ) => {
    const newKeys = await generateNewKeys();
    if (!newKeys) {
      setFailureText("Failed to generate new keys for messages!");
      setShowFailureModal(true);
      return;
    }

    if (!userLoggedIn) {
      setFailureText("User is not logged in!");
      setShowFailureModal(true);
      return;
    }

    const decodedRandomPubkeyForSender = nip19.decode(newKeys.senderNpub);
    const decodedRandomPrivkeyForSender = nip19.decode(newKeys.senderNsec);
    const decodedRandomPubkeyForReceiver = nip19.decode(newKeys.receiverNpub);
    const decodedRandomPrivkeyForReceiver = nip19.decode(newKeys.receiverNsec);

    let messageSubject = "";
    let messageOptions = {};
    if (isPayment) {
      messageSubject = "order-payment";
      messageOptions = {
        isOrder: true,
        type: 3,
        orderAmount: messageAmount ? messageAmount : totalCost,
        orderId,
        productData: product,
        paymentType,
        paymentReference,
        paymentProof,
      };
    } else if (isReceipt) {
      messageSubject = "order-info";
      messageOptions = {
        isOrder: true,
        type: 4,
        orderId,
        productData: product,
        status: "confirmed",
      };
    } else if (isDonation) {
      messageSubject = "donation";
    } else if (orderId) {
      messageSubject = "order-info";
      messageOptions = {
        isOrder: true,
        type: 1,
        orderAmount: messageAmount ? messageAmount : undefined,
        orderId,
        productData: product,
        quantity: productQuantity ? productQuantity : 1,
      };
    }

    const giftWrappedMessageEvent = await constructGiftWrappedEvent(
      decodedRandomPubkeyForSender.data as string,
      pubkeyToReceiveMessage,
      message,
      messageSubject,
      messageOptions
    );
    const sealedEvent = await constructMessageSeal(
      signer!,
      giftWrappedMessageEvent,
      decodedRandomPubkeyForSender.data as string,
      pubkeyToReceiveMessage,
      decodedRandomPrivkeyForSender.data as Uint8Array
    );
    const giftWrappedEvent = await constructMessageGiftWrap(
      sealedEvent,
      decodedRandomPubkeyForReceiver.data as string,
      decodedRandomPrivkeyForReceiver.data as Uint8Array,
      pubkeyToReceiveMessage
    );
    await sendGiftWrappedMessageEvent(giftWrappedEvent);

    if (isReceipt) {
      chatsContext.addNewlyCreatedMessageEvent(
        {
          ...giftWrappedMessageEvent,
          sig: "",
          read: false,
        },
        true
      );
      addChatMessagesToCache([
        { ...giftWrappedMessageEvent, sig: "", read: false },
      ]);
    }
  };

  const validatePaymentData = (
    price: number,
    data?: ShippingFormData | ContactFormData | CombinedFormData
  ) => {
    if (price < 1) {
      throw new Error("Payment amount must be greater than 0 sats");
    }

    if (data) {
      if ("Name" in data && "Contact" in data) {
        const combinedData = data as CombinedFormData;
        if (
          !combinedData.Name?.trim() ||
          !combinedData.Address?.trim() ||
          !combinedData.City?.trim() ||
          !combinedData["Postal Code"]?.trim() ||
          !combinedData["State/Province"]?.trim() ||
          !combinedData.Country?.trim() ||
          !combinedData.Contact?.trim() ||
          !combinedData["Contact Type"]?.trim() ||
          !combinedData.Instructions?.trim()
        ) {
          throw new Error("Required shipping fields are missing");
        }
      } else if ("Name" in data) {
        const shippingData = data as ShippingFormData;
        if (
          !shippingData.Name?.trim() ||
          !shippingData.Address?.trim() ||
          !shippingData.City?.trim() ||
          !shippingData["Postal Code"]?.trim() ||
          !shippingData["State/Province"]?.trim() ||
          !shippingData.Country?.trim()
        ) {
          throw new Error("Required shipping fields are missing");
        }
      } else if ("Contact" in data) {
        const contactData = data as ContactFormData;
        if (
          !contactData.Contact?.trim() ||
          !contactData["Contact Type"]?.trim() ||
          !contactData.Instructions?.trim()
        ) {
          throw new Error("Required contact fields are missing");
        }
      }
      if ("Required" in data && data["Required"] !== "") {
        if (!data["Required"]?.trim()) {
          throw new Error("Required fields are missing");
        }
      }
    }
  };

  const onShippingSubmit = async (data: { [x: string]: string }) => {
    try {
      if (totalCost < 1) {
        throw new Error("Listing price is less than 1 sat.");
      }

      const shippingName = data["Name"];
      const shippingAddress = data["Address"];
      const shippingUnitNo = data["Unit"];
      const shippingCity = data["City"];
      const shippingPostalCode = data["Postal Code"];
      const shippingState = data["State/Province"];
      const shippingCountry = data["Country"];
      const additionalInfo = data["Required"];
      setShowShippingModal(false);
      if (isFiatPayment) {
        await handleFiatPayment(
          totalCost,
          shippingName,
          shippingAddress,
          shippingUnitNo,
          shippingCity,
          shippingPostalCode,
          shippingState,
          shippingCountry,
          undefined,
          undefined,
          undefined,
          additionalInfo
        );
      } else if (isCashuPayment) {
        await handleCashuPayment(
          totalCost,
          shippingName,
          shippingAddress,
          shippingUnitNo,
          shippingCity,
          shippingPostalCode,
          shippingState,
          shippingCountry,
          undefined,
          undefined,
          undefined,
          additionalInfo
        );
      } else {
        await handleLightningPayment(
          totalCost,
          shippingName,
          shippingAddress,
          shippingUnitNo,
          shippingCity,
          shippingPostalCode,
          shippingState,
          shippingCountry,
          undefined,
          undefined,
          undefined,
          additionalInfo
        );
      }
    } catch (error) {
      console.error(error);
      if (setCashuPaymentFailed) {
        setCashuPaymentFailed(true);
      }
    }
  };

  const onContactSubmit = async (data: { [x: string]: string }) => {
    try {
      if (totalCost < 1) {
        throw new Error("Listing price is less than 1 sat.");
      }

      const contact = data["Contact"];
      const contactType = data["Contact Type"];
      const contactInstructions = data["Instructions"];
      const additionalInfo = data["Required"];
      setShowContactModal(false);
      if (isFiatPayment) {
        await handleFiatPayment(
          totalCost,
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
          additionalInfo
        );
      } else if (isCashuPayment) {
        await handleCashuPayment(
          totalCost,
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
          additionalInfo
        );
      } else {
        await handleLightningPayment(
          totalCost,
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
          additionalInfo
        );
      }
    } catch (error) {
      console.error(error);
      if (setCashuPaymentFailed) {
        setCashuPaymentFailed(true);
      }
    }
  };

  const onCombinedSubmit = async (data: { [x: string]: string }) => {
    try {
      if (totalCost < 1) {
        throw new Error("Listing price is less than 1 sat.");
      }

      const contact = data["Contact"];
      const contactType = data["Contact Type"];
      const contactInstructions = data["Instructions"];
      const shippingName = data["Name"];
      const shippingAddress = data["Address"];
      const shippingUnitNo = data["Unit"];
      const shippingCity = data["City"];
      const shippingPostalCode = data["Postal Code"];
      const shippingState = data["State/Province"];
      const shippingCountry = data["Country"];
      const additionalInfo = data["Required"];
      setShowCombinedModal(false);
      if (isFiatPayment) {
        await handleFiatPayment(
          totalCost,
          shippingName,
          shippingAddress,
          shippingUnitNo,
          shippingCity,
          shippingPostalCode,
          shippingState,
          shippingCountry,
          contact,
          contactType,
          contactInstructions,
          additionalInfo
        );
      } else if (isCashuPayment) {
        await handleCashuPayment(
          totalCost,
          shippingName,
          shippingAddress,
          shippingUnitNo,
          shippingCity,
          shippingPostalCode,
          shippingState,
          shippingCountry,
          contact,
          contactType,
          contactInstructions,
          additionalInfo
        );
      } else {
        await handleLightningPayment(
          totalCost,
          shippingName,
          shippingAddress,
          shippingUnitNo,
          shippingCity,
          shippingPostalCode,
          shippingState,
          shippingCountry,
          contact,
          contactType,
          contactInstructions,
          additionalInfo
        );
      }
    } catch (error) {
      console.error(error);
      if (setCashuPaymentFailed) {
        setCashuPaymentFailed(true);
      }
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

  const handleToggleCombinedModal = () => {
    combinedReset();
    setShowCombinedModal(!showCombinedModal);
  };

  const handleFiatPayment = async (
    convertedPrice: number,
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
    additionalInfo?: string
  ) => {
    if (
      shippingName ||
      shippingAddress ||
      shippingCity ||
      shippingPostalCode ||
      shippingState ||
      shippingCountry
    ) {
      validatePaymentData(convertedPrice, {
        Name: shippingName || "",
        Address: shippingAddress || "",
        Unit: shippingUnitNo || "",
        City: shippingCity || "",
        "Postal Code": shippingPostalCode || "",
        "State/Province": shippingState || "",
        Country: shippingCountry || "",
        Required: additionalInfo || "",
      });
    } else if (contact || contactType || contactInstructions) {
      validatePaymentData(convertedPrice, {
        Contact: contact || "",
        "Contact Type": contactType || "",
        Instructions: contactInstructions || "",
        Required: additionalInfo || "",
      });
    } else {
      validatePaymentData(convertedPrice);
    }
    const userPubkey = await signer?.getPubKey?.();
    const userNPub = userPubkey ? nip19.npubEncode(userPubkey) : undefined;
    for (const product of products) {
      const title = product.title;
      const pubkey = product.pubkey;
      const required = product.required;
      const orderId = uuidv4();

      let paymentMessage = "";
      if (quantities[product.id] && quantities[product.id]! > 1) {
        if (userNPub) {
          paymentMessage =
            "You have received an order from " +
            userNPub +
            " for " +
            quantities[product.id] +
            " of your " +
            title +
            " listing on Shopstr! Message them with your " +
            selectedFiatOption +
            "payment details to finalize.";
        } else {
          paymentMessage =
            "You have received an order for your" +
            quantities[product.id] +
            " of your " +
            title +
            " listing on Shopstr! Message them with your " +
            selectedFiatOption +
            "payment details to finalize.";
        }
      } else {
        if (userNPub) {
          paymentMessage =
            "You have received an order from " +
            userNPub +
            " for your " +
            title +
            " listing on Shopstr! Message them with your " +
            selectedFiatOption +
            "payment details to finalize.";
        } else {
          paymentMessage =
            "You have received an order for your " +
            title +
            " listing on Shopstr! Message them with your " +
            selectedFiatOption +
            "payment details to finalize.";
        }
      }
      await sendPaymentAndContactMessage(
        pubkey,
        paymentMessage,
        product,
        true,
        false,
        false,
        orderId,
        "fiat",
        "",
        "",
        undefined,
        quantities[product.id] && quantities[product.id]! > 1
          ? quantities[product.id]
          : 1
      );

      if (required && required !== "") {
        if (additionalInfo) {
          const additionalMessage =
            "Additional customer information: " + additionalInfo;
          await sendPaymentAndContactMessage(
            pubkey,
            additionalMessage,
            product,
            false,
            false,
            false,
            orderId
          );
        }
      }

      if (
        !(
          shippingName === undefined &&
          shippingAddress === undefined &&
          shippingUnitNo === undefined &&
          shippingCity === undefined &&
          shippingPostalCode === undefined &&
          shippingState === undefined &&
          shippingCountry === undefined &&
          contact === undefined &&
          contactType === undefined &&
          contactInstructions === undefined
        )
      ) {
        if (
          product.shippingType === "Added Cost" ||
          product.shippingType === "Free" ||
          (product.shippingType === "Free/Pickup" && needsShippingInfo === true)
        ) {
          let contactMessage = "";
          let productDetails = "";
          if (product.selectedSize) {
            productDetails += "in a size " + product.selectedSize;
          }
          if (product.selectedVolume) {
            if (productDetails) {
              productDetails += " and a " + product.selectedVolume;
            } else {
              productDetails += " " + product.selectedVolume;
            }
          }

          if (!shippingUnitNo) {
            contactMessage =
              "Please ship the product " +
              (productDetails ? productDetails + " " : "") +
              "to " +
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
              "Please ship the product " +
              (productDetails ? productDetails + " " : "") +
              "to " +
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
          await sendPaymentAndContactMessage(
            pubkey,
            contactMessage,
            product,
            false,
            false,
            false,
            orderId
          );
          if (userPubkey) {
            const receiptMessage =
              "Your order for " +
              product.title +
              " was processed successfully.  You should be receiving payment information from " +
              nip19.npubEncode(product.pubkey) +
              " as soon as they review your oder.";
            await sendPaymentAndContactMessage(
              userPubkey,
              receiptMessage,
              product,
              false,
              true,
              false,
              orderId
            );
          }
        } else if (
          product.shippingType === "N/A" ||
          product.shippingType === "Pickup" ||
          (product.shippingType === "Free/Pickup" &&
            needsShippingInfo === false)
        ) {
          let contactMessage;
          let receiptMessage;
          if (product.selectedSize) {
            contactMessage =
              "To finalize the sale of your " +
              title +
              " listing in a size " +
              product.selectedSize +
              " on Shopstr, please contact " +
              contact +
              " over " +
              contactType +
              " using the following instructions: " +
              contactInstructions;
            receiptMessage =
              "Your order for " +
              product.title +
              "in a size " +
              product.selectedSize +
              " was processed successfully. You should be receiving payment information from " +
              nip19.npubEncode(product.pubkey) +
              " as soon as they review your oder.";
          } else {
            contactMessage =
              "To finalize the sale of your " +
              title +
              " listing on Shopstr, please contact " +
              contact +
              " over " +
              contactType +
              " using the following instructions: " +
              contactInstructions;
            receiptMessage =
              "Your order for " +
              product.title +
              " was processed successfully.  You should be receiving payment information from " +
              nip19.npubEncode(product.pubkey) +
              " as soon as they review your oder.";
          }
          await sendPaymentAndContactMessage(
            pubkey,
            contactMessage,
            product,
            false,
            false,
            false,
            orderId
          );
          if (userPubkey) {
            await sendPaymentAndContactMessage(
              userPubkey,
              receiptMessage,
              product,
              false,
              true,
              false,
              orderId
            );
          }
        }
      } else if (product.selectedSize || product.selectedVolume) {
        let productDetails = "";
        if (product.selectedSize) {
          productDetails += "a size " + product.selectedSize;
        }
        if (product.selectedVolume) {
          if (productDetails) {
            productDetails += " and a " + product.selectedVolume;
          } else {
            productDetails += "a " + product.selectedVolume;
          }
        }

        const contactMessage = "This purchase was for " + productDetails + ".";
        await sendPaymentAndContactMessage(
          pubkey,
          contactMessage,
          product,
          false,
          false,
          false,
          orderId
        );
        if (userPubkey) {
          const receiptMessage =
            "Thank you for your purchase of " +
            title +
            " in " +
            productDetails +
            " from " +
            nip19.npubEncode(product.pubkey) +
            ".";
          await sendPaymentAndContactMessage(
            userPubkey,
            receiptMessage,
            product,
            false,
            true,
            false,
            orderId
          );
        }
      } else if (userPubkey) {
        const receiptMessage =
          "Thank you for your purchase of " +
          title +
          " from " +
          nip19.npubEncode(product.pubkey) +
          ".";
        await sendPaymentAndContactMessage(
          userPubkey,
          receiptMessage,
          product,
          false,
          true,
          false,
          orderId
        );
      }
    }
    setFiatOrderIsPlaced(true);
  };

  const handleLightningPayment = async (
    convertedPrice: number,
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
    additionalInfo?: string
  ) => {
    try {
      if (
        shippingName ||
        shippingAddress ||
        shippingCity ||
        shippingPostalCode ||
        shippingState ||
        shippingCountry
      ) {
        validatePaymentData(convertedPrice, {
          Name: shippingName || "",
          Address: shippingAddress || "",
          Unit: shippingUnitNo || "",
          City: shippingCity || "",
          "Postal Code": shippingPostalCode || "",
          "State/Province": shippingState || "",
          Country: shippingCountry || "",
          Required: additionalInfo || "",
        });
      } else if (contact || contactType || contactInstructions) {
        validatePaymentData(convertedPrice, {
          Contact: contact || "",
          "Contact Type": contactType || "",
          Instructions: contactInstructions || "",
          Required: additionalInfo || "",
        });
      } else {
        validatePaymentData(convertedPrice);
      }

      setShowInvoiceCard(true);
      const wallet = new CashuWallet(new CashuMint(mints[0]!));

      const { request: pr, quote: hash } =
        await wallet.createMintQuote(convertedPrice);

      setInvoice(pr);

      QRCode.toDataURL(pr)
        .then((url: string) => {
          setQrCodeUrl(url);
        })
        .catch((err: unknown) => {
          console.error("ERROR", err);
        });

      if (typeof window.webln !== "undefined") {
        try {
          await window.webln.enable();
          const isEnabled = await window.webln.isEnabled();
          if (!isEnabled) {
            throw new Error("WebLN is not enabled");
          }
          try {
            const res = await window.webln.sendPayment(pr);
            if (!res) {
              throw new Error("Payment failed");
            }
          } catch (e) {
            console.error(e);
          }
        } catch (e) {
          console.error(e);
        }
      }
      await invoiceHasBeenPaid(
        wallet,
        convertedPrice,
        hash,
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
        additionalInfo ? additionalInfo : undefined
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
    convertedPrice: number,
    hash: string,
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
    additionalInfo?: string
  ) {
    let retryCount = 0;
    const maxRetries = 30; // Maximum 30 retries (about 1 minute)

    while (retryCount < maxRetries) {
      try {
        // First check if the quote has been paid
        const quoteState = await wallet.checkMintQuote(hash);

        if (quoteState.state === "PAID") {
          // Quote is paid, try to mint proofs
          try {
            const proofs = await wallet.mintProofs(convertedPrice, hash);
            if (proofs && proofs.length > 0) {
              await sendTokens(
                wallet,
                proofs,
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
                additionalInfo ? additionalInfo : undefined
              );
              localStorage.setItem("cart", JSON.stringify([]));
              setPaymentConfirmed(true);
              setQrCodeUrl(null);
              if (setInvoiceIsPaid) {
                setInvoiceIsPaid(true);
              }
              break;
            }
          } catch (mintError) {
            // If minting fails but quote is paid, it might be already issued
            if (
              mintError instanceof Error &&
              mintError.message.includes("issued")
            ) {
              // Quote was already processed, consider it successful
              localStorage.setItem("cart", JSON.stringify([]));
              setPaymentConfirmed(true);
              setQrCodeUrl(null);
              if (setInvoiceIsPaid) {
                setInvoiceIsPaid(true);
              }
              setFailureText(
                "Payment was received but your connection dropped! Please check your wallet balance."
              );
              setShowFailureModal(true);
              break;
            }
            throw mintError;
          }
        } else if (quoteState.state === "UNPAID") {
          // Quote not paid yet, continue waiting
          retryCount++;
          await new Promise((resolve) => setTimeout(resolve, 2100));
          continue;
        } else if (quoteState.state === "ISSUED") {
          // Quote was already processed successfully
          localStorage.setItem("cart", JSON.stringify([]));
          setPaymentConfirmed(true);
          setQrCodeUrl(null);
          if (setInvoiceIsPaid) {
            setInvoiceIsPaid(true);
          }
          setFailureText(
            "Payment was received but your connection dropped! Please check your wallet balance."
          );
          setShowFailureModal(true);
          break;
        }
      } catch (error) {
        console.error("Invoice check error:", error);
        retryCount++;

        if (error instanceof TypeError) {
          setShowInvoiceCard(false);
          setInvoice("");
          setQrCodeUrl(null);
          setFailureText(
            "Failed to validate invoice! Change your mint in settings and/or please try again."
          );
          setShowFailureModal(true);
          break;
        }

        // If we've exceeded max retries, show error
        if (retryCount >= maxRetries) {
          setShowInvoiceCard(false);
          setInvoice("");
          setQrCodeUrl(null);
          setFailureText(
            "Payment timed out! Please check your wallet balance or try again."
          );
          setShowFailureModal(true);
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, 2100));
      }
    }
  }

  const sendTokens = async (
    wallet: CashuWallet,
    proofs: Proof[],
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
    additionalInfo?: string
  ) => {
    const userPubkey = await signer?.getPubKey?.();
    const userNPub = userPubkey ? nip19.npubEncode(userPubkey) : undefined;
    let remainingProofs = proofs;
    for (const product of products) {
      const title = product.title;
      const pubkey = product.pubkey;
      const required = product.required;
      const tokenAmount = totalCostsInSats[pubkey];
      let sellerToken;
      let donationToken;
      const sellerProfile = profileContext.profileData.get(pubkey);
      const donationPercentage =
        sellerProfile?.content?.shopstr_donation || 2.1;
      const donationAmount = Math.ceil(
        (tokenAmount! * donationPercentage) / 100
      );
      const sellerAmount = tokenAmount! - donationAmount;
      let sellerProofs: Proof[] = [];

      if (sellerAmount > 0) {
        const { keep, send } = await wallet.send(
          sellerAmount,
          remainingProofs,
          {
            includeFees: true,
          }
        );
        sellerProofs = send;
        sellerToken = getEncodedToken({
          mint: mints[0]!,
          proofs: send,
        });
        remainingProofs = keep;
      }

      if (donationAmount > 0) {
        const { keep, send } = await wallet.send(
          donationAmount,
          remainingProofs,
          {
            includeFees: true,
          }
        );
        donationToken = getEncodedToken({
          mint: mints[0]!,
          proofs: send,
        });
        remainingProofs = keep;
      }

      const orderId = uuidv4();
      const paymentPreference =
        sellerProfile?.content?.payment_preference || "ecash";
      const lnurl = sellerProfile?.content?.lud16 || "";

      if (
        paymentPreference === "lightning" &&
        lnurl &&
        lnurl !== "" &&
        !lnurl.contains("@zeuspay.com") &&
        sellerProofs
      ) {
        const newAmount = Math.floor(sellerAmount * 0.98 - 2);
        const ln = new LightningAddress(lnurl);
        await wallet.loadMint();
        await ln.fetch();
        const invoice = await ln.requestInvoice({ satoshi: newAmount });
        const invoicePaymentRequest = invoice.paymentRequest;
        const meltQuote = await wallet.createMeltQuote(invoicePaymentRequest);
        if (meltQuote) {
          const meltQuoteTotal = meltQuote.amount + meltQuote.fee_reserve;
          const { keep, send } = await wallet.send(
            meltQuoteTotal,
            sellerProofs,
            {
              includeFees: true,
            }
          );
          const meltResponse = await wallet.meltProofs(meltQuote, send);
          if (meltResponse.quote) {
            const meltAmount = meltResponse.quote.amount;
            const changeProofs = [...keep, ...meltResponse.change];
            const changeAmount =
              Array.isArray(changeProofs) && changeProofs.length > 0
                ? changeProofs.reduce(
                    (acc, current: Proof) => acc + current.amount,
                    0
                  )
                : 0;
            let paymentMessage = "";
            if (quantities[product.id] && quantities[product.id]! > 1) {
              if (userNPub) {
                paymentMessage =
                  "You have received a payment from " +
                  userNPub +
                  " for " +
                  quantities[product.id] +
                  " of your " +
                  title +
                  " listing on Shopstr! Check your Lightning address (" +
                  lnurl +
                  ") for your sats.";
              } else {
                paymentMessage =
                  "You have received a payment for " +
                  quantities[product.id] +
                  " of your " +
                  title +
                  " listing on Shopstr! Check your Lightning address (" +
                  lnurl +
                  ") for your sats.";
              }
            } else {
              if (userNPub) {
                paymentMessage =
                  "You have received a payment from " +
                  userNPub +
                  " for your " +
                  title +
                  " listing on Shopstr! Check your Lightning address (" +
                  lnurl +
                  ") for your sats.";
              } else {
                paymentMessage =
                  "You have received a payment for your " +
                  title +
                  " listing on Shopstr! Check your Lightning address (" +
                  lnurl +
                  ") for your sats.";
              }
            }
            await sendPaymentAndContactMessage(
              pubkey,
              paymentMessage,
              product,
              true,
              false,
              false,
              orderId,
              "lightning",
              invoicePaymentRequest,
              invoice.preimage ? invoice.preimage : invoice.paymentHash,
              meltAmount,
              quantities[product.id] && quantities[product.id]! > 1
                ? quantities[product.id]
                : 1
            );
            if (changeAmount >= 1 && changeProofs && changeProofs.length > 0) {
              const encodedChange = getEncodedToken({
                mint: mints[0]!,
                proofs: changeProofs,
              });
              const changeMessage = "Overpaid fee change: " + encodedChange;
              await sendPaymentAndContactMessage(
                pubkey,
                changeMessage,
                product,
                true,
                false,
                false,
                orderId,
                "ecash",
                mints[0],
                JSON.stringify(changeProofs),
                changeAmount
              );
            }
          } else {
            const unusedProofs = [...keep, ...send, ...meltResponse.change];
            const unusedAmount =
              Array.isArray(unusedProofs) && unusedProofs.length > 0
                ? unusedProofs.reduce(
                    (acc, current: Proof) => acc + current.amount,
                    0
                  )
                : 0;
            const unusedToken = getEncodedToken({
              mint: mints[0]!,
              proofs: unusedProofs,
            });
            let paymentMessage = "";
            if (quantities[product.id] && quantities[product.id]! > 1) {
              if (unusedToken) {
                if (userNPub) {
                  paymentMessage =
                    "This is a Cashu token payment from " +
                    userNPub +
                    " for " +
                    quantities[product.id] +
                    " of your " +
                    title +
                    " listing on Shopstr: " +
                    unusedToken;
                } else {
                  paymentMessage =
                    "This is a Cashu token payment for " +
                    quantities[product.id] +
                    " of your " +
                    title +
                    " listing on Shopstr: " +
                    unusedToken;
                }
              }
            } else {
              if (unusedToken) {
                if (userNPub) {
                  paymentMessage =
                    "This is a Cashu token payment from " +
                    userNPub +
                    " for your " +
                    title +
                    " listing on Shopstr: " +
                    unusedToken;
                } else {
                  paymentMessage =
                    "This is a Cashu token payment for your " +
                    title +
                    " listing on Shopstr: " +
                    unusedToken;
                }
              }
            }
            await sendPaymentAndContactMessage(
              pubkey,
              paymentMessage,
              product,
              true,
              false,
              false,
              orderId,
              "ecash",
              mints[0],
              JSON.stringify(unusedProofs),
              unusedAmount,
              quantities[product.id] && quantities[product.id]! > 1
                ? quantities[product.id]
                : 1
            );
          }
        }
      } else {
        let paymentMessage = "";
        if (quantities[product.id] && quantities[product.id]! > 1) {
          if (sellerToken) {
            if (userNPub) {
              paymentMessage =
                "This is a Cashu token payment from " +
                userNPub +
                " for " +
                quantities[product.id] +
                " of your " +
                title +
                " listing on Shopstr: " +
                sellerToken;
            } else {
              paymentMessage =
                "This is a Cashu token payment for " +
                quantities[product.id] +
                " of your " +
                title +
                " listing on Shopstr: " +
                sellerToken;
            }
          }
        } else {
          if (sellerToken) {
            if (userNPub) {
              paymentMessage =
                "This is a Cashu token payment from " +
                userNPub +
                " for your " +
                title +
                " listing on Shopstr: " +
                sellerToken;
            } else {
              paymentMessage =
                "This is a Cashu token payment for your " +
                title +
                " listing on Shopstr: " +
                sellerToken;
            }
          }
        }
        await sendPaymentAndContactMessage(
          pubkey,
          paymentMessage,
          product,
          true,
          false,
          false,
          orderId,
          "ecash",
          mints[0],
          JSON.stringify(sellerProofs),
          sellerAmount,
          quantities[product.id] && quantities[product.id]! > 1
            ? quantities[product.id]
            : 1
        );
      }

      let donationMessage = "";
      if (donationToken) {
        donationMessage = "Sale donation: " + donationToken;
        await sendPaymentAndContactMessage(
          "a37118a4888e02d28e8767c08caaf73b49abdac391ad7ff18a304891e416dc33",
          donationMessage,
          product,
          false,
          false,
          true
        );
      }

      if (required && required !== "") {
        if (additionalInfo) {
          const additionalMessage =
            "Additional customer information: " + additionalInfo;
          await sendPaymentAndContactMessage(
            pubkey,
            additionalMessage,
            product,
            false,
            false,
            false,
            orderId
          );
        }
      }

      if (
        !(
          shippingName === undefined &&
          shippingAddress === undefined &&
          shippingUnitNo === undefined &&
          shippingCity === undefined &&
          shippingPostalCode === undefined &&
          shippingState === undefined &&
          shippingCountry === undefined &&
          contact === undefined &&
          contactType === undefined &&
          contactInstructions === undefined
        )
      ) {
        if (
          product.shippingType === "Added Cost" ||
          product.shippingType === "Free" ||
          (product.shippingType === "Free/Pickup" && needsShippingInfo === true)
        ) {
          let contactMessage = "";
          let productDetails = "";
          if (product.selectedSize) {
            productDetails += "in a size " + product.selectedSize;
          }
          if (product.selectedVolume) {
            if (productDetails) {
              productDetails += " and a " + product.selectedVolume;
            } else {
              productDetails += "in volume " + product.selectedVolume;
            }
          }

          if (!shippingUnitNo) {
            contactMessage =
              "Please ship the product " +
              (productDetails ? productDetails + " " : "") +
              "to " +
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
              "Please ship the product " +
              (productDetails ? productDetails + " " : "") +
              "to " +
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
          await sendPaymentAndContactMessage(
            pubkey,
            contactMessage,
            product,
            false,
            false,
            false,
            orderId
          );
          if (userPubkey) {
            const receiptMessage =
              "Your order for " +
              product.title +
              " was processed successfully. You should be receiving tracking information from " +
              nip19.npubEncode(product.pubkey) +
              " as soon as they claim their payment.";
            await sendPaymentAndContactMessage(
              userPubkey,
              receiptMessage,
              product,
              false,
              true,
              false,
              orderId
            );
          }
        } else if (
          product.shippingType === "N/A" ||
          product.shippingType === "Pickup" ||
          (product.shippingType === "Free/Pickup" &&
            needsShippingInfo === false)
        ) {
          let contactMessage;
          let receiptMessage;
          if (product.selectedSize) {
            contactMessage =
              "To finalize the sale of your " +
              title +
              " listing in a size " +
              product.selectedSize +
              " on Shopstr, please contact " +
              contact +
              " over " +
              contactType +
              " using the following instructions: " +
              contactInstructions;
            receiptMessage =
              "Your order for " +
              product.title +
              "in a size " +
              product.selectedSize +
              " was processed successfully. You should be receiving delivery information from " +
              nip19.npubEncode(product.pubkey) +
              " as soon as they claim their payment.";
          } else {
            contactMessage =
              "To finalize the sale of your " +
              title +
              " listing on Shopstr, please contact " +
              contact +
              " over " +
              contactType +
              " using the following instructions: " +
              contactInstructions;
            receiptMessage =
              "Your order for " +
              product.title +
              " was processed successfully. You should be receiving delivery information from " +
              nip19.npubEncode(product.pubkey) +
              " as soon as they claim their payment.";
          }
          await sendPaymentAndContactMessage(
            pubkey,
            contactMessage,
            product,
            false,
            false,
            false,
            orderId
          );
          if (userPubkey) {
            await sendPaymentAndContactMessage(
              userPubkey,
              receiptMessage,
              product,
              false,
              true,
              false,
              orderId
            );
          }
        }
      } else if (product.selectedSize || product.selectedVolume) {
        let productDetails = "";
        if (product.selectedSize) {
          productDetails += "a size " + product.selectedSize;
        }
        if (product.selectedVolume) {
          if (productDetails) {
            productDetails += " and a " + product.selectedVolume;
          } else {
            productDetails += "a " + product.selectedVolume;
          }
        }

        const contactMessage = "This purchase was for " + productDetails + ".";
        await sendPaymentAndContactMessage(
          pubkey,
          contactMessage,
          product,
          false,
          false,
          false,
          orderId
        );
        if (userPubkey) {
          const receiptMessage =
            "Thank you for your purchase of " +
            title +
            " in " +
            productDetails +
            " from " +
            nip19.npubEncode(product.pubkey) +
            ".";
          await sendPaymentAndContactMessage(
            userPubkey,
            receiptMessage,
            product,
            false,
            true,
            false,
            orderId
          );
        }
      } else if (userPubkey) {
        const receiptMessage =
          "Thank you for your purchase of " +
          title +
          " from " +
          nip19.npubEncode(product.pubkey) +
          ".";
        await sendPaymentAndContactMessage(
          userPubkey,
          receiptMessage,
          product,
          false,
          true,
          false,
          orderId
        );
      }
    }
  };

  const handleCopyInvoice = () => {
    navigator.clipboard.writeText(invoice);
    setCopiedToClipboard(true);
    setTimeout(() => {
      setCopiedToClipboard(false);
    }, 2100);
  };

  const formattedTotalCost = formatWithCommas(totalCost, "sats");

  const handleCashuPayment = async (
    price: number,
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
    additionalInfo?: string
  ) => {
    try {
      if (!mints || mints.length === 0) {
        throw new Error("No Cashu mint available");
      }

      if (!walletContext) {
        throw new Error("Wallet context not available");
      }

      if (
        shippingName ||
        shippingAddress ||
        shippingCity ||
        shippingPostalCode ||
        shippingState ||
        shippingCountry
      ) {
        validatePaymentData(price, {
          Name: shippingName || "",
          Address: shippingAddress || "",
          Unit: shippingUnitNo || "",
          City: shippingCity || "",
          "Postal Code": shippingPostalCode || "",
          "State/Province": shippingState || "",
          Country: shippingCountry || "",
          Required: additionalInfo || "",
        });
      } else if (contact || contactType || contactInstructions) {
        validatePaymentData(price, {
          Contact: contact || "",
          "Contact Type": contactType || "",
          Instructions: contactInstructions || "",
          Required: additionalInfo || "",
        });
      } else {
        validatePaymentData(price);
      }

      const mint = new CashuMint(mints[0]!);
      const wallet = new CashuWallet(mint);
      const mintKeySetIds = await wallet.getKeySets();
      const filteredProofs = tokens.filter(
        (p: Proof) =>
          mintKeySetIds?.some((keysetId: MintKeyset) => keysetId.id === p.id)
      );
      const { keep, send } = await wallet.send(price, filteredProofs, {
        includeFees: true,
      });
      const deletedEventIds = [
        ...new Set([
          ...walletContext.proofEvents
            .filter((event) =>
              event.proofs.some((proof: Proof) =>
                filteredProofs.some(
                  (filteredProof) =>
                    JSON.stringify(proof) === JSON.stringify(filteredProof)
                )
              )
            )
            .map((event) => event.id),
          ...walletContext.proofEvents
            .filter((event) =>
              event.proofs.some((proof: Proof) =>
                keep.some(
                  (keepProof) =>
                    JSON.stringify(proof) === JSON.stringify(keepProof)
                )
              )
            )
            .map((event) => event.id),
          ...walletContext.proofEvents
            .filter((event) =>
              event.proofs.some((proof: Proof) =>
                send.some(
                  (sendProof) =>
                    JSON.stringify(proof) === JSON.stringify(sendProof)
                )
              )
            )
            .map((event) => event.id),
        ]),
      ];
      await sendTokens(
        wallet,
        send,
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
        additionalInfo ? additionalInfo : undefined
      );
      const changeProofs = keep;
      const remainingProofs = tokens.filter(
        (p: Proof) =>
          mintKeySetIds?.some((keysetId: MintKeyset) => keysetId.id !== p.id)
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
        ])
      );
      await publishProofEvent(
        nostr!,
        signer!,
        mints[0]!,
        changeProofs && changeProofs.length >= 1 ? changeProofs : [],
        "out",
        price.toString(),
        deletedEventIds
      );
      if (setCashuPaymentSent) {
        setCashuPaymentSent(true);
        localStorage.setItem("cart", JSON.stringify([]));
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
          {fiatPaymentOptions.length > 0 && (
            <Button
              type="submit"
              className={SHOPSTRBUTTONCLASSNAMES + " mt-3"}
              onClick={() => {
                if (!userLoggedIn) {
                  onOpen();
                  return;
                }
                if (
                  uniqueShippingTypes.length === 1 &&
                  uniqueShippingTypes.includes("Free/Pickup")
                ) {
                  setIsFiatPayment(true);
                  // setShowShippingOption(true); only diference
                  setShowFiatTypeOption(true);
                } else if (
                  !uniqueShippingTypes.includes("N/A") &&
                  !uniqueShippingTypes.includes("Pickup")
                ) {
                  setIsFiatPayment(true);
                  setNeedsShippingInfo(true);
                  setNeedsCombinedInfo(false);
                  setShowFiatTypeOption(true);
                } else if (
                  !uniqueShippingTypes.includes("Free") &&
                  !uniqueShippingTypes.includes("Added Cost")
                ) {
                  setIsFiatPayment(true);
                  setNeedsShippingInfo(false);
                  setNeedsCombinedInfo(false);
                  setShowFiatTypeOption(true);
                } else if (
                  !uniqueShippingTypes.includes("Free") &&
                  !uniqueShippingTypes.includes("Added Cost") &&
                  !uniqueShippingTypes.includes("N/A") &&
                  !uniqueShippingTypes.includes("Pickup") &&
                  !uniqueShippingTypes.includes("Free/Pickup")
                ) {
                  setIsFiatPayment(true);
                  setNeedsShippingInfo(false);
                  setNeedsCombinedInfo(false);
                  setShowFiatTypeOption(true);
                } else {
                  setIsFiatPayment(true);
                  setNeedsShippingInfo(false);
                  setNeedsCombinedInfo(true);
                  setShowFiatTypeOption(true);
                }
              }}
              startContent={
                <CurrencyDollarIcon className="h-6 w-6 hover:text-yellow-500" />
              }
            >
              Pay with Fiat
            </Button>
          )}
          <Button
            type="submit"
            className={SHOPSTRBUTTONCLASSNAMES + " mt-3"}
            onClick={() => {
              if (!userLoggedIn) {
                onOpen();
                return;
              }
              if (
                uniqueShippingTypes.length === 1 &&
                uniqueShippingTypes.includes("Free/Pickup")
              ) {
                setIsCashuPayment(false);
                setShowShippingOption(true);
              } else if (
                !uniqueShippingTypes.includes("N/A") &&
                !uniqueShippingTypes.includes("Pickup")
              ) {
                setIsCashuPayment(false);
                setNeedsShippingInfo(true);
                setNeedsCombinedInfo(false);
                setShowPurchaseTypeOption(true);
              } else if (
                !uniqueShippingTypes.includes("Free") &&
                !uniqueShippingTypes.includes("Added Cost")
              ) {
                setIsCashuPayment(false);
                setNeedsShippingInfo(false);
                setNeedsCombinedInfo(false);
                setShowPurchaseTypeOption(true);
              } else if (
                !uniqueShippingTypes.includes("Free") &&
                !uniqueShippingTypes.includes("Added Cost") &&
                !uniqueShippingTypes.includes("N/A") &&
                !uniqueShippingTypes.includes("Pickup") &&
                !uniqueShippingTypes.includes("Free/Pickup")
              ) {
                setIsCashuPayment(false);
                setNeedsShippingInfo(false);
                setNeedsCombinedInfo(false);
                setShowPurchaseTypeOption(true);
              } else {
                setIsCashuPayment(false);
                setNeedsShippingInfo(false);
                setNeedsCombinedInfo(true);
                setShowPurchaseTypeOption(true);
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
              if (!userLoggedIn) {
                onOpen();
                return;
              }
              if (
                uniqueShippingTypes.length === 1 &&
                uniqueShippingTypes.includes("Free/Pickup")
              ) {
                setIsCashuPayment(true);
                setShowShippingOption(true);
              } else if (
                !uniqueShippingTypes.includes("N/A") &&
                !uniqueShippingTypes.includes("Pickup")
              ) {
                setIsCashuPayment(true);
                setNeedsShippingInfo(true);
                setShowPurchaseTypeOption(true);
              } else if (
                !uniqueShippingTypes.includes("Free") &&
                !uniqueShippingTypes.includes("Added Cost")
              ) {
                setIsCashuPayment(true);
                setNeedsShippingInfo(false);
                setShowPurchaseTypeOption(true);
              } else if (
                !uniqueShippingTypes.includes("Free") &&
                !uniqueShippingTypes.includes("Added Cost") &&
                !uniqueShippingTypes.includes("N/A") &&
                !uniqueShippingTypes.includes("Pickup") &&
                !uniqueShippingTypes.includes("Free/Pickup")
              ) {
                setIsCashuPayment(true);
                setNeedsShippingInfo(false);
                setShowPurchaseTypeOption(true);
              } else {
                setIsCashuPayment(true);
                setNeedsShippingInfo(false);
                setShowPurchaseTypeOption(true);
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
        <Card className="mt-3 w-3/4">
          <CardHeader className="flex justify-center gap-3">
            <span className="text-xl font-bold">Lightning Invoice</span>
          </CardHeader>
          <Divider />
          <CardBody className="flex flex-col items-center">
            <DisplayCostBreakdown
              subtotal={subtotal}
              shippingCost={totalShippingCost}
            />
          </CardBody>
          <CardFooter className="flex flex-col items-center">
            {!paymentConfirmed ? (
              <div className="flex flex-col items-center justify-center">
                {qrCodeUrl ? (
                  <>
                    <h3 className="mt-3 text-center text-lg font-medium leading-6 text-gray-900 text-light-text dark:text-dark-text">
                      Don&apos;t refresh or close the page until the payment has
                      been confirmed!
                    </h3>
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
                              invoice.length
                            )}`
                          : invoice}
                      </p>
                      <ClipboardIcon
                        onClick={handleCopyInvoice}
                        className={`ml-2 h-4 w-4 cursor-pointer text-light-text dark:text-dark-text ${
                          copiedToClipboard ? "hidden" : ""
                        }`}
                      />
                      <CheckIcon
                        className={`ml-2 h-4 w-4 cursor-pointer text-light-text dark:text-dark-text ${
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

      {fiatOrderIsPlaced && (
        <div className="flex flex-col items-center justify-center">
          <h3 className="mt-3 text-center text-lg font-medium leading-6 text-gray-900">
            Order confirmed!
          </h3>
          <Image
            alt="Payment Confirmed"
            className="object-cover"
            src="../payment-confirmed.gif"
            width={350}
          />
        </div>
      )}

      <Modal
        backdrop="blur"
        isOpen={showFiatTypeOption}
        onClose={() => {
          setShowFiatTypeOption(false);
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
            Select your fiat payment preference:
          </ModalHeader>
          <ModalBody className="flex flex-col overflow-hidden">
            <div className="flex items-center justify-center">
              <Select
                label="Fiat Payment Options"
                className="max-w-xs"
                onChange={(e) => {
                  setSelectedFiatOption(e.target.value);
                  if (uniqueShippingTypes.includes("Free/Pickup")) {
                    setShowShippingOption(true);
                  } else {
                    setShowPurchaseTypeOption(true);
                  }
                  setShowFiatTypeOption(false);
                }}
              >
                {fiatPaymentOptions &&
                  fiatPaymentOptions.map((option) => (
                    <SelectItem
                      key={option}
                      value={option}
                      className="text-light-text dark:text-dark-text"
                    >
                      {option}
                    </SelectItem>
                  ))}
              </Select>
            </div>
          </ModalBody>
        </ModalContent>
      </Modal>

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
          <ModalBody className="flex flex-col overflow-hidden">
            <div className="flex items-center justify-center">
              <Select label="Delivery Method" className="max-w-xs">
                <SelectItem
                  key="in-person"
                  className="text-light-text dark:text-dark-text"
                  onClick={async () => {
                    setShowShippingOption(false);
                    if (isFiatPayment) {
                      await handleFiatPayment(totalCost);
                    } else if (isCashuPayment) {
                      await handleCashuPayment(totalCost);
                    } else {
                      await handleLightningPayment(totalCost);
                    }
                  }}
                >
                  In-person
                </SelectItem>
                <SelectItem
                  key="free"
                  className="text-light-text dark:text-dark-text"
                  onClick={() => {
                    handleToggleShippingModal();
                    setShowShippingOption(false);
                  }}
                >
                  Free shipping
                </SelectItem>
                <SelectItem
                  key="pickup"
                  className="text-light-text dark:text-dark-text"
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
        isOpen={showPurchaseTypeOption}
        onClose={() => {
          setShowPurchaseTypeOption(false);
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
            Select your purchase type:
          </ModalHeader>
          <ModalBody className="flex flex-col overflow-hidden">
            <div className="flex items-center justify-center">
              <Select label="Purchase Type" className="max-w-xs">
                <SelectItem
                  key="in-person"
                  className="text-light-text dark:text-dark-text"
                  onClick={async () => {
                    setShowPurchaseTypeOption(false);
                    if (isFiatPayment) {
                      await handleFiatPayment(totalCost);
                    } else if (isCashuPayment) {
                      await handleCashuPayment(totalCost);
                    } else {
                      await handleLightningPayment(totalCost);
                    }
                  }}
                >
                  In-person
                </SelectItem>
                <SelectItem
                  key="online-order"
                  className="text-light-text dark:text-dark-text"
                  onClick={() => {
                    if (needsCombinedInfo) {
                      handleToggleCombinedModal();
                    } else if (needsShippingInfo) {
                      handleToggleShippingModal();
                    } else {
                      handleToggleContactModal();
                    }
                    setShowPurchaseTypeOption(false);
                  }}
                >
                  Online order
                </SelectItem>
              </Select>
            </div>
          </ModalBody>
        </ModalContent>
      </Modal>

      <ShippingForm
        showShippingModal={showShippingModal}
        handleToggleShippingModal={handleToggleShippingModal}
        handleShippingSubmit={handleShippingSubmit}
        onShippingSubmit={onShippingSubmit}
        shippingControl={shippingControl}
        requiredInfo={requiredInfo !== "" ? requiredInfo : undefined}
      />

      <ContactForm
        showContactModal={showContactModal}
        handleToggleContactModal={handleToggleContactModal}
        handleContactSubmit={handleContactSubmit}
        onContactSubmit={onContactSubmit}
        contactControl={contactControl}
        requiredInfo={requiredInfo !== "" ? requiredInfo : undefined}
      />

      <CombinedContactForm
        showCombinedModal={showCombinedModal}
        handleToggleCombinedModal={handleToggleCombinedModal}
        handleCombinedSubmit={handleCombinedSubmit}
        onCombinedSubmit={onCombinedSubmit}
        combinedControl={combinedControl}
        requiredInfo={requiredInfo !== "" ? requiredInfo : undefined}
      />

      {fiatOrderIsPlaced || invoiceIsPaid || cashuPaymentSent ? (
        <>
          <Modal
            backdrop="blur"
            isOpen={fiatOrderIsPlaced || invoiceIsPaid || cashuPaymentSent}
            onClose={() => {
              setFiatOrderIsPlaced(false);
              setInvoiceIsPaid(false);
              setCashuPaymentSent(false);
              router.push("/marketplace");
            }}
            // className="bg-light-fg dark:bg-dark-fg text-black dark:text-white"
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
                  The seller will receive a DM with your order details.
                </div>
              </ModalBody>
            </ModalContent>
          </Modal>
        </>
      ) : null}
      {invoiceGenerationFailed ? (
        <>
          <Modal
            backdrop="blur"
            isOpen={invoiceGenerationFailed}
            onClose={() => setInvoiceGenerationFailed(false)}
            // className="bg-light-fg dark:bg-dark-fg text-black dark:text-white"
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
      {cashuPaymentFailed ? (
        <>
          <Modal
            backdrop="blur"
            isOpen={cashuPaymentFailed}
            onClose={() => setCashuPaymentFailed(false)}
            // className="bg-light-fg dark:bg-dark-fg text-black dark:text-white"
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
      <SignInModal isOpen={isOpen} onClose={onClose} />
      <FailureModal
        bodyText={failureText}
        isOpen={showFailureModal}
        onClose={() => {
          setShowFailureModal(false);
          setFailureText("");
        }}
      />
    </>
  );
}
