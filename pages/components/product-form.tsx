// TODO componentarize file uploader
import React, { useMemo, useRef, useEffect, useState } from "react";
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
  Chip,
  Image,
} from "@nextui-org/react";
import { TrashIcon } from "@heroicons/react/24/outline";
import Carousal from "@itseasy21/react-elastic-carousel";

import {
  PostListing,
  getNsecWithPassphrase,
  getPrivKeyWithPassphrase,
  nostrBuildUploadImage,
} from "./utility/nostr-helper-functions";
import { finishEvent } from "nostr-tools";
import { CATEGORIES, SHIPPING_OPTIONS } from "./utility/STATIC-VARIABLES";
import LocationDropdown from "./utility-components/location-dropdown";
import ConfirmActionDropdown from "./utility-components/confirm-action-dropdown";

interface ProductFormProps {
  handleModalToggle: () => void;
  showModal: boolean;
}

export default function NewForm({
  showModal,
  handleModalToggle,
}: ProductFormProps) {
  const [passphrase, setPassphrase] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [signIn, setSignIn] = useState("");

  const {
    handleSubmit,
    formState: { errors },
    control,
    reset,
    watch,
  } = useForm({
    defaultValues: {
      Currency: "SATS",
      "Shipping Option": "N/A",
    },
  });

  const onSubmit = async (data) => {
    let tags = [
      ["title", data["Product Name"]],
      ["summary", data["Description"]],
      ["price", data["Price"], data["Currency"]],
      ["location", data["Location"]],
      [
        "shipping",
        data["Shipping Option"],
        data["Shipping Cost"] ? data["Shipping Cost"] : 0,
        data["Currency"],
      ],
    ];

    images.forEach((image) => {
      tags.push(["image", image]);
    });

    data["Category"].split(",").forEach((category) => {
      tags.push(["t", category]);
    });

    await PostListing(tags, passphrase);
    clear();
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      const signIn = localStorage.getItem("signIn");
      setSignIn(signIn);
    }
  }, []);

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
    const enabledStyle = " from-purple-600 via-purple-500 to-purple-600";
    const className =
      "text-white shadow-lg bg-gradient-to-tr" +
      (isButtonDisabled ? disabledStyle : enabledStyle);
    return className;
  }, [isButtonDisabled]);

  const passphraseInputRef = useRef(null);

  const FileUploader = ({
    uploadImage,
    disabled,
    passphraseInputRef,
    buttonClassName,
  }) => {
    const [loading, setLoading] = useState(false);
    // Create a reference to the hidden file input element
    const hiddenFileInput = useRef(null);

    // Programatically click the hidden file input element
    // when the Button component is clicked
    const handleClick = (event) => {
      if (disabled && signIn === "nsec") {
        // shows user that they need to enter passphrase
        passphraseInputRef.current.focus();
        return;
      }
      hiddenFileInput.current.click();
    };
    // Call a function (passed as a prop from the parent component)
    // to handle the user-selected file
    const handleChange = async (event) => {
      const fileUploaded = event.target.files[0];
      setLoading(true);
      await uploadImage(fileUploaded);
      setLoading(false);
    };
    return (
      <>
        <Button
          isLoading={loading}
          onClick={handleClick}
          className={buttonClassName}
        >
          {disabled ? "Enter your passphrase!" : "Upload An Image"}
        </Button>
        <input
          type="file"
          accept="image/*"
          ref={hiddenFileInput}
          onChange={handleChange}
          style={{ display: "none" }}
        />
      </>
    );
  };

  const deleteImage = (image) => () => {
    setImages((prevValues) => {
      const updatedImages = [...prevValues];
      const index = updatedImages.indexOf(image);
      if (index > -1) {
        updatedImages.splice(index, 1);
      }
      return updatedImages;
    });
  };

  const uploadImage = async (imageFile: File) => {
    try {
      if (!imageFile.type.includes("image"))
        throw new Error("Only images are supported");

      let response;

      if (signIn === "nsec") {
        if (!passphrase || !getNsecWithPassphrase(passphrase))
          throw new Error("Invalid passphrase!");

        const privkey = getPrivKeyWithPassphrase(passphrase);
        response = await nostrBuildUploadImage(imageFile, (e) =>
          finishEvent(e, privkey),
        );
      } else if (signIn === "extension") {
        response = await nostrBuildUploadImage(
          imageFile,
          async (e) => await window.nostr.signEvent(e),
        );
      }

      const imageUrl = response.url;
      setImages((prevValues) => {
        const updatedImages = [...prevValues];
        return [...updatedImages, imageUrl];
      });
    } catch (e) {
      if (e instanceof Error) alert("Failed to upload image! " + e.message);
    }
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
        <ModalHeader className="flex flex-col gap-1">
          Add New Product Listing
        </ModalHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
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
                images.map((image) => (
                  <div className="">
                    <div className="flex flex-row-reverse ">
                      {
                        <ConfirmActionDropdown
                          helpText="Are you sure you want to delete this image?"
                          buttonLabel="Delete Image"
                          onConfirm={deleteImage(image)}
                        >
                          <Button
                            isIconOnly
                            color="danger"
                            aria-label="Trash"
                            radius="full"
                            className="z-20 top-12 right-3 bg-gradient-to-tr from-blue-950 to-red-950 text-white"
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
                    />
                  </div>
                ))
              ) : (
                <div className="flex items-center justify-center w-full h-full">
                  <Image
                    alt="Product Image"
                    className="object-cover"
                    src="/no-image-placeholder.png"
                    width={350}
                  />
                </div>
              )}
            </Carousal>
            <FileUploader
              uploadImage={uploadImage}
              disabled={isButtonDisabled}
              passphraseInputRef={passphraseInputRef}
              buttonClassName={buttonClassName}
            />
            <Controller
              name="Description"
              control={control}
              rules={{
                required: "A description is required.",
                maxLength: {
                  value: 300,
                  message: "This input exceed maxLength of 300.",
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
                                className="outline-none border-0 bg-transparent text-default-400 text-small"
                                key={"currency"}
                                id="currency"
                                name="currency"
                                onChange={onChange} // send value to hook form
                                onBlur={onBlur} // notify when input is touched/blur
                                value={value}
                              >
                                <option key="USD">USD</option>
                                <option key="SATS">SATS</option>
                                {/* <option key="EUR">EUR</option> */}
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
                    selectedKeys={[value]}
                  >
                    {SHIPPING_OPTIONS.map((option) => (
                      <SelectItem key={option}>{option}</SelectItem>
                    ))}
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
                      value={value}
                      endContent={
                        <div className="flex items-center">
                          <select
                            className="outline-none border-0 bg-transparent text-default-400 text-small"
                            key={"currency"}
                            id="currency"
                            name="currency"
                            value={watchCurrency}
                            disabled={true}
                          >
                            <option key="USD">USD</option>
                            <option key="SATS">SATS</option>
                            {/* <option key="EUR">EUR</option> */}
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
                required: "A Category is required.",
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
                    classNames={{
                      base: "mt-4",
                      trigger: "min-h-unit-12 py-2",
                      label: "top-5",
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
                    {CATEGORIES.map((category) => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </Select>
                );
              }}
            />
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
            >
              List Product
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
}
