import React, { useMemo, useRef, useEffect, useState, useContext } from "react";
import Link from "next/link";
import CryptoJS from "crypto-js";
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
import { InformationCircleIcon, TrashIcon } from "@heroicons/react/24/outline";
import Carousal from "@itseasy21/react-elastic-carousel";
import { SHOPSTRBUTTONCLASSNAMES } from "./utility/STATIC-VARIABLES";

import {
  PostListing,
  getNsecWithPassphrase,
  getLocalStorageData,
} from "./utility/nostr-helper-functions";
import { CATEGORIES, SHIPPING_OPTIONS } from "./utility/STATIC-VARIABLES";
import LocationDropdown from "./utility-components/dropdowns/location-dropdown";
import ConfirmActionDropdown from "./utility-components/dropdowns/confirm-action-dropdown";
import { ProductContext } from "../utils/context/context";
import { capturePostListingMetric } from "./utility/metrics-helper-functions";
import { addProductToCache } from "../pages/api/nostr/cache-service";
import { ProductData } from "./utility/product-parser-functions";
import { ProductFormValues } from "@/pages/api/nostr/post-event";
import { buildSrcSet } from "@/utils/images";
import { FileUploaderButton } from "./utility-components/file-uploader";

import currencySelection from "../public/currencySelection.json";

declare global {
  interface Window {
    nostr: any;
  }
}

interface ProductFormProps {
  handleModalToggle: () => void;
  showModal: boolean;
  oldValues?: ProductData;
  handleDelete?: (productId: string, passphrase: string) => void;
  onSubmitCallback?: () => void;
}

export default function NewForm({
  showModal,
  handleModalToggle,
  oldValues,
  handleDelete,
  onSubmitCallback,
}: ProductFormProps) {
  const [passphrase, setPassphrase] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [imageError, setImageError] = useState<string | null>(null);
  const [signIn, setSignIn] = useState("");
  const [pubkey, setPubkey] = useState("");
  const [isEdit, setIsEdit] = useState(false);
  const [isPostingOrUpdatingProduct, setIsPostingOrUpdatingProduct] =
    useState(false);
  const [showOptionalTags, setShowOptionalTags] = useState(false);
  const productEventContext = useContext(ProductContext);
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
          Category: oldValues.categories ? oldValues.categories.join(",") : "",
          Sizes: oldValues.sizes ? oldValues.sizes.join(",") : "",
          "Size Quantities": oldValues.sizeQuantities
            ? oldValues.sizeQuantities
            : new Map<string, number>(),
          Condition: oldValues.condition ? oldValues.condition : "",
          Status: oldValues.status ? oldValues.status : "",
        }
      : {
          Currency: "SATS",
          "Shipping Option": "N/A",
          Status: "active",
        },
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      let { signInMethod, userPubkey } = getLocalStorageData();
      setSignIn(signInMethod as string);
      setPubkey(userPubkey as string);
    }
  }, []);

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
      CryptoJS.enc.Hex,
    );

    let tags: ProductFormValues = [
      ["d", oldValues?.d || hashHex],
      ["alt", ("Classified listing: " + data["Product Name"]) as string],
      [
        "client",
        "Shopstr",
        "31990:" + pubkey + ":" + (oldValues?.d || hashHex),
        "wss://relay.damus.io",
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

    if (data["Sizes"]) {
      (data["Sizes"] as string[]).forEach((size) => {
        const quantity =
          (data["Size Quantities"] as Map<string, number>).get(size) || 0;
        tags.push(["size", size, quantity.toString()]);
      });
    }

    if (data["Condition"]) {
      tags.push(["condition", data["Condition"] as string]);
    }

    if (data["Status"]) {
      tags.push(["status", data["Status"] as string]);
    }

    let newListing = await PostListing(tags, passphrase);

    capturePostListingMetric(newListing.id, tags);

    if (isEdit) {
      if (handleDelete && oldValues?.id) {
        handleDelete(oldValues.id, passphrase);
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
    setPassphrase("");
    setImages([]);
    reset();
  };

  const watchShippingOption = watch("Shipping Option"); // acts as state for shippingOption input. when shippingOption changes, this variable changes as well
  const watchCurrency = watch("Currency"); // acts as state for currency input. when currency changes, this variable changes as well

  const isButtonDisabled = useMemo(() => {
    if (signIn === "extension" || signIn === "amber") return false; // extension can upload without passphrase
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
    const enabledStyle = SHOPSTRBUTTONCLASSNAMES;
    const className = isButtonDisabled ? disabledStyle : enabledStyle;
    return className;
  }, [isButtonDisabled]);

  const passphraseInputRef = useRef<HTMLInputElement>(null);

  const deleteImage = (index: number) => () => {
    setImages((prevValues) => {
      const updatedImages = [...prevValues];
      if (index > -1) {
        updatedImages.splice(index, 1);
      }
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
        <form onSubmit={handleSubmit(onSubmit as any)}>
          <ModalBody>
            <Controller
              name="Product Name"
              control={control}
              render={({
                field: { onChange, onBlur, value },
                fieldState: { error },
              }) => {
                let isErrored = error !== undefined;
                let errorMessage: string = error?.message ? error.message : "";
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
            <Carousal
              isRTL={false}
              showArrows={images.length > 1}
              pagination={false}
            >
              {images.length > 0 ? (
                images.map((image, index) => (
                  <div key={index}>
                    <div className="flex flex-row-reverse ">
                      <ConfirmActionDropdown
                        helpText="Are you sure you want to delete this image?"
                        buttonLabel="Delete Image"
                        onConfirm={deleteImage(index)}
                      >
                        <Button
                          isIconOnly
                          color="danger"
                          aria-label="Trash"
                          radius="full"
                          className="right-3 top-12 z-20 bg-gradient-to-tr from-blue-950 to-red-950 text-white"
                          variant="bordered"
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
                    />
                  </div>
                ))
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <Image
                    alt="Product Image"
                    className="object-cover"
                    src="/no-image-placeholder.png"
                    width={350}
                  />
                </div>
              )}
            </Carousal>
            {imageError && <div className="text-red-600">{imageError}</div>}
            <FileUploaderButton
              isIconOnly={false}
              className={buttonClassName}
              passphrase={passphrase}
              imgCallbackOnUpload={(imgUrl) => {
                setImages((prevValues) => {
                  const updatedImages = [...prevValues];
                  if (imgUrl && imgUrl.length > 0) {
                    setImageError(null);
                    return [...updatedImages, imgUrl];
                  }
                  return [...updatedImages];
                });
              }}
            >
              {isButtonDisabled
                ? "Enter your passphrase below!"
                : "Upload Images"}
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
                let isErrored = error !== undefined;
                let errorMessage: string = error?.message ? error.message : "";
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
                let isErrored = error !== undefined;
                let errorMessage: string = error?.message ? error.message : "";
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
                let isErrored = error !== undefined;
                let errorMessage: string = error?.message ? error.message : "";
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
                let isErrored = error !== undefined;
                let errorMessage: string = error?.message ? error.message : "";
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
                  let isErrored = error !== undefined;
                  let errorMessage: string = error?.message
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
                let isErrored = error !== undefined;
                let errorMessage: string = error?.message ? error.message : "";
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
                  name="Sizes"
                  control={control}
                  render={({
                    field: { onChange, onBlur, value },
                    fieldState: { error },
                  }) => {
                    let isErrored = error !== undefined;
                    let errorMessage = error?.message || "";

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
                  name="Size Quantities"
                  control={control}
                  render={({
                    field: { onChange, value = new Map<string, number>() },
                  }) => {
                    const handleQuantityChange = (
                      size: string,
                      quantity: number,
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
                                  parseInt(e.target.value) || 0,
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
                    let isErrored = error !== undefined;
                    let errorMessage: string = error?.message
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
                    let isErrored = error !== undefined;
                    let errorMessage: string = error?.message
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
              </>
            )}

            {signIn === "nsec" && (
              <Input
                autoFocus
                className="text-light-text dark:text-dark-text"
                ref={passphraseInputRef}
                variant="flat"
                label="Passphrase"
                labelPlacement="inside"
                type="password"
                onChange={(e) => setPassphrase(e.target.value)}
                value={passphrase}
              />
            )}
            <div className="mx-4 my-2 flex items-center justify-center text-center">
              <InformationCircleIcon className="h-6 w-6 text-light-text dark:text-dark-text" />
              <p className="ml-2 text-xs text-light-text dark:text-dark-text">
                Once sold, you will receive a message containing a{" "}
                <Link href="https://cashu.space" passHref legacyBehavior>
                  <a
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    Cashu
                  </a>
                </Link>{" "}
                token that you can redeem for Bitcoin.
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
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isButtonDisabled) {
                  e.preventDefault(); // Prevent default to avoid submitting the form again
                  handleSubmit(onSubmit as any)(); // Programmatic submit
                }
              }}
              isDisabled={isPostingOrUpdatingProduct || isButtonDisabled}
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
