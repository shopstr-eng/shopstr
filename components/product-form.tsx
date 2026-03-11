import { useEffect, useState, useContext } from "react";
import CryptoJS from "crypto-js";
import { useRouter } from "next/router";
import { useForm, Controller } from "react-hook-form";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Textarea,
  Input,
  Select,
  SelectItem,
  SelectSection,
  Chip,
  Image,
  Switch,
} from "@nextui-org/react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  InformationCircleIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { Carousel } from "react-responsive-carousel";
import "react-responsive-carousel/lib/styles/carousel.min.css";
import {
  PREVNEXTBUTTONSTYLES,
  CATEGORIES,
  SHIPPING_OPTIONS,
  BLUEBUTTONCLASSNAMES,
} from "@/utils/STATIC-VARIABLES";
import {
  PostListing,
  getLocalStorageData,
  finalizeAndSendNostrEvent,
} from "@/utils/nostr/nostr-helper-functions";
import LocationDropdown from "./utility-components/dropdowns/location-dropdown";
import ConfirmActionDropdown from "./utility-components/dropdowns/confirm-action-dropdown";
import { ProductContext, ProfileMapContext } from "../utils/context/context";
import { ProductData } from "@/utils/parsers/product-parser-functions";
import { buildSrcSet } from "@/utils/images";
import { FileUploaderButton } from "./utility-components/file-uploader";
import { EncryptedAgreementUploaderButton } from "./utility-components/encrypted-agreement-uploader";
import currencySelection from "../public/currencySelection.json";
import {
  NostrContext,
  SignerContext,
} from "@/components/utility-components/nostr-context-provider";
import { ProductFormValues } from "../utils/types/types";
import StripeConnectModal from "@/components/stripe-connect/StripeConnectModal";
import { createAuthEventTemplate } from "@/utils/stripe/verify-nostr-auth";

interface ProductFormProps {
  handleModalToggle: () => void;
  showModal: boolean;
  oldValues?: ProductData;
  handleDelete?: (productId: string) => Promise<void>;
  onSubmitCallback?: () => void;
}

export default function ProductForm({
  showModal,
  handleModalToggle,
  oldValues,
  handleDelete,
  onSubmitCallback,
}: ProductFormProps) {
  const router = useRouter();
  const [images, setImages] = useState<string[]>([]);
  const [imageError, setImageError] = useState<string | null>(null);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [pubkey, setPubkey] = useState("");
  const [relayHint, setRelayHint] = useState("");
  const [isEdit, setIsEdit] = useState(false);
  const [isPostingOrUpdatingProduct, setIsPostingOrUpdatingProduct] =
    useState(false);
  const [showOptionalTags, setShowOptionalTags] = useState(false);
  const [herdshareAgreementUrl, setHerdshareAgreementUrl] =
    useState<string>("");
  const [isFlashSale, setIsFlashSale] = useState(false);
  const [subscriptionEnabled, setSubscriptionEnabled] = useState(false);
  const [subscriptionDiscount, setSubscriptionDiscount] = useState("");
  const [subscriptionFrequencies, setSubscriptionFrequencies] = useState<
    string[]
  >([]);
  const [showStripeConnectModal, setShowStripeConnectModal] = useState(false);
  const [hasStripeAccount, setHasStripeAccount] = useState<boolean | null>(
    null
  );
  const productEventContext = useContext(ProductContext);
  const profileContext = useContext(ProfileMapContext);
  const {
    signer,
    isLoggedIn,
    pubkey: signerPubKey,
  } = useContext(SignerContext);
  const { nostr } = useContext(NostrContext);

  const { handleSubmit, control, reset, watch } = useForm({
    defaultValues: oldValues
      ? {
          "Product Name": oldValues.title,
          Description: oldValues.summary,
          Price: String(oldValues.price),
          Currency: oldValues.currency,
          Location: oldValues.location,
          "Shipping Option": oldValues.shippingType,
          "Shipping Cost": oldValues.shippingCost,
          "Pickup Locations": oldValues.pickupLocations || [""],
          Category: oldValues.categories ? oldValues.categories.join(",") : "",
          Quantity: oldValues.quantity ? String(oldValues.quantity) : "",
          Sizes: oldValues.sizes ? oldValues.sizes.join(",") : "",
          "Size Quantities": oldValues.sizeQuantities
            ? oldValues.sizeQuantities
            : new Map<string, number>(),
          Volumes: oldValues.volumes ? oldValues.volumes.join(",") : "",
          "Volume Prices": oldValues.volumePrices
            ? oldValues.volumePrices
            : new Map<string, number>(),
          Weights: oldValues.weights ? oldValues.weights.join(",") : "",
          "Weight Prices": oldValues.weightPrices
            ? oldValues.weightPrices
            : new Map<string, number>(),
          "Bulk Pricing Enabled": oldValues.bulkPrices
            ? oldValues.bulkPrices.size > 0
            : false,
          "Bulk Prices": oldValues.bulkPrices
            ? oldValues.bulkPrices
            : new Map<number, number>(),
          Condition: oldValues.condition ? oldValues.condition : "",
          Status: oldValues.status ? oldValues.status : "",
          Required: oldValues.required ? oldValues.required : "",
          Restrictions: oldValues.restrictions ? oldValues.restrictions : "",
          Expiration: oldValues.expiration
            ? new Date(oldValues.expiration * 1000).toISOString().slice(0, 16)
            : "",
        }
      : {
          Currency: "USD",
          "Shipping Option": "Pickup",
          Status: "active",
          "Pickup Locations": [""],
        },
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      const { relays } = getLocalStorageData();
      setPubkey(signerPubKey as string);
      setRelayHint(relays[0] as string);
    }
  }, [signerPubKey]);

  useEffect(() => {
    setImages(oldValues?.images || []);
    setIsEdit(oldValues ? true : false);

    // Initialize herdshare agreement URL if editing existing product
    if (oldValues?.herdshareAgreement) {
      setHerdshareAgreementUrl(oldValues.herdshareAgreement);
    } else {
      setHerdshareAgreementUrl("");
    }

    if (oldValues?.subscriptionEnabled) {
      setSubscriptionEnabled(true);
      setSubscriptionDiscount(
        oldValues.subscriptionDiscount
          ? String(oldValues.subscriptionDiscount)
          : ""
      );
      setSubscriptionFrequencies(oldValues.subscriptionFrequency || []);
    } else {
      setSubscriptionEnabled(false);
      setSubscriptionDiscount("");
      setSubscriptionFrequencies([]);
    }

    if (showModal && !oldValues && signerPubKey) {
      const profile = profileContext.profileData.get(signerPubKey);
      const hasLightning = !!(
        profile?.content?.lud16 || profile?.content?.lnurl
      );
      setIsFlashSale(hasLightning);
    } else {
      setIsFlashSale(false);
    }

    if (showModal && signerPubKey && signer) {
      (async () => {
        try {
          const template = createAuthEventTemplate(signerPubKey);
          const signedEvent = await signer.sign(template);
          const res = await fetch("/api/stripe/connect/account-status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pubkey: signerPubKey, signedEvent }),
          });
          if (res.ok) {
            const data = await res.json();
            setHasStripeAccount(!!data.chargesEnabled);
            if (!data.chargesEnabled) {
              setSubscriptionEnabled(false);
            }
          } else {
            setHasStripeAccount(false);
            setSubscriptionEnabled(false);
          }
        } catch {
          setHasStripeAccount(false);
          setSubscriptionEnabled(false);
        }
      })();
    } else {
      setHasStripeAccount(null);
    }
  }, [showModal, signerPubKey, profileContext]);

  const onSubmit = async (data: {
    [x: string]: string | Map<string, number> | string[];
  }) => {
    if (images.length === 0) {
      setImageError("At least one image is required.");
      return;
    } else {
      setImageError(null);
    }

    setIsPostingOrUpdatingProduct(true);
    const hashHex = CryptoJS.SHA256(data["Product Name"] as string).toString(
      CryptoJS.enc.Hex
    );

    const tags: ProductFormValues = [
      ["d", oldValues?.d || hashHex],
      ["alt", ("Product listing: " + data["Product Name"]) as string],
      [
        "client",
        "Milk Market",
        "31990:" + pubkey + ":" + (oldValues?.d || hashHex),
        relayHint,
      ],
      ["title", data["Product Name"] as string],
      ["summary", data["Description"] as string],
      ["price", data["Price"] as string, data["Currency"] as string],
      ["location", data["Location"] as string],
      [
        "shipping",
        data["Shipping Option"] as string,
        data["Shipping Cost"] ? (data["Shipping Cost"] as string) : "0",
        data["Currency"] as string,
      ],
    ];

    images.forEach((image) => {
      tags.push(["image", image]);
    });

    (data["Category"] as string).split(",").forEach((category) => {
      tags.push(["t", category]);
    });
    tags.push(["t", "MilkMarket"]);
    tags.push(["t", "FREEMILK"]);

    if (data["Quantity"]) {
      tags.push(["quantity", data["Quantity"].toString()]);
    }

    if (data["Sizes"]) {
      const sizesArray = Array.isArray(data["Sizes"])
        ? data["Sizes"]
        : (data["Sizes"] as string).split(",").filter(Boolean);
      sizesArray.forEach((size) => {
        const quantity =
          (data["Size Quantities"] as Map<string, number>).get(size) || 0;
        tags.push(["size", size, quantity.toString()]);
      });
    }

    if (data["Volumes"]) {
      const volumesArray = Array.isArray(data["Volumes"])
        ? data["Volumes"]
        : (data["Volumes"] as string).split(",").filter(Boolean);
      volumesArray.forEach((volume) => {
        const price =
          (data["Volume Prices"] as Map<string, number>).get(volume) || 0;
        tags.push(["volume", volume, price.toString()]);
      });
    }

    if (data["Weights"]) {
      const weightsArray = Array.isArray(data["Weights"])
        ? data["Weights"]
        : (data["Weights"] as string).split(",").filter(Boolean);
      weightsArray.forEach((weight) => {
        const price =
          (data["Weight Prices"] as Map<string, number>).get(weight) || 0;
        tags.push(["weight", weight, price.toString()]);
      });
    }
    if (data["Bulk Pricing Enabled"] && data["Bulk Prices"]) {
      const bulkPrices = data["Bulk Prices"] as unknown as Map<number, number>;
      bulkPrices.forEach((price, units) => {
        if (units > 0 && price > 0) {
          tags.push(["bulk", units.toString(), price.toString()]);
        }
      });
    }

    if (data["Condition"]) {
      tags.push(["condition", data["Condition"] as string]);
    }

    if (data["Status"]) {
      tags.push(["status", data["Status"] as string]);
    }

    if (data["Required"]) {
      tags.push(["required", data["Required"] as string]);
    }

    if (data["Restrictions"]) {
      tags.push(["restrictions", data["Restrictions"] as string]);
    }

    // Add herdshare agreement if URL exists and herdshare category is selected
    const categories = (data["Category"] as string).toLowerCase();
    if (herdshareAgreementUrl && categories.includes("herdshare")) {
      tags.push(["herdshare_agreement", herdshareAgreementUrl]);
    }

    if (categories.includes("beef")) {
      tags.push(["t", "SAVEBEEF"]);
    }

    if (subscriptionEnabled) {
      tags.push(["subscription", "true"]);
      if (subscriptionDiscount) {
        tags.push(["subscription_discount", subscriptionDiscount]);
      }
      if (subscriptionFrequencies.length > 0) {
        tags.push(["subscription_frequency", ...subscriptionFrequencies]);
      }
    }

    if (data["Expiration"]) {
      const dateObj = new Date(data["Expiration"] as string);
      if (!isNaN(dateObj.getTime())) {
        const unixTime = Math.floor(dateObj.getTime() / 1000);
        tags.push(["valid_until", unixTime.toString()]);
      }
    }

    // Add pickup locations if they exist and shipping involves pickup
    if (
      data["Pickup Locations"] &&
      Array.isArray(data["Pickup Locations"]) &&
      (data["Shipping Option"] === "Pickup" ||
        data["Shipping Option"] === "Free/Pickup" ||
        data["Shipping Option"] === "Added Cost/Pickup")
    ) {
      (data["Pickup Locations"] as string[])
        .filter((location) => location.trim() !== "")
        .forEach((location) => {
          tags.push(["pickup_location", location.trim()]);
        });
    }

    const newListing = await PostListing(tags, signer!, isLoggedIn!, nostr!);

    //Handle Flash Sale (Zapsnag) Publication
    if (isFlashSale) {
      try {
        const finalContent = `${data["Description"]}\n\nPrice: ${
          data["Price"]
        } ${data["Currency"]}\n\n#zapsnag\n${images[0] || ""}`;
        const flashSaleEvent = {
          kind: 1,
          created_at: Math.floor(Date.now() / 1000),
          tags: [
            ["t", "zapsnag"],
            ["t", "milk-market-zapsnag"],
            ["d", "zapsnag"],
          ],
          content: finalContent,
        };

        if (data["Quantity"]) {
          flashSaleEvent.tags.push(["quantity", data["Quantity"].toString()]);
        }
        if (images[0]) flashSaleEvent.tags.push(["image", images[0]]);
        await finalizeAndSendNostrEvent(signer!, nostr!, flashSaleEvent);
      } catch (e) {
        console.error("Failed to publish flash sale note", e);
      }
    }

    if (isEdit) {
      if (handleDelete && oldValues?.id) {
        try {
          await handleDelete(oldValues.id);
        } catch (error) {
          console.error("Failed to delete old product:", error);
        }
      }
    }

    clear();
    productEventContext.addNewlyCreatedProductEvent(newListing);
    setIsPostingOrUpdatingProduct(false);
    if (onSubmitCallback) {
      onSubmitCallback();
    }

    if (pubkey && !isEdit && signer) {
      try {
        const template = createAuthEventTemplate(pubkey);
        const signedEvent = await signer.sign(template);
        const res = await fetch("/api/stripe/connect/account-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pubkey, signedEvent }),
        });
        if (res.ok) {
          const data = await res.json();
          if (!data.chargesEnabled) {
            setShowStripeConnectModal(true);
          }
        }
      } catch {
        // silently fail
      }
    }
  };

  const clear = () => {
    handleModalToggle();
    setImages([]);
    setHerdshareAgreementUrl("");
    setSubscriptionEnabled(false);
    setSubscriptionDiscount("");
    setSubscriptionFrequencies([]);
    reset();
    setCurrentSlide(0);
  };

  const watchShippingOption = watch("Shipping Option");
  const watchCurrency = watch("Currency");
  const watchCategory = watch("Category");

  const deleteImage = (index: number) => () => {
    setImages((prevValues) => {
      const updatedImages = [...prevValues];
      if (index > -1) {
        updatedImages.splice(index, 1);
      }
      const newCurrentSlide = Math.min(currentSlide, updatedImages.length - 1);
      setCurrentSlide(newCurrentSlide >= 0 ? newCurrentSlide : 0);
      return updatedImages;
    });
  };

  const currencyOptions = Object.keys(currencySelection).map((code) => ({
    value: code,
  }));

  return (
    <>
      <Modal
        backdrop="blur"
        isOpen={showModal}
        onClose={handleModalToggle}
        classNames={{
          body: "py-6 bg-dark-fg",
          backdrop: "bg-[#292f46]/50 backdrop-opacity-60",
          header: "border-b-[1px] border-[#292f46] bg-dark-fg rounded-t-lg",
          footer: "border-t-[1px] border-[#292f46] bg-dark-fg rounded-b-lg",
          closeButton: "hover:bg-black/5 active:bg-white/10",
        }}
        scrollBehavior={"outside"}
        size="2xl"
      >
        <ModalContent>
          <ModalHeader className="flex flex-row items-center justify-between border-b-2 border-black bg-white px-6 py-4">
            <h2 className="text-2xl font-bold text-black">
              Add New Product Listing
            </h2>
          </ModalHeader>
          <form
            onSubmit={(e) => {
              if (e.target !== e.currentTarget) {
                e.preventDefault();
              }
              return handleSubmit(onSubmit as any)(e);
            }}
          >
            <ModalBody className="bg-white px-6 py-6">
              <Controller
                name="Product Name"
                control={control}
                render={({
                  field: { onChange, onBlur, value },
                  fieldState: { error },
                }) => {
                  const isErrored = error !== undefined;
                  const errorMessage: string = error?.message
                    ? error.message
                    : "";
                  return (
                    <div className="mb-4">
                      <Input
                        classNames={{
                          label: "!text-black font-semibold text-base mb-1",
                          input: "text-base !text-black",
                          inputWrapper:
                            "border-2 border-black rounded-md shadow-none h-14 !bg-white data-[hover=true]:!bg-white data-[focus=true]:!bg-white data-[invalid=true]:!bg-white",
                        }}
                        autoFocus
                        variant="flat"
                        fullWidth={true}
                        label="Product name"
                        labelPlacement="outside"
                        placeholder="Enter product name..."
                        isInvalid={isErrored}
                        errorMessage={errorMessage}
                        onChange={onChange}
                        onBlur={onBlur}
                        value={value}
                      />
                    </div>
                  );
                }}
              />
              <Carousel
                showArrows={images.length > 1}
                showStatus={false}
                showIndicators={images.length > 1}
                showThumbs={images.length > 1}
                infiniteLoop
                preventMovementUntilSwipeScrollTolerance
                swipeScrollTolerance={50}
                selectedItem={currentSlide}
                onChange={(index) => setCurrentSlide(index)}
                onClickItem={(index) => {
                  setCurrentSlide(index);
                  return false;
                }}
                renderArrowPrev={(onClickHandler, hasPrev, label) =>
                  hasPrev && (
                    <button
                      type="button"
                      className={`left-4 ${PREVNEXTBUTTONSTYLES}`}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onClickHandler();
                      }}
                      title={label}
                    >
                      <ChevronLeftIcon className="text-dark-text h-6 w-6" />
                    </button>
                  )
                }
                renderArrowNext={(onClickHandler, hasNext, label) =>
                  hasNext && (
                    <button
                      type="button"
                      className={`right-4 ${PREVNEXTBUTTONSTYLES}`}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onClickHandler();
                      }}
                      title={label}
                    >
                      <ChevronRightIcon className="text-dark-text h-6 w-6" />
                    </button>
                  )
                }
                renderIndicator={(onClickHandler, isSelected, index, label) => {
                  const base =
                    "inline-block w-3 h-3 rounded-full mx-1 cursor-pointer";
                  return (
                    <li
                      key={index}
                      className={
                        isSelected
                          ? `${base} bg-blue-500`
                          : `${base} bg-gray-300 hover:bg-gray-500`
                      }
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onClickHandler(e);
                      }}
                      title={`${label} ${index + 1}`}
                      role="button"
                      tabIndex={0}
                      style={{ marginBottom: "10px" }}
                    />
                  );
                }}
              >
                {images.length > 0
                  ? images.map((image, index) => (
                      <div
                        key={index}
                        className="relative flex h-full w-full items-center justify-center p-4"
                        onClick={(e) => e.preventDefault()}
                      >
                        <div className="absolute right-4 top-4 z-20">
                          <ConfirmActionDropdown
                            helpText="Are you sure you want to delete this image?"
                            buttonLabel="Delete Image"
                            onConfirm={deleteImage(index)}
                          >
                            <Button
                              type="button"
                              isIconOnly
                              color="danger"
                              aria-label="Trash"
                              radius="full"
                              className="bg-gradient-to-tr from-blue-950 to-red-950 text-white"
                              variant="bordered"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <TrashIcon style={{ padding: 4 }} />
                            </Button>
                          </ConfirmActionDropdown>
                        </div>
                        <Image
                          alt="Product Image"
                          className="object-cover"
                          width={350}
                          src={image}
                          srcSet={buildSrcSet(image)}
                          onClick={(e) => e.preventDefault()}
                        />
                      </div>
                    ))
                  : [
                      <div
                        key="placeholder"
                        className="flex h-full w-full items-center justify-center p-4"
                        onClick={(e) => e.preventDefault()}
                      >
                        <div className="my-4 w-full rounded-xl border-2 border-dashed border-gray-400 bg-gray-50 p-12 text-center">
                          <div className="mb-4 flex justify-center">
                            <svg
                              className="h-16 w-16 text-gray-400"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                              />
                            </svg>
                          </div>
                          <h3 className="mb-2 text-lg font-bold text-black">
                            Drag & Drop Images Here
                          </h3>
                          <p className="mb-4 text-sm text-gray-500">
                            Or click below to select files
                          </p>
                        </div>
                      </div>,
                    ]}
              </Carousel>
              {imageError && (
                <div className="mb-4 text-red-600">{imageError}</div>
              )}

              <FileUploaderButton
                isProductUpload={true}
                className="mb-4 w-full rounded-md border-2 border-black bg-blue-400 py-4 text-base font-bold text-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                imgCallbackOnUpload={(imgUrl) => {
                  if (imgUrl && imgUrl.length > 0) {
                    setImageError(null);
                    setImages((prevValues) => [...prevValues, imgUrl]);
                  }
                }}
              >
                Upload Images
              </FileUploaderButton>

              <Controller
                name="Description"
                control={control}
                rules={{
                  required: "A description is required.",
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
                    <div className="mb-4">
                      <label className="mb-2 block text-base font-semibold text-black">
                        Description
                      </label>
                      <Textarea
                        classNames={{
                          input: "text-base min-h-[120px] !text-black",
                          inputWrapper:
                            "border-2 border-black rounded-md shadow-none !bg-white data-[hover=true]:!bg-white data-[focus=true]:!bg-white data-[invalid=true]:!bg-white",
                        }}
                        variant="flat"
                        fullWidth={true}
                        placeholder="Enter product description..."
                        isInvalid={isErrored}
                        errorMessage={errorMessage}
                        onChange={onChange}
                        onBlur={onBlur}
                        value={value}
                      />
                    </div>
                  );
                }}
              />

              <Controller
                name="Price"
                control={control}
                rules={{
                  required: "A price is required.",
                  min: { value: 0, message: "Price must be greater than 0" },
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
                    <div className="mb-4">
                      <label className="mb-2 block text-base font-semibold text-black">
                        Price
                      </label>
                      <Input
                        classNames={{
                          input: "text-base !text-black",
                          inputWrapper:
                            "border-2 border-black rounded-md shadow-none h-14 !bg-white data-[hover=true]:!bg-white data-[focus=true]:!bg-white data-[invalid=true]:!bg-white",
                        }}
                        type="number"
                        variant="flat"
                        placeholder="0"
                        isInvalid={isErrored}
                        errorMessage={errorMessage}
                        onChange={onChange}
                        onBlur={onBlur}
                        value={value}
                        endContent={
                          <Controller
                            control={control}
                            name="Currency"
                            rules={{
                              required: "Please specify a currency.",
                            }}
                            render={({
                              field: { onChange, onBlur, value },
                            }) => {
                              return (
                                <div className="flex items-center">
                                  <select
                                    className="rounded-md border-2 border-black bg-white px-3 py-2 text-base font-semibold text-black outline-none invalid:bg-white hover:bg-white focus:bg-white [&>option:hover]:bg-primary-yellow [&>option]:bg-white"
                                    key={"currency"}
                                    id="currency"
                                    name="currency"
                                    onChange={onChange}
                                    onBlur={onBlur}
                                    value={value}
                                  >
                                    {currencyOptions.map((currency) => (
                                      <option
                                        key={currency.value}
                                        value={currency.value}
                                      >
                                        {currency.value}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              );
                            }}
                          />
                        }
                      />
                    </div>
                  );
                }}
              />

              <div className="mx-0 my-4 flex items-start text-left">
                <InformationCircleIcon className="mr-2 mt-0.5 h-5 w-5 flex-shrink-0 text-black" />
                <p className="text-xs text-black">
                  Your donation rate on sales is set to{" "}
                  {profileContext.profileData.get(pubkey)?.content
                    ?.shopstr_donation || 2.1}
                  %. You can modify this in your{" "}
                  <span
                    className="cursor-pointer underline hover:text-blue-600"
                    onClick={() => router.push("/settings/user-profile")}
                  >
                    settings
                  </span>
                  .
                </p>
              </div>

              <Controller
                name="Location"
                control={control}
                rules={{
                  required: "Please specify a location.",
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
                    <div className="mb-4">
                      <label className="mb-2 block text-base font-semibold text-black">
                        Location
                      </label>
                      <LocationDropdown
                        classNames={{
                          trigger:
                            "border-2 border-black rounded-md shadow-none h-14 bg-white data-[hover=true]:bg-white data-[focus=true]:bg-white data-[invalid=true]:bg-white",
                          listbox:
                            "bg-white [&_li]:!bg-white [&_li:hover]:!bg-primary-yellow [&_li[data-hover=true]]:!bg-primary-yellow",
                        }}
                        variant="flat"
                        aria-label="Select Location"
                        placeholder="Select location..."
                        isInvalid={isErrored}
                        errorMessage={errorMessage}
                        onChange={onChange}
                        onBlur={onBlur}
                        value={value}
                      />
                    </div>
                  );
                }}
              />

              <Controller
                name="Shipping Option"
                control={control}
                rules={{
                  required: "Please specify a shipping option.",
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
                    <div className="mb-4">
                      <label className="mb-2 block text-base font-semibold text-black">
                        Shipping option
                      </label>
                      <Select
                        classNames={{
                          trigger:
                            "border-2 border-black rounded-md shadow-none h-14 bg-white data-[hover=true]:bg-white data-[focus=true]:bg-white data-[invalid=true]:bg-white",
                          value: "text-base !text-black",
                          listbox:
                            "bg-white [&_li]:!bg-white [&_li:hover]:!bg-primary-yellow [&_li[data-hover=true]]:!bg-primary-yellow",
                        }}
                        variant="flat"
                        aria-label="Shipping Option"
                        placeholder="N/A"
                        isInvalid={isErrored}
                        errorMessage={errorMessage}
                        disallowEmptySelection={true}
                        onChange={onChange}
                        onBlur={onBlur}
                        selectedKeys={[value as string]}
                      >
                        <SelectSection>
                          {SHIPPING_OPTIONS.map((option) => (
                            <SelectItem key={option}>{option}</SelectItem>
                          ))}
                        </SelectSection>
                      </Select>
                    </div>
                  );
                }}
              />

              {(watchShippingOption === "Added Cost" ||
                watchShippingOption === "Added Cost/Pickup") && (
                <Controller
                  name="Shipping Cost"
                  control={control}
                  rules={{
                    required: "A Shipping Cost is required.",
                    min: {
                      value: 0,
                      message: "Shipping Cost must be greater than 0",
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
                      <div className="mb-4">
                        <Input
                          classNames={{
                            input: "text-base !text-black",
                            inputWrapper:
                              "border-2 border-black rounded-md shadow-none h-14 !bg-white data-[hover=true]:!bg-white data-[focus=true]:!bg-white data-[invalid=true]:!bg-white",
                          }}
                          type="number"
                          variant="flat"
                          placeholder="Shipping Cost"
                          isInvalid={isErrored}
                          errorMessage={errorMessage}
                          onChange={onChange}
                          onBlur={onBlur}
                          value={value?.toString()}
                          endContent={
                            <div className="flex items-center">
                              <select
                                className="rounded-md border-2 border-black bg-white px-3 py-2 text-base font-semibold text-black outline-none invalid:bg-white hover:bg-white focus:bg-white [&>option:hover]:bg-primary-yellow [&>option]:bg-white"
                                key={"currency"}
                                id="currency"
                                name="currency"
                                value={watchCurrency}
                                disabled={true}
                              >
                                {currencyOptions.map((currency) => (
                                  <option
                                    key={currency.value}
                                    value={currency.value}
                                  >
                                    {currency.value}
                                  </option>
                                ))}
                              </select>
                            </div>
                          }
                        />
                      </div>
                    );
                  }}
                />
              )}

              {(watchShippingOption === "Pickup" ||
                watchShippingOption === "Free/Pickup" ||
                watchShippingOption === "Added Cost/Pickup") && (
                <div className="mb-4 space-y-4">
                  <h3 className="text-base font-semibold text-black">
                    Pickup Locations
                  </h3>
                  <p className="text-sm text-gray-600">
                    Add one or more pickup locations where customers can collect
                    their orders (if applicable).
                  </p>

                  <Controller
                    name="Pickup Locations"
                    control={control}
                    defaultValue={[""]}
                    render={({ field: { onChange, value = [""] } }) => (
                      <div className="space-y-3">
                        {value.map((location: string, index: number) => (
                          <div key={index} className="flex items-center gap-2">
                            <Input
                              className="flex-1"
                              classNames={{
                                input: "text-base !text-black",
                                inputWrapper:
                                  "border-2 border-black rounded-md shadow-none h-14 !bg-white data-[hover=true]:!bg-white data-[focus=true]:!bg-white data-[invalid=true]:!bg-white",
                              }}
                              variant="flat"
                              placeholder={`Pickup location ${
                                index + 1
                              } (e.g., 123 Main St, City, State)`}
                              value={location}
                              onChange={(e) => {
                                const newLocations = [...value];
                                newLocations[index] = e.target.value;
                                onChange(newLocations);
                              }}
                            />
                            {value.length > 1 && (
                              <Button
                                isIconOnly
                                color="danger"
                                variant="light"
                                onClick={() => {
                                  const newLocations = value.filter(
                                    (_: string, i: number) => i !== index
                                  );
                                  onChange(newLocations);
                                }}
                              >
                                <TrashIcon className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        ))}

                        <Button
                          className={`${BLUEBUTTONCLASSNAMES} w-full py-3 text-base`}
                          onClick={() => {
                            const newLocations = [...value, ""];
                            onChange(newLocations);
                          }}
                        >
                          Add Another Pickup Location
                        </Button>
                      </div>
                    )}
                  />
                </div>
              )}

              <Controller
                name="Quantity"
                control={control}
                rules={{
                  min: { value: 1, message: "Quantity must be at least 1" },
                }}
                render={({
                  field: { onChange, value },
                  fieldState: { error },
                }) => {
                  const isErrored = error !== undefined;
                  const errorMessage = error?.message || "";
                  return (
                    <div className="mb-4">
                      <label className="mb-2 block text-base font-semibold text-black">
                        Quantity (optional)
                      </label>
                      <Input
                        classNames={{
                          input: "text-base !text-black",
                          inputWrapper:
                            "border-2 border-black rounded-md shadow-none h-14 !bg-white data-[hover=true]:!bg-white data-[focus=true]:!bg-white data-[invalid=true]:!bg-white",
                        }}
                        variant="flat"
                        type="number"
                        min="1"
                        aria-label="Quantity"
                        placeholder="1"
                        value={value}
                        onChange={(e) =>
                          onChange(parseInt(e.target.value) || 1)
                        }
                        className="w-40"
                        isInvalid={isErrored}
                        errorMessage={errorMessage}
                      />
                    </div>
                  );
                }}
              />

              <Controller
                name="Volumes"
                control={control}
                render={({
                  field: { onChange, onBlur, value },
                  fieldState: { error },
                }) => {
                  const isErrored = error !== undefined;
                  const errorMessage = error?.message || "";

                  const selectedVolumes = Array.isArray(value)
                    ? value
                    : typeof value === "string"
                      ? value.split(",").filter(Boolean)
                      : [];

                  const handleVolumeChange = (newValue: string | string[]) => {
                    const newVolumes = Array.isArray(newValue)
                      ? newValue
                      : newValue.split(",").filter(Boolean);
                    onChange(newVolumes);
                  };

                  return (
                    <div className="mb-4">
                      <label className="mb-2 block text-base font-semibold text-black">
                        Volumes (optional)
                      </label>
                      <Select
                        classNames={{
                          trigger:
                            "border-2 border-black rounded-md shadow-none min-h-14 bg-white data-[hover=true]:bg-white data-[focus=true]:bg-white data-[invalid=true]:bg-white",
                          listbox:
                            "bg-white [&_li]:!bg-white [&_li:hover]:!bg-primary-yellow [&_li[data-hover=true]]:!bg-primary-yellow",
                          value: "!text-black",
                        }}
                        variant="flat"
                        isMultiline={true}
                        aria-label="Volumes"
                        placeholder="Select volumes..."
                        selectionMode="multiple"
                        isInvalid={isErrored}
                        errorMessage={errorMessage}
                        onChange={(e) => handleVolumeChange(e.target.value)}
                        onBlur={onBlur}
                        value={selectedVolumes}
                        defaultSelectedKeys={new Set(selectedVolumes)}
                      >
                        <SelectSection>
                          <SelectItem key="Half-pint" value="Half-pint">
                            Half-pint
                          </SelectItem>
                          <SelectItem key="Pint" value="Pint">
                            Pint
                          </SelectItem>
                          <SelectItem key="Quart" value="Quart">
                            Quart
                          </SelectItem>
                          <SelectItem key="Half-gallon" value="Half-gallon">
                            Half-gallon
                          </SelectItem>
                          <SelectItem key="Gallon" value="Gallon">
                            Gallon
                          </SelectItem>
                        </SelectSection>
                      </Select>
                    </div>
                  );
                }}
              />

              <Controller
                name="Volume Prices"
                control={control}
                render={({
                  field: { onChange, value = new Map<string, number>() },
                }) => {
                  const handlePriceChange = (volume: string, price: number) => {
                    const newPrices = new Map(value);
                    newPrices.set(volume, price);
                    onChange(newPrices);
                  };

                  const volumes = watch("Volumes");
                  const volumeArray = Array.isArray(volumes)
                    ? volumes
                    : typeof volumes === "string"
                      ? volumes
                          .split(",")
                          .filter(Boolean)
                          .map((v) => v.trim())
                      : [];

                  return (
                    <div className="mb-4 flex flex-wrap gap-4">
                      {volumeArray.map((volume: string) => (
                        <div key={volume} className="flex items-center">
                          <span className="mr-2 text-black">{volume}:</span>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={(value.get(volume) || 0).toString()}
                            onChange={(e) =>
                              handlePriceChange(
                                volume,
                                parseFloat(e.target.value) || 0
                              )
                            }
                            className="w-32"
                            classNames={{
                              input: "!text-black",
                              inputWrapper:
                                "border-2 border-black rounded-md shadow-none !bg-white data-[hover=true]:!bg-white data-[focus=true]:!bg-white data-[invalid=true]:!bg-white",
                            }}
                            endContent={
                              <div className="flex items-center">
                                <span className="text-small text-gray-600">
                                  {watchCurrency}
                                </span>
                              </div>
                            }
                          />
                        </div>
                      ))}
                      {volumeArray.length > 0 && (
                        <div className="w-full text-xs text-black opacity-75">
                          Note: Volume prices will override the main product
                          price when selected.
                        </div>
                      )}
                    </div>
                  );
                }}
              />

              <Controller
                name="Weights"
                control={control}
                render={({
                  field: { onChange, onBlur, value },
                  fieldState: { error },
                }) => {
                  const isErrored = error !== undefined;
                  const errorMessage = error?.message || "";

                  const selectedWeights = Array.isArray(value)
                    ? value
                    : typeof value === "string"
                      ? value.split(",").filter(Boolean)
                      : [];

                  const handleWeightChange = (newValue: string | string[]) => {
                    const newWeights = Array.isArray(newValue)
                      ? newValue
                      : newValue.split(",").filter(Boolean);
                    onChange(newWeights);
                  };

                  return (
                    <div className="mb-4">
                      <label className="mb-2 block text-base font-semibold text-black">
                        Weights (optional)
                      </label>
                      <Select
                        classNames={{
                          trigger:
                            "border-2 border-black rounded-md shadow-none min-h-14 bg-white data-[hover=true]:bg-white data-[focus=true]:bg-white data-[invalid=true]:bg-white",
                          listbox:
                            "bg-white [&_li]:!bg-white [&_li:hover]:!bg-primary-yellow [&_li[data-hover=true]]:!bg-primary-yellow",
                          value: "!text-black",
                        }}
                        variant="flat"
                        isMultiline={true}
                        aria-label="Weights"
                        placeholder="Select weights..."
                        selectionMode="multiple"
                        isInvalid={isErrored}
                        errorMessage={errorMessage}
                        onChange={(e) => handleWeightChange(e.target.value)}
                        onBlur={onBlur}
                        value={selectedWeights}
                        defaultSelectedKeys={new Set(selectedWeights)}
                      >
                        <SelectSection>
                          <SelectItem key="1oz" value="1oz">
                            1oz
                          </SelectItem>
                          <SelectItem key="2oz" value="2oz">
                            2oz
                          </SelectItem>
                          <SelectItem key="3oz" value="3oz">
                            3oz
                          </SelectItem>
                          <SelectItem key="4oz" value="4oz">
                            4oz
                          </SelectItem>
                          <SelectItem key="5oz" value="5oz">
                            5oz
                          </SelectItem>
                          <SelectItem key="6oz" value="6oz">
                            6oz
                          </SelectItem>
                          <SelectItem key="7oz" value="7oz">
                            7oz
                          </SelectItem>
                          <SelectItem key="8oz" value="8oz">
                            8oz
                          </SelectItem>
                          <SelectItem key="9oz" value="9oz">
                            9oz
                          </SelectItem>
                          <SelectItem key="10oz" value="10oz">
                            10oz
                          </SelectItem>
                          <SelectItem key="11oz" value="11oz">
                            11oz
                          </SelectItem>
                          <SelectItem key="12oz" value="12oz">
                            12oz
                          </SelectItem>
                          <SelectItem key="13oz" value="13oz">
                            13oz
                          </SelectItem>
                          <SelectItem key="14oz" value="14oz">
                            14oz
                          </SelectItem>
                          <SelectItem key="15oz" value="15oz">
                            15oz
                          </SelectItem>
                          <SelectItem key="16oz" value="16oz">
                            16oz
                          </SelectItem>
                          <SelectItem key="1lbs" value="1lbs">
                            1lbs
                          </SelectItem>
                        </SelectSection>
                      </Select>
                    </div>
                  );
                }}
              />

              <Controller
                name="Weight Prices"
                control={control}
                render={({
                  field: { onChange, value = new Map<string, number>() },
                }) => {
                  const handlePriceChange = (weight: string, price: number) => {
                    const newPrices = new Map(value);
                    newPrices.set(weight, price);
                    onChange(newPrices);
                  };

                  const weights = watch("Weights");
                  const weightArray = Array.isArray(weights)
                    ? weights
                    : typeof weights === "string"
                      ? weights
                          .split(",")
                          .filter(Boolean)
                          .map((w) => w.trim())
                      : [];

                  return (
                    <div className="mb-4 flex flex-wrap gap-4">
                      {weightArray.map((weight: string) => (
                        <div key={weight} className="flex items-center">
                          <span className="mr-2 text-black">{weight}:</span>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={(value.get(weight) || 0).toString()}
                            onChange={(e) =>
                              handlePriceChange(
                                weight,
                                parseFloat(e.target.value) || 0
                              )
                            }
                            className="w-32"
                            classNames={{
                              input: "!text-black",
                              inputWrapper:
                                "border-2 border-black rounded-md shadow-none !bg-white data-[hover=true]:!bg-white data-[focus=true]:!bg-white data-[invalid=true]:!bg-white",
                            }}
                            endContent={
                              <div className="flex items-center">
                                <span className="text-small text-gray-600">
                                  {watchCurrency}
                                </span>
                              </div>
                            }
                          />
                        </div>
                      ))}
                      {weightArray.length > 0 && (
                        <div className="w-full text-xs text-black opacity-75">
                          Note: Weight prices will override the main product
                          price when selected.
                        </div>
                      )}
                    </div>
                  );
                }}
              />

              <Controller
                name="Category"
                control={control}
                rules={{
                  required: "A category is required.",
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
                    <div className="mb-4">
                      <label className="mb-2 block text-base font-semibold text-black">
                        Categories
                      </label>
                      <Select
                        classNames={{
                          trigger:
                            "border-2 border-black rounded-md shadow-none min-h-14 bg-white data-[hover=true]:bg-white data-[focus=true]:bg-white data-[invalid=true]:bg-white",
                          listbox:
                            "bg-white [&_li]:!bg-white [&_li:hover]:!bg-primary-yellow [&_li[data-hover=true]]:!bg-primary-yellow",
                          value: "!text-black",
                        }}
                        variant="flat"
                        isMultiline={true}
                        aria-label="Category"
                        placeholder="Select category..."
                        selectionMode="multiple"
                        isInvalid={isErrored}
                        errorMessage={errorMessage}
                        onChange={onChange}
                        onBlur={onBlur}
                        value={value}
                        defaultSelectedKeys={value ? value.split(",") : ""}
                        renderValue={(items) => {
                          return (
                            <div className="flex flex-wrap gap-2">
                              {items.map((item) => (
                                <Chip key={item.key}>
                                  {item.key
                                    ? (item.key as string)
                                    : "unknown category"}
                                </Chip>
                              ))}
                            </div>
                          );
                        }}
                      >
                        <SelectSection>
                          {CATEGORIES.map((category) => (
                            <SelectItem key={category} value={category}>
                              {category}
                            </SelectItem>
                          ))}
                        </SelectSection>
                      </Select>
                    </div>
                  );
                }}
              />

              {watchCategory &&
                watchCategory.toLowerCase().includes("herdshare") && (
                  <div className="mb-4 space-y-4">
                    <h3 className="text-base font-semibold text-black">
                      Herdshare Agreement
                    </h3>
                    <p className="text-sm text-gray-600">
                      Upload the herdshare agreement PDF that customers must
                      review before purchase. The agreement will be encrypted
                      using your seller key for security.
                    </p>

                    <EncryptedAgreementUploaderButton
                      sellerNpub={signerPubKey || ""}
                      fileCallbackOnUpload={(fileUrl) => {
                        setHerdshareAgreementUrl(fileUrl);
                      }}
                    >
                      {herdshareAgreementUrl
                        ? "Update Encrypted Agreement"
                        : "Upload Encrypted Agreement"}
                    </EncryptedAgreementUploaderButton>
                  </div>
                )}

              <Controller
                name="Restrictions"
                control={control}
                render={({
                  field: { onChange, onBlur, value },
                  fieldState: { error },
                }) => {
                  const isErrored = error !== undefined;
                  const errorMessage: string = error?.message
                    ? error.message
                    : "";
                  return (
                    <div className="mb-4">
                      <label className="mb-2 block text-base font-semibold text-black">
                        Restrictions (optional)
                      </label>
                      <Input
                        classNames={{
                          input: "text-base !text-black",
                          inputWrapper:
                            "border-2 border-black rounded-md shadow-none h-14 !bg-white data-[hover=true]:!bg-white data-[focus=true]:!bg-white data-[invalid=true]:!bg-white",
                        }}
                        variant="flat"
                        placeholder="US shipping only, signature required, no P.O. box delivery, etc."
                        fullWidth={true}
                        isInvalid={isErrored}
                        errorMessage={errorMessage}
                        onChange={onChange}
                        onBlur={onBlur}
                        value={value}
                      />
                    </div>
                  );
                }}
              />

              <Controller
                name="Bulk Pricing Enabled"
                control={control}
                render={({ field: { onChange, value } }) => (
                  <div className="mt-4 flex items-center justify-between rounded-md border-2 border-black bg-white p-3">
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold text-black">
                        Bulk/Bundle Pricing
                      </span>
                      <span className="text-tiny text-gray-500">
                        Offer discounted pricing for multiple units
                      </span>
                    </div>
                    <Switch
                      isSelected={!!value}
                      onValueChange={onChange}
                      classNames={{
                        wrapper: "group-data-[selected=true]:bg-yellow-600",
                      }}
                    />
                  </div>
                )}
              />

              <Controller
                name="Bulk Prices"
                control={control}
                render={({
                  field: { onChange, value = new Map<number, number>() },
                }) => {
                  const bulkEnabled = watch("Bulk Pricing Enabled");
                  if (!bulkEnabled) return <></>;

                  const handleAddTier = () => {
                    const newPrices = new Map(value);
                    newPrices.set(0, 0);
                    onChange(newPrices);
                  };

                  const handleRemoveTier = (units: number) => {
                    const newPrices = new Map(value);
                    newPrices.delete(units);
                    onChange(newPrices);
                  };

                  const handleUnitsChange = (
                    oldUnits: number,
                    newUnits: number
                  ) => {
                    const newPrices = new Map<number, number>();
                    value.forEach((price: number, units: number) => {
                      if (units === oldUnits) {
                        newPrices.set(newUnits, price);
                      } else {
                        newPrices.set(units, price);
                      }
                    });
                    onChange(newPrices);
                  };

                  const handlePriceChange = (units: number, price: number) => {
                    const newPrices = new Map(value);
                    newPrices.set(units, price);
                    onChange(newPrices);
                  };

                  const entries = Array.from(value.entries()).sort(
                    (a: [number, number], b: [number, number]) => a[0] - b[0]
                  );

                  return (
                    <div className="mt-2 space-y-3">
                      <p className="text-sm text-gray-600">
                        Set prices for different unit quantities. These prices
                        override the single-unit price.
                      </p>
                      {entries.map(
                        ([units, price]: [number, number], index: number) => (
                          <div key={index} className="flex items-center gap-2">
                            <Input
                              type="number"
                              min="1"
                              label="Units"
                              labelPlacement="inside"
                              value={units > 0 ? units.toString() : ""}
                              onChange={(e) =>
                                handleUnitsChange(
                                  units,
                                  parseInt(e.target.value) || 0
                                )
                              }
                              className="w-24"
                              variant="flat"
                              classNames={{
                                label: "!text-black font-semibold",
                                input: "text-base !text-black",
                                inputWrapper:
                                  "border-2 border-black rounded-md shadow-none !bg-white data-[hover=true]:!bg-white data-[focus=true]:!bg-white",
                              }}
                            />
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              label="Total Price"
                              labelPlacement="inside"
                              value={price > 0 ? price.toString() : ""}
                              onChange={(e) =>
                                handlePriceChange(
                                  units,
                                  parseFloat(e.target.value) || 0
                                )
                              }
                              className="flex-1"
                              variant="flat"
                              classNames={{
                                label: "!text-black font-semibold",
                                input: "text-base !text-black",
                                inputWrapper:
                                  "border-2 border-black rounded-md shadow-none !bg-white data-[hover=true]:!bg-white data-[focus=true]:!bg-white",
                              }}
                              endContent={
                                <span className="text-small text-default-400">
                                  {watchCurrency}
                                </span>
                              }
                            />
                            <Button
                              isIconOnly
                              color="danger"
                              variant="light"
                              onClick={() => handleRemoveTier(units)}
                            >
                              <TrashIcon className="h-4 w-4" />
                            </Button>
                          </div>
                        )
                      )}
                      <Button
                        variant="bordered"
                        className="w-full border-2 border-black bg-white font-bold text-black shadow-none hover:bg-gray-50"
                        onClick={handleAddTier}
                      >
                        Add Bulk Tier
                      </Button>
                      {entries.length > 0 && (
                        <div className="w-full text-xs text-black opacity-75">
                          Note: Bulk prices override the single-unit price when
                          a buyer selects a bundle option.
                        </div>
                      )}
                    </div>
                  );
                }}
              />

              <div className="mt-4 flex items-center justify-between rounded-md border-2 border-black bg-white p-3">
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-black">
                    Offer Subscribe & Save
                  </span>
                  <span className="text-tiny text-gray-500">
                    {hasStripeAccount === false
                      ? "Requires a Stripe account to accept recurring payments"
                      : "Let buyers subscribe for recurring delivery at a discount"}
                  </span>
                </div>
                <Switch
                  isSelected={subscriptionEnabled}
                  onValueChange={setSubscriptionEnabled}
                  isDisabled={hasStripeAccount === false}
                  classNames={{
                    wrapper: "group-data-[selected=true]:bg-yellow-600",
                  }}
                />
              </div>
              {hasStripeAccount === false && (
                <div className="mt-2 rounded-md border-2 border-yellow-300 bg-yellow-50 p-3">
                  <p className="text-sm text-yellow-800">
                    To offer subscriptions, you need to{" "}
                    <button
                      type="button"
                      className="font-semibold underline"
                      onClick={() => setShowStripeConnectModal(true)}
                    >
                      set up a Stripe account
                    </button>{" "}
                    first.
                  </p>
                </div>
              )}

              {/* --- Flash Sale Toggle --- */}
              <div className="mt-4 flex items-center justify-between rounded-lg border border-gray-200 p-3">
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-black">
                    Post as Flash Sale
                  </span>
                  <span className="text-tiny text-gray-500">
                    Also broadcast to Global Feed (Nostr)
                  </span>
                </div>
                <Switch
                  isSelected={isFlashSale}
                  onValueChange={setIsFlashSale}
                  classNames={{
                    wrapper: "group-data-[selected=true]:bg-yellow-600",
                  }}
                />
              </div>

              {subscriptionEnabled && (
                <div className="mt-2 space-y-4 rounded-md border-2 border-dashed border-gray-300 bg-gray-50 p-4">
                  <div>
                    <label className="mb-2 block text-base font-semibold text-black">
                      Subscription Discount (%)
                    </label>
                    <Input
                      classNames={{
                        input: "text-base !text-black",
                        inputWrapper:
                          "border-2 border-black rounded-md shadow-none h-14 !bg-white data-[hover=true]:!bg-white data-[focus=true]:!bg-white",
                      }}
                      variant="flat"
                      type="number"
                      min="1"
                      max="100"
                      placeholder="e.g. 10"
                      value={subscriptionDiscount}
                      onChange={(e) => setSubscriptionDiscount(e.target.value)}
                      endContent={
                        <span className="text-small text-gray-600">%</span>
                      }
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-base font-semibold text-black">
                      Delivery Frequency
                    </label>
                    <Select
                      classNames={{
                        trigger:
                          "border-2 border-black rounded-md shadow-none min-h-14 bg-white data-[hover=true]:bg-white data-[focus=true]:bg-white",
                        listbox:
                          "bg-white [&_li]:!bg-white [&_li:hover]:!bg-primary-yellow [&_li[data-hover=true]]:!bg-primary-yellow",
                        value: "!text-black",
                      }}
                      variant="flat"
                      isMultiline={true}
                      aria-label="Subscription Frequency"
                      placeholder="Select frequencies..."
                      selectionMode="multiple"
                      selectedKeys={new Set(subscriptionFrequencies)}
                      onSelectionChange={(keys) => {
                        setSubscriptionFrequencies(
                          Array.from(keys) as string[]
                        );
                      }}
                      renderValue={(items) => (
                        <div className="flex flex-wrap gap-2">
                          {items.map((item) => (
                            <Chip key={item.key}>{item.textValue}</Chip>
                          ))}
                        </div>
                      )}
                    >
                      <SelectSection>
                        <SelectItem key="weekly" value="weekly">
                          Weekly
                        </SelectItem>
                        <SelectItem key="every_2_weeks" value="every_2_weeks">
                          Every 2 Weeks
                        </SelectItem>
                        <SelectItem key="monthly" value="monthly">
                          Monthly
                        </SelectItem>
                        <SelectItem key="every_2_months" value="every_2_months">
                          Every 2 Months
                        </SelectItem>
                        <SelectItem key="quarterly" value="quarterly">
                          Quarterly
                        </SelectItem>
                      </SelectSection>
                    </Select>
                  </div>
                </div>
              )}

              <div className="w-full max-w-xs">
                <Button
                  className="w-full justify-start text-base font-semibold text-black underline"
                  variant="light"
                  onClick={() => setShowOptionalTags(!showOptionalTags)}
                >
                  Additional options {showOptionalTags ? "▲" : "▼"}
                </Button>
              </div>

              {showOptionalTags && (
                <>
                  <Controller
                    name="Sizes"
                    control={control}
                    render={({
                      field: { onChange, onBlur, value },
                      fieldState: { error },
                    }) => {
                      const isErrored = error !== undefined;
                      const errorMessage = error?.message || "";

                      const selectedSizes = Array.isArray(value)
                        ? value
                        : typeof value === "string"
                          ? value.split(",").filter(Boolean)
                          : [];

                      const handleSizeChange = (
                        newValue: string | string[]
                      ) => {
                        const newSizes = Array.isArray(newValue)
                          ? newValue
                          : newValue.split(",").filter(Boolean);
                        onChange(newSizes);
                      };

                      return (
                        <div className="mb-4">
                          <label className="mb-2 block text-base font-semibold text-black">
                            Sizes
                          </label>
                          <Select
                            classNames={{
                              trigger:
                                "border-2 border-black rounded-md shadow-none min-h-14 bg-white data-[hover=true]:bg-white data-[focus=true]:bg-white data-[invalid=true]:bg-white",
                              listbox:
                                "bg-white [&_li]:!bg-white [&_li:hover]:!bg-primary-yellow [&_li[data-hover=true]]:!bg-primary-yellow",
                              value: "!text-black",
                            }}
                            variant="flat"
                            isMultiline={true}
                            aria-label="Sizes"
                            selectionMode="multiple"
                            isInvalid={isErrored}
                            errorMessage={errorMessage}
                            onChange={(e) => handleSizeChange(e.target.value)}
                            onBlur={onBlur}
                            value={selectedSizes}
                            defaultSelectedKeys={new Set(selectedSizes)}
                          >
                            <SelectSection>
                              <SelectItem key="XS" value="XS">
                                XS
                              </SelectItem>
                              <SelectItem key="SM" value="SM">
                                SM
                              </SelectItem>
                              <SelectItem key="MD" value="MD">
                                MD
                              </SelectItem>
                              <SelectItem key="LG" value="LG">
                                LG
                              </SelectItem>
                              <SelectItem key="XL" value="XL">
                                XL
                              </SelectItem>
                              <SelectItem key="XXL" value="XXL">
                                XXL
                              </SelectItem>
                            </SelectSection>
                          </Select>
                        </div>
                      );
                    }}
                  />

                  <Controller
                    name="Size Quantities"
                    control={control}
                    render={({
                      field: { onChange, value = new Map<string, number>() },
                    }) => {
                      const handleQuantityChange = (
                        size: string,
                        quantity: number
                      ) => {
                        const newQuantities = new Map(value);
                        newQuantities.set(size, quantity);
                        onChange(newQuantities);
                      };

                      const sizes = watch("Sizes");
                      const sizeArray = Array.isArray(sizes)
                        ? sizes
                        : sizes?.split(",").filter(Boolean) || [];

                      return (
                        <div className="mb-4 flex flex-wrap gap-4">
                          {sizeArray.map((size: string) => (
                            <div key={size} className="flex items-center">
                              <span className="mr-2 text-black">{size}:</span>
                              <Input
                                type="number"
                                min="0"
                                value={(value.get(size) || 0).toString()}
                                onChange={(e) =>
                                  handleQuantityChange(
                                    size,
                                    parseInt(e.target.value) || 0
                                  )
                                }
                                className="w-20"
                                classNames={{
                                  input: "!text-black",
                                  inputWrapper:
                                    "border-2 border-black rounded-md shadow-none !bg-white data-[hover=true]:!bg-white data-[focus=true]:!bg-white data-[invalid=true]:!bg-white",
                                }}
                              />
                            </div>
                          ))}
                        </div>
                      );
                    }}
                  />

                  <Controller
                    name="Condition"
                    control={control}
                    render={({
                      field: { onChange, onBlur, value },
                      fieldState: { error },
                    }) => {
                      const isErrored = error !== undefined;
                      const errorMessage: string = error?.message
                        ? error.message
                        : "";
                      return (
                        <div className="mb-4">
                          <label className="mb-2 block text-base font-semibold text-black">
                            Condition
                          </label>
                          <Select
                            classNames={{
                              trigger:
                                "border-2 border-black rounded-md shadow-none h-14 bg-white data-[hover=true]:bg-white data-[focus=true]:bg-white data-[invalid=true]:bg-white",
                              listbox:
                                "bg-white [&_li]:!bg-white [&_li:hover]:!bg-primary-yellow [&_li[data-hover=true]]:!bg-primary-yellow",
                              value: "!text-black",
                            }}
                            variant="flat"
                            aria-label="Condition"
                            isInvalid={isErrored}
                            errorMessage={errorMessage}
                            disallowEmptySelection={true}
                            onChange={onChange}
                            onBlur={onBlur}
                            selectedKeys={[value as string]}
                          >
                            <SelectSection>
                              <SelectItem key="New" value="New">
                                New
                              </SelectItem>
                              <SelectItem key="Renewed" value="Renewed">
                                Renewed
                              </SelectItem>
                              <SelectItem
                                key="Used - Like New"
                                value="Used - Like New"
                              >
                                Used - Like New
                              </SelectItem>
                              <SelectItem
                                key="Used - Very Good"
                                value="Used - Very Good"
                              >
                                Used - Very Good
                              </SelectItem>
                              <SelectItem key="Used - Good" value="Used - Good">
                                Used - Good
                              </SelectItem>
                              <SelectItem
                                key="Used - Acceptable"
                                value="Used - Acceptable"
                              >
                                Used - Acceptable
                              </SelectItem>
                            </SelectSection>
                          </Select>
                        </div>
                      );
                    }}
                  />

                  <Controller
                    name="Status"
                    control={control}
                    render={({
                      field: { onChange, onBlur, value },
                      fieldState: { error },
                    }) => {
                      const isErrored = error !== undefined;
                      const errorMessage: string = error?.message
                        ? error.message
                        : "";
                      return (
                        <div className="mb-4">
                          <label className="mb-2 block text-base font-semibold text-black">
                            Status
                          </label>
                          <Select
                            classNames={{
                              trigger:
                                "border-2 border-black rounded-md shadow-none h-14 bg-white data-[hover=true]:bg-white data-[focus=true]:bg-white data-[invalid=true]:bg-white",
                              listbox:
                                "bg-white [&_li]:!bg-white [&_li:hover]:!bg-primary-yellow [&_li[data-hover=true]]:!bg-primary-yellow",
                              value: "!text-black",
                            }}
                            variant="flat"
                            aria-label="Status"
                            isInvalid={isErrored}
                            errorMessage={errorMessage}
                            disallowEmptySelection={true}
                            onChange={onChange}
                            onBlur={onBlur}
                            selectedKeys={[value as string]}
                          >
                            <SelectSection>
                              <SelectItem key="active" value="active">
                                Active
                              </SelectItem>
                              <SelectItem key="sold" value="sold">
                                Sold
                              </SelectItem>
                            </SelectSection>
                          </Select>
                        </div>
                      );
                    }}
                  />

                  <Controller
                    name="Required"
                    control={control}
                    render={({
                      field: { onChange, onBlur, value },
                      fieldState: { error },
                    }) => {
                      const isErrored = error !== undefined;
                      const errorMessage: string = error?.message
                        ? error.message
                        : "";
                      return (
                        <div className="mb-4">
                          <label className="mb-2 block text-base font-semibold text-black">
                            Required Customer Information
                          </label>
                          <Input
                            classNames={{
                              input: "text-base !text-black",
                              inputWrapper:
                                "border-2 border-black rounded-md shadow-none h-14 !bg-white data-[hover=true]:!bg-white data-[focus=true]:!bg-white data-[invalid=true]:!bg-white",
                            }}
                            variant="flat"
                            placeholder="Email, phone number, etc."
                            fullWidth={true}
                            isInvalid={isErrored}
                            errorMessage={errorMessage}
                            onChange={onChange}
                            onBlur={onBlur}
                            value={value}
                          />
                        </div>
                      );
                    }}
                  />
                </>
              )}

              {showOptionalTags && (
                <Controller
                  name="Expiration"
                  control={control}
                  render={({
                    field: { onChange, onBlur, value },
                    fieldState: { error },
                  }) => {
                    const isErrored = error !== undefined;
                    const errorMessage = error?.message || "";
                    return (
                      <div className="mt-4">
                        <Input
                          type="datetime-local"
                          min={new Date().toISOString().slice(0, 16)}
                          variant="bordered"
                          label="Valid Until (Optional)"
                          labelPlacement="inside"
                          placeholder="Select a date to mark listing as stale"
                          isInvalid={isErrored}
                          errorMessage={errorMessage}
                          onChange={onChange}
                          onBlur={onBlur}
                          value={value as string}
                          className="text-black"
                        />
                        <p className="mt-1 text-tiny text-gray-500">
                          Listing will remain visible but marked as
                          &quot;Outdated&quot; after this date. Leave empty if
                          product has no expiration. Buyers won&apos;t be able
                          to purchase after expiration.
                        </p>
                      </div>
                    );
                  }}
                />
              )}

              <div className="mx-0 my-4 flex items-start text-left">
                <InformationCircleIcon className="mr-2 mt-0.5 h-5 w-5 flex-shrink-0 text-black" />
                <p className="text-xs text-black">
                  Your payment preference is set to{" "}
                  {profileContext.profileData.get(pubkey)?.content
                    ?.payment_preference === "lightning"
                    ? "Lightning"
                    : profileContext.profileData.get(pubkey)?.content
                          ?.payment_preference === "fiat"
                      ? "Fiat"
                      : "Cashu"}
                  . You can modify this in your{" "}
                  <span
                    className="cursor-pointer underline hover:text-blue-600"
                    onClick={() => router.push("/settings/user-profile")}
                  >
                    profile settings
                  </span>
                  .
                </p>
              </div>
            </ModalBody>

            <ModalFooter className="border-t-2 border-black bg-white px-6 py-4">
              <ConfirmActionDropdown
                helpText={
                  "Are you sure you want to clear this form? You will lose all current progress."
                }
                buttonLabel={"Clear Form"}
                onConfirm={clear}
              >
                <Button color="danger" variant="light">
                  <span className="text-base font-semibold text-red-600">
                    Clear
                  </span>
                </Button>
              </ConfirmActionDropdown>

              <Button
                className="rounded-md border-2 border-black bg-gray-800 px-8 py-3 text-base font-bold text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                type="submit"
                onClick={(e) => {
                  if (signer && isLoggedIn) {
                    e.preventDefault();
                    handleSubmit(onSubmit as any)();
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSubmit(onSubmit as any)();
                  }
                }}
                isDisabled={isPostingOrUpdatingProduct}
                isLoading={isPostingOrUpdatingProduct}
              >
                {isEdit ? "Edit Product" : "Add Product"}
              </Button>
            </ModalFooter>
          </form>
        </ModalContent>
      </Modal>
      {pubkey && (
        <StripeConnectModal
          isOpen={showStripeConnectModal}
          onClose={() => setShowStripeConnectModal(false)}
          pubkey={pubkey}
          returnPath="/my-listings?stripe=success"
          refreshPath="/my-listings?stripe=refresh"
        />
      )}
    </>
  );
}
