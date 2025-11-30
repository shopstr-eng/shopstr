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
  SHOPSTRBUTTONCLASSNAMES,
  CATEGORIES,
  SHIPPING_OPTIONS,
} from "@/utils/STATIC-VARIABLES";
import {
  PostListing,
  getLocalStorageData,
} from "@/utils/nostr/nostr-helper-functions";
import LocationDropdown from "./utility-components/dropdowns/location-dropdown";
import ConfirmActionDropdown from "./utility-components/dropdowns/confirm-action-dropdown";
import { ProductContext, ProfileMapContext } from "../utils/context/context";
import { addProductToCache } from "@/utils/nostr/cache-service";
import { ProductData } from "@/utils/parsers/product-parser-functions";
import { buildSrcSet } from "@/utils/images";
import { FileUploaderButton } from "./utility-components/file-uploader";
import currencySelection from "../public/currencySelection.json";
import {
  NostrContext,
  SignerContext,
} from "@/components/utility-components/nostr-context-provider";
import { ProductFormValues } from "../utils/types/types";
import { useTheme } from "next-themes";

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
  const { theme } = useTheme();
  const [images, setImages] = useState<string[]>([]);
  const [imageError, setImageError] = useState<string | null>(null);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [pubkey, setPubkey] = useState("");
  const [relayHint, setRelayHint] = useState("");
  const [isEdit, setIsEdit] = useState(false);
  const [isPostingOrUpdatingProduct, setIsPostingOrUpdatingProduct] =
    useState(false);
  const [showOptionalTags, setShowOptionalTags] = useState(false);
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
  }, [showModal]);

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

    if (isEdit) {
      if (handleDelete && oldValues?.id) {
        handleDelete(oldValues.id);
      }
    }

    clear();
    productEventContext.addNewlyCreatedProductEvent(newListing);
    addProductToCache(newListing);
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
                    className="text-light-text dark:text-dark-text"
                    autoFocus
                    variant="bordered"
                    fullWidth={true}
                    label="Product name"
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
                    <ChevronLeftIcon className="h-6 w-6 text-black dark:text-white" />
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
                    <ChevronRightIcon className="h-6 w-6 text-black dark:text-white" />
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
                        {" "}
                        {/* Increased spacing */}
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
                        onClick={(e) => e.preventDefault()} // Prevent form submission
                      />
                    </div>
                  ))
                : [
                    <div
                      key="placeholder"
                      className="flex h-full w-full items-center justify-center p-4"
                      onClick={(e) => e.preventDefault()}
                    >
                      <FileUploaderButton
                        isPlaceholder={true}
                        isProductUpload={true}
                        imgCallbackOnUpload={(imgUrl) => {
                          if (imgUrl && imgUrl.length > 0) {
                            setImageError(null);
                            setImages((prevValues) => [...prevValues, imgUrl]);
                          }
                        }}
                      >
                        Upload Images
                      </FileUploaderButton>
                    </div>,
                  ]}
            </Carousel>
            {imageError && <div className="text-red-600">{imageError}</div>}
            <FileUploaderButton
              isProductUpload={true}
              className={SHOPSTRBUTTONCLASSNAMES}
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
                    className="text-light-text dark:text-dark-text"
                    variant="bordered"
                    fullWidth={true}
                    label="Description"
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
                    className="text-light-text dark:text-dark-text"
                    type="number"
                    autoFocus
                    variant="flat"
                    label="Price"
                    labelPlacement="inside"
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
                                className="border-0 bg-transparent text-small text-default-400 outline-none"
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

            <div className="mx-4 my-2 flex items-center justify-center text-center">
              <InformationCircleIcon className="h-6 w-6 text-light-text dark:text-dark-text" />
              <p className="ml-2 text-xs text-light-text dark:text-dark-text">
                Your donation rate on sales is set to{" "}
                {profileContext.profileData.get(pubkey)?.content
                  ?.shopstr_donation || 2.1}
                %. You can modify this in your{" "}
                <span
                  className="cursor-pointer underline hover:text-purple-500 dark:hover:text-yellow-500"
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
                    autoFocus
                    variant="bordered"
                    aria-label="Select Location"
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
                    className="text-light-text dark:text-dark-text"
                    autoFocus
                    variant="bordered"
                    aria-label="Shipping Option"
                    label="Shipping option"
                    labelPlacement="inside"
                    isInvalid={isErrored}
                    errorMessage={errorMessage}
                    disallowEmptySelection={true}
                    // controller props
                    onChange={onChange} // send value to hook form
                    onBlur={onBlur} // notify when input is touched/blur
                    selectedKeys={[value as string]}
                  >
                    <SelectSection className="text-light-text dark:text-dark-text">
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
                      type="number"
                      autoFocus
                      variant="flat"
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
                            className="border-0 bg-transparent text-small text-default-400 outline-none"
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
                <h3 className="text-lg font-semibold text-light-text dark:text-dark-text">
                  Pickup Locations
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
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
                            className="flex-1 text-light-text dark:text-dark-text"
                            variant="bordered"
                            placeholder={`Pickup location ${
                              index + 1
                            } (e.g., 123 Main St, City, State)`}
                            value={location}
                            onChange={(e) => {
                              const newLocations = [...value];
                              newLocations[index] = e.target.value;
                              onChange(newLocations);
                            }}
                            label={`Pickup Location ${index + 1}`}
                            labelPlacement="inside"
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

                      {theme === "dark" ? (
                        <Button
                          variant="bordered"
                          color="warning"
                          className="w-full"
                          onClick={() => {
                            const newLocations = [...value, ""];
                            onChange(newLocations);
                          }}
                        >
                          Add Another Pickup Location
                        </Button>
                      ) : (
                        <Button
                          variant="bordered"
                          color="secondary"
                          className="w-full"
                          onClick={() => {
                            const newLocations = [...value, ""];
                            onChange(newLocations);
                          }}
                        >
                          Add Another Pickup Location
                        </Button>
                      )}
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
                    variant="bordered"
                    isMultiline={true}
                    autoFocus
                    aria-label="Category"
                    label="Categories"
                    labelPlacement="inside"
                    selectionMode="multiple"
                    isInvalid={isErrored}
                    errorMessage={errorMessage}
                    // controller props
                    onChange={onChange} // send value to hook form
                    onBlur={onBlur} // notify when input is touched/blur
                    value={value}
                    defaultSelectedKeys={value ? value.split(",") : ""}
                    classNames={{
                      base: "mt-4",
                      trigger: "min-h-unit-12 py-2",
                    }}
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
                    <SelectSection className="text-light-text dark:text-dark-text">
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
            <div className="w-full max-w-xs">
              <Button
                className="mb-2 mt-4 w-full justify-start rounded-md pl-2 text-shopstr-purple-light dark:text-shopstr-yellow-light"
                variant="light"
                onClick={() => setShowOptionalTags(!showOptionalTags)}
              >
                <div className="flex items-center py-2">
                  <span>Additional options</span>
                  <span className="ml-2">{showOptionalTags ? "↑" : "↓"}</span>
                </div>
              </Button>
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
                          variant="flat"
                          autoFocus
                          type="number"
                          min="1"
                          aria-label="Quantity"
                          label="Quantity"
                          labelPlacement="inside"
                          value={value}
                          onChange={(e) =>
                            onChange(parseInt(e.target.value) || 1)
                          }
                          className="w-20"
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
                        variant="bordered"
                        isMultiline={true}
                        autoFocus
                        aria-label="Sizes"
                        label="Sizes"
                        labelPlacement="inside"
                        selectionMode="multiple"
                        isInvalid={isErrored}
                        errorMessage={errorMessage}
                        onChange={(e) => handleSizeChange(e.target.value)}
                        onBlur={onBlur}
                        value={selectedSizes}
                        defaultSelectedKeys={new Set(selectedSizes)}
                        classNames={{
                          base: "mt-4",
                          trigger: "min-h-unit-12 py-2",
                        }}
                      >
                        <SelectSection className="text-light-text dark:text-dark-text">
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
                        variant="bordered"
                        isMultiline={true}
                        autoFocus
                        aria-label="Volumes"
                        label="Volumes"
                        labelPlacement="inside"
                        selectionMode="multiple"
                        isInvalid={isErrored}
                        errorMessage={errorMessage}
                        onChange={(e) => handleVolumeChange(e.target.value)}
                        onBlur={onBlur}
                        value={selectedVolumes}
                        defaultSelectedKeys={new Set(selectedVolumes)}
                        classNames={{
                          base: "mt-4",
                          trigger: "min-h-unit-12 py-2",
                        }}
                      >
                        <SelectSection className="text-light-text dark:text-dark-text">
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
                            <span className="mr-2 text-light-text dark:text-dark-text">
                              {volume}:
                            </span>
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
                              endContent={
                                <div className="flex items-center">
                                  <span className="text-small text-default-400">
                                    {watchCurrency}
                                  </span>
                                </div>
                              }
                            />
                          </div>
                        ))}
                        {volumeArray.length > 0 && (
                          <div className="w-full text-xs text-light-text opacity-75 dark:text-dark-text">
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
                            <span className="mr-2 text-light-text dark:text-dark-text">
                              {size}:
                            </span>
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
                        className="text-light-text dark:text-dark-text"
                        autoFocus
                        variant="bordered"
                        aria-label="Condition"
                        label="Condition"
                        labelPlacement="inside"
                        isInvalid={isErrored}
                        errorMessage={errorMessage}
                        disallowEmptySelection={true}
                        // controller props
                        onChange={onChange} // send value to hook form
                        onBlur={onBlur} // notify when input is touched/blur
                        selectedKeys={[value as string]}
                      >
                        <SelectSection className="text-light-text dark:text-dark-text">
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
                        className="text-light-text dark:text-dark-text"
                        autoFocus
                        variant="bordered"
                        aria-label="Status"
                        label="Status"
                        labelPlacement="inside"
                        isInvalid={isErrored}
                        errorMessage={errorMessage}
                        disallowEmptySelection={true}
                        // controller props
                        onChange={onChange} // send value to hook form
                        onBlur={onBlur} // notify when input is touched/blur
                        selectedKeys={[value as string]}
                      >
                        <SelectSection className="text-light-text dark:text-dark-text">
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
                        className="text-light-text dark:text-dark-text"
                        autoFocus
                        variant="bordered"
                        placeholder="Email, phone number, etc."
                        fullWidth={true}
                        label="Required Customer Information"
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
                        className="text-light-text dark:text-dark-text"
                        autoFocus
                        variant="bordered"
                        placeholder="US shipping only, signature required, no P.O. box delivery, etc."
                        fullWidth={true}
                        label="Restrictions"
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
                        className="text-light-text dark:text-dark-text"
                      />
                      <p className="mt-1 text-tiny text-gray-500">
                        Listing will remain visible but marked as
                        &quot;Outdated&quot; after this date. Leave empty if
                        product has no expiration. Buyers won&apos;t be able to
                        purchase after expiration.
                      </p>
                    </div>
                  );
                }}
              />
            )}

            <div className="mx-4 my-2 flex items-center justify-center text-center">
              <InformationCircleIcon className="h-6 w-6 text-light-text dark:text-dark-text" />
              <p className="ml-2 text-xs text-light-text dark:text-dark-text">
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
                  className="cursor-pointer underline hover:text-purple-500 dark:hover:text-yellow-500"
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
              <Button color="danger" variant="light">
                Clear
              </Button>
            </ConfirmActionDropdown>

            <Button
              className={SHOPSTRBUTTONCLASSNAMES}
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
