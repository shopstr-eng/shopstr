import React, { useEffect, useState, useContext } from "react";
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
  PhotoIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  InformationCircleIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { Carousel } from "react-responsive-carousel";
import "react-responsive-carousel/lib/styles/carousel.min.css";
import {
  CATEGORIES,
  SHIPPING_OPTIONS,
  NEO_BTN,
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
import currencySelection from "../public/currencySelection.json";
import {
  NostrContext,
  SignerContext,
} from "@/components/utility-components/nostr-context-provider";
import { ProductFormValues } from "../utils/types/types";

interface ProductFormProps {
  handleModalToggle: () => void;
  showModal: boolean;
  oldValues?: ProductData;
  handleDelete?: (productId: string) => void;
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
  const [isFlashSale, setIsFlashSale] = useState(false);
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
          Condition: oldValues.condition ? oldValues.condition : "",
          Status: oldValues.status ? oldValues.status : "",
          Required: oldValues.required ? oldValues.required : "",
          Restrictions: oldValues.restrictions ? oldValues.restrictions : "",
          Expiration: oldValues.expiration
            ? new Date(oldValues.expiration * 1000).toISOString().slice(0, 16)
            : "",
        }
      : {
          Currency: "SAT",
          "Shipping Option": "N/A",
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
    if (showModal && !oldValues && signerPubKey) {
      const profile = profileContext.profileData.get(signerPubKey);
      const hasLightning = !!(
        profile?.content?.lud16 || profile?.content?.lnurl
      );
      setIsFlashSale(hasLightning);
    } else {
      setIsFlashSale(false);
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
        "Shopstr",
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
    tags.push(["t", "shopstr"]);

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
        data["Shipping Option"] === "Free/Pickup")
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
            ["t", "shopstr-zapsnag"],
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
        handleDelete(oldValues.id);
      }
    }

    clear();
    productEventContext.addNewlyCreatedProductEvent(newListing);
    setIsPostingOrUpdatingProduct(false);
    if (onSubmitCallback) {
      onSubmitCallback();
    }
  };

  const clear = () => {
    handleModalToggle();
    setImages([]);
    reset();
    setCurrentSlide(0);
  };

  const watchShippingOption = watch("Shipping Option");
  const watchCurrency = watch("Currency");

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
    <Modal
      backdrop="blur"
      isOpen={showModal}
      onClose={handleModalToggle}
      classNames={{
        base: "bg-[#18181b] border border-zinc-800 text-white",
        body: "py-6 px-6",
        backdrop: "bg-black/80 backdrop-blur-sm",
        header: "border-b border-zinc-800 py-4",
        footer: "border-t border-zinc-800 py-4",
        closeButton: "hover:bg-zinc-800 active:bg-zinc-700 text-zinc-400",
      }}
      scrollBehavior={"outside"}
      size="2xl"
    >
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1 text-xl font-bold text-white">
          Add New Product Listing
        </ModalHeader>
        <form
          onSubmit={(e) => {
            if (e.target !== e.currentTarget) {
              e.preventDefault();
            }
            return handleSubmit(onSubmit as any)(e);
          }}
        >
          <ModalBody>
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
                  <Input
                    classNames={{
                      inputWrapper:
                        "bg-[#27272a] border border-zinc-700 hover:border-zinc-600 data-[hover=true]:border-zinc-600 group-data-[focus=true]:border-yellow-400 group-data-[focus=true]:bg-[#27272a] rounded-xl h-14",
                      input:
                        "text-white font-medium placeholder:text-zinc-500 text-base",
                      label: "hidden",
                    }}
                    autoFocus
                    fullWidth={true}
                    placeholder="Product name"
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
            {/* Image Upload Section */}
            <div className="mt-2">
              {images.length > 0 ? (
                <div className="relative mb-4 overflow-hidden rounded-2xl border border-zinc-700 bg-black">
                  <Carousel
                    showArrows={images.length > 1}
                    showStatus={false}
                    showIndicators={images.length > 1}
                    showThumbs={false}
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
                          className={`absolute left-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/80`}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onClickHandler();
                          }}
                          title={label}
                        >
                          <ChevronLeftIcon className="h-6 w-6" />
                        </button>
                      )
                    }
                    renderArrowNext={(onClickHandler, hasNext, label) =>
                      hasNext && (
                        <button
                          type="button"
                          className={`absolute right-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/80`}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onClickHandler();
                          }}
                          title={label}
                        >
                          <ChevronRightIcon className="h-6 w-6" />
                        </button>
                      )
                    }
                  >
                    {images.map((image, index) => (
                      <div
                        key={index}
                        className="relative flex h-64 w-full items-center justify-center bg-black"
                        onClick={(e) => e.preventDefault()}
                      >
                        <div className="absolute right-4 top-4 z-20">
                          <ConfirmActionDropdown
                            helpText="Are you sure you want to delete this image?"
                            buttonLabel="Delete Image"
                            onConfirm={deleteImage(index)}
                          >
                            <Button
                              isIconOnly
                              className="bg-black/50 text-red-500 backdrop-blur-md hover:bg-black/80"
                              radius="lg"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <TrashIcon className="h-5 w-5" />
                            </Button>
                          </ConfirmActionDropdown>
                        </div>
                        <Image
                          alt="Product Image"
                          className="h-64 w-full object-contain"
                          src={image}
                          srcSet={buildSrcSet(image)}
                          onClick={(e) => e.preventDefault()}
                        />
                      </div>
                    ))}
                  </Carousel>
                </div>
              ) : (
                <div className="mb-4 flex h-48 w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-yellow-400/30 bg-[#18181b] p-6 text-zinc-400 transition-colors hover:border-yellow-400/60 hover:bg-[#27272a]/50">
                  <PhotoIcon className="mb-2 h-12 w-12 text-yellow-400" />
                  <p className="text-sm font-bold text-white">
                    Drag & Drop Images Here
                  </p>
                  <p className="text-xs text-zinc-500">
                    Or click below to select files
                  </p>
                </div>
              )}
            </div>
            {imageError && <div className="text-red-600">{imageError}</div>}
            <FileUploaderButton
              isProductUpload={true}
              className={`${NEO_BTN} h-12 w-full text-sm`}
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
                  <Textarea
                    classNames={{
                      inputWrapper:
                        "bg-[#27272a] border border-zinc-700 hover:border-zinc-600 data-[hover=true]:border-zinc-600 group-data-[focus=true]:border-yellow-400 group-data-[focus=true]:bg-[#27272a] rounded-xl",
                      input:
                        "text-white font-medium placeholder:text-zinc-500 text-base",
                      label: "hidden",
                    }}
                    minRows={4}
                    fullWidth={true}
                    placeholder="Description"
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
                  <Input
                    classNames={{
                      inputWrapper:
                        "bg-[#27272a] border border-zinc-700 hover:border-zinc-600 data-[hover=true]:border-zinc-600 group-data-[focus=true]:border-yellow-400 group-data-[focus=true]:bg-[#27272a] rounded-xl h-14",
                      input:
                        "text-white font-medium placeholder:text-zinc-500 text-base",
                      label: "hidden",
                    }}
                    type="number"
                    placeholder="Price"
                    isInvalid={isErrored}
                    errorMessage={errorMessage}
                    // controller props
                    onChange={onChange} // send value to hook form
                    onBlur={onBlur} // notify when input is touched/blur
                    value={value}
                    endContent={
                      <Controller
                        control={control}
                        name="Currency"
                        rules={{
                          required: "Please specify a currency.",
                        }}
                        render={({ field: { onChange, onBlur, value } }) => {
                          return (
                            <div className="flex items-center">
                              <select
                                className="bg-transparent text-base font-bold text-zinc-400 outline-none"
                                key={"currency"}
                                id="currency"
                                name="currency"
                                onChange={onChange} // send value to hook form
                                onBlur={onBlur} // notify when input is touched/blur
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
                );
              }}
            />

            <div className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-[#27272a]/50 p-3">
              <InformationCircleIcon className="h-5 w-5 flex-shrink-0 text-zinc-400" />
              <p className="text-xs text-zinc-400">
                Your donation rate on sales is set to{" "}
                <span className="font-bold text-white">
                  {profileContext.profileData.get(pubkey)?.content
                    ?.shopstr_donation || 2.1}
                  %
                </span>
                . You can modify this in your{" "}
                <span
                  className="cursor-pointer font-bold text-white underline decoration-zinc-600 hover:text-yellow-400"
                  onClick={() => router.push("/settings/user-profile")}
                >
                  profile settings
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
                  <LocationDropdown
                    classNames={{
                      trigger:
                        "bg-[#27272a] border border-zinc-700 hover:border-zinc-600 data-[hover=true]:border-zinc-600 group-data-[focus=true]:border-yellow-400 group-data-[focus=true]:bg-[#27272a] rounded-xl h-14",
                      value: "text-white font-medium text-base",
                      popoverContent: "bg-[#18181b] border border-zinc-800",
                      selectorIcon: "text-zinc-500",
                    }}
                    aria-label="Select Location"
                    placeholder="Location"
                    label="Location"
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
                  <Select
                    classNames={{
                      trigger:
                        "bg-[#27272a] border border-zinc-700 hover:border-zinc-600 data-[hover=true]:border-zinc-600 group-data-[focus=true]:border-yellow-400 group-data-[focus=true]:bg-[#27272a] rounded-xl h-14",
                      value: "text-white font-medium text-base",
                      popoverContent: "bg-[#18181b] border border-zinc-800",
                      selectorIcon: "text-zinc-500",
                    }}
                    aria-label="Shipping Option"
                    placeholder="Shipping option"
                    label="Shipping option"
                    labelPlacement="inside"
                    isInvalid={isErrored}
                    errorMessage={errorMessage}
                    disallowEmptySelection={true}
                    // controller props
                    onChange={onChange} // send value to hook form
                    onBlur={onBlur} // notify when input is touched/blur
                    selectedKeys={value ? [value as string] : []}
                  >
                    <SelectSection className="text-white">
                      {SHIPPING_OPTIONS.map((option) => (
                        <SelectItem key={option}>{option}</SelectItem>
                      ))}
                    </SelectSection>
                  </Select>
                );
              }}
            />

            {watchShippingOption === "Added Cost" && (
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
                    <Input
                      classNames={{
                        inputWrapper:
                          "bg-[#27272a] border border-zinc-700 hover:border-zinc-600 data-[hover=true]:border-zinc-600 group-data-[focus=true]:border-yellow-400 group-data-[focus=true]:bg-[#27272a] rounded-xl h-14",
                        input:
                          "text-white font-medium placeholder:text-zinc-500 text-base",
                      }}
                      type="number"
                      placeholder="Shipping Cost"
                      isInvalid={isErrored}
                      errorMessage={errorMessage}
                      // controller props
                      onChange={onChange} // send value to hook form
                      onBlur={onBlur} // notify when input is touched/blur
                      value={value?.toString()}
                      endContent={
                        <div className="flex items-center">
                          <select
                            className="bg-transparent text-sm font-bold text-zinc-400 outline-none"
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
                  );
                }}
              />
            )}

            {(watchShippingOption === "Pickup" ||
              watchShippingOption === "Free/Pickup") && (
              <div className="space-y-4">
                <h3 className="text-sm font-bold uppercase tracking-wider text-white">
                  Pickup Locations
                </h3>
                <p className="text-xs text-zinc-400">
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
                            classNames={{
                              inputWrapper:
                                "bg-[#27272a] border border-zinc-700 hover:border-zinc-600 data-[hover=true]:border-zinc-600 group-data-[focus=true]:border-yellow-400 group-data-[focus=true]:bg-[#27272a] rounded-xl h-14",
                              input:
                                "text-white font-medium placeholder:text-zinc-500 text-base",
                              label: "hidden",
                            }}
                            className="flex-1"
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
                        className="h-12 w-full rounded-xl border border-zinc-700 bg-zinc-800/50 text-sm font-bold uppercase tracking-wider text-zinc-300 hover:bg-zinc-800 hover:text-white"
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
                  <Select
                    classNames={{
                      trigger:
                        "bg-[#27272a] border border-zinc-700 hover:border-zinc-600 data-[hover=true]:border-zinc-600 group-data-[focus=true]:border-yellow-400 group-data-[focus=true]:bg-[#27272a] rounded-xl min-h-[56px] py-2",
                      value: "text-white font-medium text-base",
                      popoverContent: "bg-[#18181b] border border-zinc-800",
                      selectorIcon: "text-zinc-500",
                    }}
                    isMultiline={true}
                    aria-label="Category"
                    label="Categories"
                    labelPlacement="inside"
                    placeholder="Categories"
                    selectionMode="multiple"
                    isInvalid={isErrored}
                    errorMessage={errorMessage}
                    // controller props
                    onChange={onChange} // send value to hook form
                    onBlur={onBlur} // notify when input is touched/blur
                    selectedKeys={
                      value ? new Set(value.split(",").filter(Boolean)) : []
                    }
                    renderValue={(items) => {
                      return (
                        <div className="flex flex-wrap gap-2">
                          {items.map((item) => (
                            <Chip
                              key={item.key}
                              size="sm"
                              className="border border-zinc-600 bg-zinc-800 text-white"
                            >
                              {item.key
                                ? (item.key as string)
                                : "unknown category"}
                            </Chip>
                          ))}
                        </div>
                      );
                    }}
                  >
                    <SelectSection className="text-white">
                      {CATEGORIES.map((category) => (
                        <SelectItem key={category} value={category}>
                          {category}
                        </SelectItem>
                      ))}
                    </SelectSection>
                  </Select>
                );
              }}
            />

            {/* --- Flash Sale Toggle --- */}
            <div className="mt-4 flex items-center justify-between rounded-xl border border-zinc-800 bg-[#27272a]/30 p-4">
              <div className="flex flex-col">
                <span className="text-sm font-bold text-white">
                  Post as Flash Sale
                </span>
                <span className="text-xs text-zinc-500">
                  Also broadcast to Global Feed (Nostr)
                </span>
              </div>
              <Switch
                isSelected={isFlashSale}
                onValueChange={setIsFlashSale}
                classNames={{
                  wrapper: "group-data-[selected=true]:bg-yellow-400",
                }}
              />
            </div>

            {/* Additional Options Toggle */}
            <div className="mt-6">
              <button
                type="button"
                className="flex items-center gap-2 text-sm font-bold text-yellow-400 transition-colors hover:text-yellow-300"
                onClick={() => setShowOptionalTags(!showOptionalTags)}
              >
                Additional options
                <span className="text-xs">{showOptionalTags ? "▲" : "▼"}</span>
              </button>
            </div>

            {showOptionalTags && (
              <>
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
                      <div className="flex flex-col">
                        <Input
                          classNames={{
                            inputWrapper:
                              "bg-[#27272a] border border-zinc-700 hover:border-zinc-600 data-[hover=true]:border-zinc-600 group-data-[focus=true]:border-yellow-400 group-data-[focus=true]:bg-[#27272a] rounded-xl h-14 mt-4",
                            input:
                              "text-white font-medium placeholder:text-zinc-500 text-base",
                            label: "hidden",
                          }}
                          type="number"
                          min="1"
                          placeholder="Quantity"
                          value={value}
                          onChange={(e) =>
                            onChange(parseInt(e.target.value) || 1)
                          }
                          isInvalid={isErrored}
                          errorMessage={errorMessage}
                        />
                      </div>
                    );
                  }}
                />

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

                    const handleSizeChange = (newValue: string | string[]) => {
                      const newSizes = Array.isArray(newValue)
                        ? newValue
                        : newValue.split(",").filter(Boolean);
                      onChange(newSizes);
                    };

                    return (
                      <Select
                        classNames={{
                          trigger:
                            "bg-[#27272a] border border-zinc-700 hover:border-zinc-600 data-[hover=true]:border-zinc-600 group-data-[focus=true]:border-yellow-400 group-data-[focus=true]:bg-[#27272a] rounded-xl min-h-[56px] py-2 mt-4",
                          value: "text-white font-medium text-base",
                          popoverContent: "bg-[#18181b] border border-zinc-800",
                          selectorIcon: "text-zinc-500",
                        }}
                        isMultiline={true}
                        aria-label="Sizes"
                        label="Sizes"
                        labelPlacement="inside"
                        placeholder="Sizes"
                        selectionMode="multiple"
                        isInvalid={isErrored}
                        errorMessage={errorMessage}
                        onChange={(e) => handleSizeChange(e.target.value)}
                        onBlur={onBlur}
                        selectedKeys={new Set(selectedSizes)}
                      >
                        <SelectSection className="text-white">
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

                    const handleVolumeChange = (
                      newValue: string | string[]
                    ) => {
                      const newVolumes = Array.isArray(newValue)
                        ? newValue
                        : newValue.split(",").filter(Boolean);
                      onChange(newVolumes);
                    };

                    return (
                      <Select
                        classNames={{
                          trigger:
                            "bg-[#27272a] border border-zinc-700 hover:border-zinc-600 data-[hover=true]:border-zinc-600 group-data-[focus=true]:border-yellow-400 group-data-[focus=true]:bg-[#27272a] rounded-xl min-h-[56px] py-2 mt-4",
                          value: "text-white font-medium text-base",
                          popoverContent: "bg-[#18181b] border border-zinc-800",
                          selectorIcon: "text-zinc-500",
                        }}
                        isMultiline={true}
                        aria-label="Volumes"
                        label="Volumes"
                        labelPlacement="inside"
                        placeholder="Volumes"
                        selectionMode="multiple"
                        isInvalid={isErrored}
                        errorMessage={errorMessage}
                        onChange={(e) => handleVolumeChange(e.target.value)}
                        onBlur={onBlur}
                        selectedKeys={new Set(selectedVolumes)}
                      >
                        <SelectSection className="text-white">
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
                    );
                  }}
                />

                <Controller
                  name="Volume Prices"
                  control={control}
                  render={({
                    field: { onChange, value = new Map<string, number>() },
                  }) => {
                    const handlePriceChange = (
                      volume: string,
                      price: number
                    ) => {
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
                      <div className="mt-4 flex flex-wrap gap-4">
                        {volumeArray.map((volume: string) => (
                          <div key={volume} className="flex items-center">
                            <span className="mr-2 text-white">{volume}:</span>
                            <Input
                              classNames={{
                                inputWrapper:
                                  "bg-[#27272a] border border-zinc-700",
                                input: "text-white",
                              }}
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
                              endContent={
                                <div className="flex items-center">
                                  <span className="text-small text-zinc-500">
                                    {watchCurrency}
                                  </span>
                                </div>
                              }
                            />
                          </div>
                        ))}
                        {volumeArray.length > 0 && (
                          <div className="w-full text-xs text-zinc-500">
                            Note: Volume prices will override the main product
                            price when selected.
                          </div>
                        )}
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
                      <div className="mt-4 flex flex-wrap gap-4">
                        {sizeArray.map((size: string) => (
                          <div key={size} className="flex items-center">
                            <span className="mr-2 text-white">{size}:</span>
                            <Input
                              classNames={{
                                inputWrapper:
                                  "bg-[#27272a] border border-zinc-700",
                                input: "text-white",
                              }}
                              type="number"
                              min="0"
                              value={(value.get(size) || 0).toString()}
                              onChange={(e) =>
                                handleQuantityChange(
                                  size,
                                  parseInt(e.target.value) || 0
                                )
                              }
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
                      <Select
                        classNames={{
                          trigger:
                            "bg-[#27272a] border border-zinc-700 hover:border-zinc-600 data-[hover=true]:border-zinc-600 group-data-[focus=true]:border-yellow-400 group-data-[focus=true]:bg-[#27272a] rounded-xl min-h-[56px] py-2 mt-4",
                          value: "text-white font-medium text-base",
                          popoverContent: "bg-[#18181b] border border-zinc-800",
                          selectorIcon: "text-zinc-500",
                        }}
                        aria-label="Condition"
                        placeholder="Condition"
                        label="Condition"
                        labelPlacement="inside"
                        isInvalid={isErrored}
                        errorMessage={errorMessage}
                        disallowEmptySelection={true}
                        // controller props
                        onChange={onChange} // send value to hook form
                        onBlur={onBlur} // notify when input is touched/blur
                        selectedKeys={value ? [value as string] : []}
                      >
                        <SelectSection className="text-white">
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
                      <Select
                        classNames={{
                          trigger:
                            "bg-[#27272a] border border-zinc-700 hover:border-zinc-600 data-[hover=true]:border-zinc-600 group-data-[focus=true]:border-yellow-400 group-data-[focus=true]:bg-[#27272a] rounded-xl min-h-[56px] py-2 mt-4",
                          value: "text-white font-medium text-base",
                          popoverContent: "bg-[#18181b] border border-zinc-800",
                          selectorIcon: "text-zinc-500",
                        }}
                        aria-label="Status"
                        label="Status"
                        labelPlacement="inside"
                        placeholder="Status"
                        isInvalid={isErrored}
                        errorMessage={errorMessage}
                        disallowEmptySelection={true}
                        // controller props
                        onChange={onChange} // send value to hook form
                        onBlur={onBlur} // notify when input is touched/blur
                        selectedKeys={value ? [value as string] : []}
                      >
                        <SelectSection className="text-white">
                          <SelectItem key="active" value="active">
                            Active
                          </SelectItem>
                          <SelectItem key="sold" value="sold">
                            Sold
                          </SelectItem>
                        </SelectSection>
                      </Select>
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
                      <Input
                        classNames={{
                          inputWrapper:
                            "bg-[#27272a] border border-zinc-700 hover:border-zinc-600 data-[hover=true]:border-zinc-600 group-data-[focus=true]:border-yellow-400 group-data-[focus=true]:bg-[#27272a] rounded-xl h-14 mt-4",
                          input:
                            "text-white font-medium placeholder:text-zinc-500 text-base",
                          label: "hidden",
                        }}
                        placeholder="Email, phone number, etc."
                        fullWidth={true}
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
                      <Input
                        classNames={{
                          inputWrapper:
                            "bg-[#27272a] border border-zinc-700 hover:border-zinc-600 data-[hover=true]:border-zinc-600 group-data-[focus=true]:border-yellow-400 group-data-[focus=true]:bg-[#27272a] rounded-xl h-14 mt-4",
                          input:
                            "text-white font-medium placeholder:text-zinc-500 text-base",
                          label: "hidden",
                        }}
                        placeholder="US shipping only, signature required, no P.O. box delivery, etc."
                        fullWidth={true}
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
                          classNames={{
                            inputWrapper:
                              "bg-[#27272a] border border-zinc-700 hover:border-zinc-600 data-[hover=true]:border-zinc-600 group-data-[focus=true]:border-yellow-400 group-data-[focus=true]:bg-[#27272a] rounded-xl h-14",
                            input:
                              "text-white font-medium placeholder:text-zinc-500 text-base",
                            label: "hidden",
                          }}
                          type="datetime-local"
                          min={new Date().toISOString().slice(0, 16)}
                          placeholder="Select a date to mark listing as stale"
                          isInvalid={isErrored}
                          errorMessage={errorMessage}
                          onChange={onChange}
                          onBlur={onBlur}
                          value={value as string}
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
              </>
            )}

            <div className="mt-4 flex items-center gap-3 rounded-xl border border-zinc-800 bg-[#27272a]/50 p-3">
              <InformationCircleIcon className="h-5 w-5 flex-shrink-0 text-zinc-400" />
              <p className="text-xs text-zinc-400">
                Your payment preference is set to{" "}
                <span className="font-bold text-white">
                  {profileContext.profileData.get(pubkey)?.content
                    ?.payment_preference === "lightning"
                    ? "Lightning"
                    : profileContext.profileData.get(pubkey)?.content
                          ?.payment_preference === "fiat"
                      ? "Fiat"
                      : "Cashu"}
                </span>
                . You can modify this in your{" "}
                <span
                  className="cursor-pointer font-bold text-white underline decoration-zinc-600 hover:text-yellow-400"
                  onClick={() => router.push("/settings/user-profile")}
                >
                  profile settings
                </span>
                .
              </p>
            </div>
          </ModalBody>

          <ModalFooter>
            <ConfirmActionDropdown
              helpText={
                "Are you sure you want to clear this form? You will lose all current progress."
              }
              buttonLabel={"Clear Form"}
              onConfirm={clear}
            >
              <Button
                className="text-red-500 hover:bg-zinc-800"
                variant="light"
              >
                Clear
              </Button>
            </ConfirmActionDropdown>

            <Button
              className={`${NEO_BTN} px-8 text-sm`}
              type="submit"
              onClick={(e) => {
                if (signer && isLoggedIn) {
                  e.preventDefault();
                  handleSubmit(onSubmit as any)();
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault(); // Prevent default to avoid submitting the form again
                  handleSubmit(onSubmit as any)(); // Programmatic submit
                }
              }}
              isDisabled={isPostingOrUpdatingProduct}
              isLoading={isPostingOrUpdatingProduct}
            >
              {isEdit ? "Edit Product" : "List Product"}
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
}
