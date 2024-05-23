3; // TODO componentarize file uploader
import React, { useMemo, useRef, useEffect, useState, useContext } from "react";
import Link from "next/link";
import { useForm, Controller, set } from "react-hook-form";
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
  getPrivKeyWithPassphrase,
  nostrBuildUploadImages,
  getLocalStorageData,
} from "./utility/nostr-helper-functions";
import { finalizeEvent } from "nostr-tools";
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
  const [signIn, setSignIn] = useState("");
  const [pubkey, setPubkey] = useState("");
  const [isEdit, setIsEdit] = useState(false);
  const [isPostingOrUpdatingProduct, setIsPostingOrUpdatingProduct] =
    useState(false);
  const productEventContext = useContext(ProductContext);
  const {
    handleSubmit,
    formState: { errors },
    control,
    reset,
    watch,
  } = useForm({
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
        }
      : {
          Currency: "SATS",
          "Shipping Option": "N/A",
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

  const onSubmit = async (data: { [x: string]: string }) => {
    setIsPostingOrUpdatingProduct(true);
    const encoder = new TextEncoder();
    const dataEncoded = encoder.encode(data["Product Name"]);
    const hashBuffer = await crypto.subtle.digest("SHA-256", dataEncoded);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    let tags: ProductFormValues = [
      ["d", oldValues?.d || hashHex],
      ["alt", "Classified listing: " + data["Product Name"]],
      [
        "client",
        "Shopstr",
        "31990:" + pubkey + ":" + (oldValues?.d || hashHex),
        "wss://relay.damus.io",
      ],
      ["title", data["Product Name"]],
      ["summary", data["Description"]],
      ["price", data["Price"], data["Currency"]],
      ["location", data["Location"]],
      [
        "shipping",
        data["Shipping Option"],
        data["Shipping Cost"] ? data["Shipping Cost"] : "0",
        data["Currency"],
      ],
    ];

    images.forEach((image) => {
      tags.push(["image", image]);
    });

    data["Category"].split(",").forEach((category) => {
      tags.push(["t", category]);
    });
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
              rules={{
                required: "A Product Name is required.",
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
                let errorMessage: string = error?.message ? error.message : "";
                return (
                  <Input
                    className="text-light-text dark:text-dark-text"
                    autoFocus
                    variant="bordered"
                    fullWidth={true}
                    label="Product Name"
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
                      {
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
                      }
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
            <FileUploaderButton
              isIconOnly={false}
              className={buttonClassName}
              passphrase={passphrase}
              imgCallbackOnUpload={(imgUrl) => {
                setImages((prevValues) => {
                  const updatedImages = [...prevValues];
                  console.log("imgUrl", imgUrl);
                  if (imgUrl && imgUrl.length > 0) {
                    return [...updatedImages, imgUrl];
                  }
                  return [...updatedImages];
                });
              }}
            >
              {isButtonDisabled ? "Enter your passphrase!" : "Upload Images"}
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
                let isErrored = error !== undefined;
                let errorMessage: string = error?.message ? error.message : "";
                return (
                  <Input
                    className="text-light-text dark:text-dark-text"
                    type="number"
                    autoFocus
                    variant="flat"
                    // label="Price"
                    // labelPlacement="outside"
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
                        render={({
                          field: { onChange, onBlur, value },
                          fieldState: { error },
                        }) => {
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
                    placeholder="Location"
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
                    label="Shipping Option"
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
                    labelPlacement="outside"
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
            {signIn === "nsec" && (
              <Input
                autoFocus
                className="text-light-text dark:text-dark-text"
                ref={passphraseInputRef}
                variant="flat"
                label="Passphrase"
                labelPlacement="inside"
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
