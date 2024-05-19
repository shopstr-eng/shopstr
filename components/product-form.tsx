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
  Switch,
  Divider,
} from "@nextui-org/react";
import { InformationCircleIcon, TrashIcon } from "@heroicons/react/24/outline";
import Carousal from "@itseasy21/react-elastic-carousel";
import {
  CURRENCY_OPTIONS,
  CurrencyType,
  SHOPSTRBUTTONCLASSNAMES,
  ShippingOptionsType,
} from "./utility/STATIC-VARIABLES";

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
import parseTags, { ProductData } from "./utility/product-parser-functions";
import { ProductFormValues } from "@/pages/api/nostr/post-event";
import { buildSrcSet } from "@/utils/images";
import { FileUploaderButton } from "./utility-components/file-uploader";
import {
  buildListingGeotags,
  getNameToCodeMap,
} from "@/utils/location/location";
import CategoryDropdown from "./utility-components/dropdowns/category-dropdown";
import { getKeywords } from "@/utils/text";

declare global {
  interface Window {
    nostr: any;
  }
}

interface ProductFormProps {
  handleModalToggle: () => void;
  showModal: boolean;
  // edit props
  oldValues?: ProductData;
  handleDelete?: (productId: string, passphrase: string) => void;
  onSubmitCallback?: () => void;
}

type ProductFormData = {
  "Product Name": string;
  Description: string;
  Price: string;
  Currency: CurrencyType;
  Location: string;
  "Shipping Option": ShippingOptionsType;
  "Shipping Cost": number;
  Categories: Set<string>;
  "Content Warning": boolean;
};

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
  } = useForm<ProductFormData>({
    defaultValues: {
      "Product Name": oldValues?.title || "",
      Description: oldValues?.summary || "",
      Price: String(oldValues?.price || 0),
      Currency: oldValues?.currency || "SATS",
      Location: oldValues?.location.displayName,
      "Shipping Option": oldValues?.shippingType,
      "Shipping Cost": oldValues?.shippingCost || 0,
      Categories: oldValues?.categories || [],
      "Content Warning": oldValues?.warning || false,
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

  const onSubmit = async (data: ProductFormData) => {
    try {
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
          data["Shipping Option"].toString(),
          data["Shipping Cost"] ? data["Shipping Cost"].toString() : "0",
          data["Currency"],
        ],
      ];

      const locationCode = getNameToCodeMap(data["Location"]);
      tags.push(...buildListingGeotags({ iso3166: locationCode }));

      images.forEach((image) => {
        tags.push(["image", image]);
      });

      data["Categories"].forEach((category) => {
        tags.push(["t", category]);
      });

      // Relay search (NIP-50) not widespread enough, use tags instead for relay querying
      getKeywords(data["Product Name"] + " " + data["Description"]).forEach(
        (keyword) => {
          tags.push(["s", keyword]);
        },
      );

      if (data["Content Warning"] === true) {
        tags.push(
          ["L", "content-warning"],
          ["l", "n/a", "content-warning"],
          ["content-warning", "n/a"],
        );
      }

      console.log("generated tags for new listing:", tags);

      let newListing = await PostListing(tags, passphrase);

      capturePostListingMetric(newListing.id, tags);

      if (isEdit) {
        if (handleDelete && oldValues?.id) {
          handleDelete(oldValues.id, passphrase);
        }
      }

      const productEvent = parseTags(newListing);

      clear();
      handleModalToggle();
      productEventContext.addNewlyCreatedProductEvents([productEvent]);
      addProductToCache(productEvent);
      setIsPostingOrUpdatingProduct(false);
      if (onSubmitCallback) {
        onSubmitCallback();
      }
    } catch (err) {
      console.log("Error submiting listing", err);
    }
  };

  const clear = () => {
    setPassphrase("");
    setImages([]);
    reset({
      "Product Name": "",
      Description: "",
      Price: "",
      Currency: "SATS",
      Location: "",
      "Shipping Option": "N/A",
      "Shipping Cost": 0,
      Categories: new Set<string>(),
      "Content Warning": false,
    });
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
          Add a New Product Listing
        </ModalHeader>
        <form onSubmit={handleSubmit(onSubmit as any)}>
          <ModalBody>
            {signIn === "nsec" && (
              <Input
                autoFocus
                isRequired={isButtonDisabled}
                className="text-light-text dark:text-dark-text"
                ref={passphraseInputRef}
                variant="flat"
                label="Enter your Passphrase to create a listing..."
                labelPlacement="inside"
                onChange={(e) => setPassphrase(e.target.value)}
                value={passphrase}
              />
            )}
            <Divider></Divider>
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
              disabled={isButtonDisabled}
              isIconOnly={false}
              className={buttonClassName}
              passphrase={passphrase}
              isMultiple={true}
              imgCallbackOnUpload={(imgUrls) => {
                setImages((prevValues) => {
                  const updatedImages = [...prevValues];
                  console.log("imgUrl", imgUrls);
                  if (imgUrls && imgUrls.length > 0) {
                    return [...updatedImages, ...imgUrls];
                  }
                  return [...updatedImages];
                });
              }}
            >
              {isButtonDisabled
                ? "Enter your passphrase to upload images!"
                : "Upload Images"}
            </FileUploaderButton>
            <Controller
              name="Description"
              control={control}
              rules={{
                required: "A description is required.",
                maxLength: {
                  value: 500,
                  message: "This input exceed maxLength of 500.",
                },
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
                                {CURRENCY_OPTIONS.map((currencyOption) => {
                                  return (
                                    <option key={currencyOption}>
                                      {currencyOption}
                                    </option>
                                  );
                                })}
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
                    selectedLocation={value}
                    onSelectionChange={(key: string) => {
                      onChange(key);
                    }}
                    isInvalid={isErrored}
                    errorMessage={errorMessage}
                    // controller props
                    onBlur={onBlur} // notify when input is touched/blur
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
                    variant="bordered"
                    aria-label="Shipping Option"
                    label="Shipping Option"
                    isInvalid={isErrored}
                    errorMessage={errorMessage}
                    disallowEmptySelection={true}
                    // controller props
                    onChange={onChange} // send value to hook form
                    onBlur={onBlur} // notify when input is touched/blur
                    selectedKeys={[value]}
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
                      variant="flat"
                      placeholder="Shipping Cost"
                      isInvalid={isErrored}
                      errorMessage={errorMessage}
                      // controller props
                      onChange={onChange} // send value to hook form
                      onBlur={onBlur} // notify when input is touched/blur
                      value={value.toString()}
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
                            {CURRENCY_OPTIONS.map((currencyOption) => {
                              return (
                                <option key={currencyOption}>
                                  {currencyOption}
                                </option>
                              );
                            })}
                          </select>
                        </div>
                      }
                    />
                  );
                }}
              />
            )}
            <Controller
              name="Categories"
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
                  <CategoryDropdown
                    selectedCategories={new Set<string>(value)}
                    // controller props
                    isInvalid={isErrored}
                    errorMessage={errorMessage}
                    onBlur={onBlur}
                    onChange={(event: { target: { value: string } }) => {
                      if (event.target.value === "") {
                        onChange(new Set<string>([]));
                      } else {
                        onChange(
                          new Set<string>(event.target.value.split(",")),
                        );
                      }
                    }}
                  ></CategoryDropdown>
                );
              }}
            />

            <Controller
              name="Content Warning"
              control={control}
              // do not add rule; form will prevent submit because of boolean value if false
              render={({
                field: { onChange, onBlur, value },
                fieldState: { error },
              }) => {
                return (
                  <Switch
                    onValueChange={onChange}
                    onBlur={onBlur}
                    isSelected={value === true ? true : false}
                  >
                    <div className="text-small text-light-text dark:text-dark-text">
                      {value === true
                        ? "Show Content Warning"
                        : "Don't Show Content Warning"}
                    </div>
                  </Switch>
                );
              }}
            />
            <Divider></Divider>
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
                token that is redeemable to Bitcoin.
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
