import React, { useEffect, useState, useContext, useMemo } from "react";
import { SettingsBreadCrumbs } from "@/components/settings/settings-bread-crumbs";
import { ProfileMapContext } from "@/utils/context/context";
import { useForm, Controller } from "react-hook-form";
import { Button, Textarea, Input, Image } from "@nextui-org/react";
import {
  ArrowUpOnSquareIcon,
  CheckIcon,
  ClipboardIcon,
} from "@heroicons/react/24/outline";
import { SHOPSTRBUTTONCLASSNAMES } from "@/components/utility/STATIC-VARIABLES";

import {
  getNsecWithPassphrase,
  getLocalStorageData,
  validPassphrase,
} from "@/components/utility/nostr-helper-functions";
import { FileUploaderButton } from "@/components/utility-components/file-uploader";
import RequestPassphraseModal from "@/components/utility-components/request-passphrase-modal";
import ShopstrSpinner from "@/components/utility-components/shopstr-spinner";
import { createNostrShopEvent } from "../api/nostr/crud-service";

const ShopSettingsPage = () => {
  const [enterPassphrase, setEnterPassphrase] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isFetchingShop, setIsFetchingShop] = useState(false);
  const [userPubkey, setUserPubkey] = useState("");
  const [isCopyPopoverOpen, setIsCopyPopoverOpen] = React.useState(false);

  const { signInMethod, userNPub } = getLocalStorageData();

  const profileContext = useContext(ProfileMapContext);
  const {
    handleSubmit,
    formState: { errors },
    control,
    reset,
    watch,
    setValue,
  } = useForm({
    defaultValues: {
      banner: "",
      picture: "",
      display_name: "",
      name: "",
      nip05: "", // Nostr address
      about: "",
      website: "",
      lud16: "", // Lightning address
    },
  });

  useEffect(() => {
    setUserPubkey(getLocalStorageData().userPubkey);
  }, []);

  const watchBanner = watch("banner");
  const watchPicture = watch("picture");
  const defaultImage = useMemo(() => {
    return "https://robohash.idena.io/" + userPubkey;
  }, [userPubkey]);

  useEffect(() => {
    if (signInMethod === "nsec" && !validPassphrase(passphrase)) {
      setEnterPassphrase(true); // prompt for passphrase when chatsContext is loaded
    } else {
      setIsFetchingShop(true);
      const profileMap = profileContext.profileData;
      const profile = profileMap.has(userPubkey)
        ? profileMap.get(userPubkey)
        : undefined;
      if (profile) {
        reset(profile.content);
      }
      setIsFetchingShop(false);
    }
  }, [profileContext, userPubkey, passphrase]);

  const onSubmit = async (data: { [x: string]: string }) => {
    setIsUploadingLogo(true);
    const transformedData = {
      name: data.name || "", // Optional: Default to an empty string if not present
      about: data.about || "", // Optional: Default to empty string if not present
      ui: {
        picture: data.picture || "", // Optional: Default to empty string if not present
        banner: data.banner || "", // Optional: Default to empty string if not present
        theme: "", // Default value for theme
        darkMode: false, // Default value for darkMode
      },
      // Assuming merchants are collected from some other part of the context or logic:
      merchants: [userPubkey],
    };
    let response = await createNostrShopEvent(
      userPubkey,
      JSON.stringify(transformedData),
      passphrase,
    );
    // profileContext.updateProfileData({
    //   pubkey: userPubkey,
    //   content: data,
    //   created_at: 0,
    // });
    setIsUploadingLogo(false);
  };

  const isButtonDisabled = useMemo(() => {
    if (signInMethod === "extension") return false; // extension can upload without passphrase
    if (passphrase === "") return true; // nsec needs passphrase
    try {
      let nsec = getNsecWithPassphrase(passphrase);
      if (!nsec) return true; // invalid passphrase
    } catch (e) {
      return true; // invalid passphrase
    }
    return false;
  }, [signInMethod, passphrase]);

  const buttonClassName = useMemo(() => {
    const disabledStyle = "from-gray-300 to-gray-400 cursor-not-allowed";
    const enabledStyle = SHOPSTRBUTTONCLASSNAMES;
    const className = isButtonDisabled ? disabledStyle : enabledStyle;
    return `w-full mb-10 ${className}`;
  }, [isButtonDisabled]);

  return (
    <>
      <div className="flex min-h-screen flex-col bg-light-bg pb-40 pt-4 dark:bg-dark-bg sm:ml-[120px] md:ml-[250px] md:pb-20">
        <div className="h-full w-full px-4 lg:w-1/2">
          <SettingsBreadCrumbs />
          {isFetchingShop ? (
            <ShopstrSpinner />
          ) : (
            <>
              <div className="mb-20 h-40 rounded-lg bg-light-fg dark:bg-dark-fg">
                <div className="relative flex h-40 items-center justify-center rounded-lg bg-shopstr-purple-light dark:bg-dark-fg">
                  {watchBanner && (
                    <Image
                      alt={"Shop banner image"}
                      src={watchBanner}
                      className="h-40 w-full rounded-lg object-cover object-fill"
                    />
                  )}
                  <FileUploaderButton
                    isIconOnly={false}
                    className={`absolute bottom-5 right-5 z-20 ${SHOPSTRBUTTONCLASSNAMES}`}
                    passphrase={passphrase}
                    imgCallbackOnUpload={(imgUrl) => setValue("banner", imgUrl)}
                  >
                    Upload Banner
                  </FileUploaderButton>
                </div>
                <div className="flex items-center justify-center">
                  <div className="relative z-50 mt-[-3rem] h-24 w-24">
                    <div className="">
                      <FileUploaderButton
                        isIconOnly
                        className={`absolute bottom-[-0.5rem] right-[-0.5rem] z-20 ${SHOPSTRBUTTONCLASSNAMES}`}
                        passphrase={passphrase}
                        imgCallbackOnUpload={(imgUrl) =>
                          setValue("picture", imgUrl)
                        }
                      >
                        <ArrowUpOnSquareIcon className="h-6 w-6" />
                      </FileUploaderButton>
                      {watchPicture ? (
                        <Image
                          src={watchPicture}
                          alt="shop logo"
                          className="rounded-full"
                        />
                      ) : (
                        <Image
                          src={defaultImage}
                          alt="shop logo"
                          className="rounded-full"
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <form onSubmit={handleSubmit(onSubmit as any)}>
                <Controller
                  name="name"
                  control={control}
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
                        className="pb-4 text-light-text dark:text-dark-text"
                        classNames={{
                          label: "text-light-text dark:text-dark-text text-lg",
                        }}
                        variant="bordered"
                        fullWidth={true}
                        label="Display name"
                        labelPlacement="outside"
                        isInvalid={isErrored}
                        errorMessage={errorMessage}
                        placeholder="Add your shop's name . . ."
                        // controller props
                        onChange={onChange} // send value to hook form
                        onBlur={onBlur} // notify when input is touched/blur
                        value={value}
                      />
                    );
                  }}
                />

                <Controller
                  name="about"
                  control={control}
                  rules={{
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
                    let errorMessage: string = error?.message
                      ? error.message
                      : "";
                    return (
                      <Textarea
                        className="pb-4 text-light-text dark:text-dark-text"
                        classNames={{
                          label: "text-light-text dark:text-dark-text text-lg",
                        }}
                        variant="bordered"
                        fullWidth={true}
                        placeholder="Add something about your shop . . ."
                        isInvalid={isErrored}
                        errorMessage={errorMessage}
                        label="About"
                        labelPlacement="outside"
                        // controller props
                        onChange={onChange} // send value to hook form
                        onBlur={onBlur} // notify when input is touched/blur
                        value={value}
                      />
                    );
                  }}
                />

                <Button
                  className={buttonClassName}
                  type="submit"
                  onClick={(e) => {}}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !isButtonDisabled) {
                      e.preventDefault(); // Prevent default to avoid submitting the form again
                      handleSubmit(onSubmit as any)(); // Programmatic submit
                    }
                  }}
                  isDisabled={isUploadingLogo}
                  isLoading={isUploadingLogo}
                >
                  Save Shop
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
      <RequestPassphraseModal
        passphrase={passphrase}
        setCorrectPassphrase={setPassphrase}
        isOpen={enterPassphrase}
        setIsOpen={setEnterPassphrase}
        onCancelRouteTo="/settings"
      />
    </>
  );
};

export default ShopSettingsPage;
