import React, { useEffect, useState, useContext, useMemo } from "react";
import { SettingsBreadCrumbs } from "@/components/settings/settings-bread-crumbs";
import { ProfileMapContext } from "@/utils/context/context";
import { useForm, Controller, set } from "react-hook-form";
import { Button, Textarea, Input } from "@nextui-org/react";
import { ArrowUpOnSquareIcon } from "@heroicons/react/24/outline";
import { SHOPSTRBUTTONCLASSNAMES } from "@/components/utility/STATIC-VARIABLES";

import {
  getNsecWithPassphrase,
  getLocalStorageData,
  validPassphrase,
} from "@/components/utility/nostr-helper-functions";
import { FileUploaderButton } from "@/components/utility-components/file-uploader";
import RequestPassphraseModal from "@/components/utility-components/request-passphrase-modal";
import ShopstrSpinner from "@/components/utility-components/shopstr-spinner";
import { createNostrProfileEvent } from "../api/nostr/crud-service";

const UserProfilePage = () => {
  const [enterPassphrase, setEnterPassphrase] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [isUploadingProfile, setIsUploadingProfile] = useState(false);
  const [isFetchingProfile, setIsFetchingProfile] = useState(false);
  const [userPubkey, setUserPubkey] = useState("");

  const { signInMethod } = getLocalStorageData();

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
      name: "",
      nip05: "", // Nostr Address
      about: "",
      website: "",
      lud16: "", // Nostr Address
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
      setIsFetchingProfile(true);
      const profileMap = profileContext.profileData;
      const profile = profileMap.has(userPubkey)
        ? profileMap.get(userPubkey)
        : undefined;
      if (profile) {
        reset(profile.content);
      }
      setIsFetchingProfile(false);
    }
  }, [profileContext, userPubkey, passphrase]);

  const onSubmit = async (data: { [x: string]: string }) => {
    setIsUploadingProfile(true);
    let response = await createNostrProfileEvent(
      userPubkey,
      JSON.stringify({ ...data, display_name: data.name }),
      passphrase,
    );
    profileContext.updateProfileData({
      pubkey: userPubkey,
      content: data,
      created_at: 0,
    });
    setIsUploadingProfile(false);
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
    return `w-full ${className}`;
  }, [isButtonDisabled]);

  return (
    <>
      <div className="flex min-h-screen flex-col bg-light-bg pb-20 pt-4 dark:bg-dark-bg sm:ml-[120px] md:ml-[250px]">
        <div className="bg h-screen w-full px-4 lg:w-1/2">
          <SettingsBreadCrumbs />
          {isFetchingProfile ? (
            <ShopstrSpinner />
          ) : (
            <>
              <div className="mb-24 h-60 rounded-lg bg-light-fg dark:bg-dark-fg">
                <div className="relative h-60 rounded-lg bg-shopstr-purple-light dark:bg-dark-fg">
                  {watchBanner && (
                    <img src={watchBanner} className="h-60 w-full rounded-lg" />
                  )}
                  <FileUploaderButton
                    isIconOnly={false}
                    className={`absolute bottom-5 right-5 ${SHOPSTRBUTTONCLASSNAMES}`}
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
                        className={`absolute bottom-[-0.5rem] right-[-0.5rem] ${SHOPSTRBUTTONCLASSNAMES}`}
                        passphrase={passphrase}
                        imgCallbackOnUpload={(imgUrl) =>
                          setValue("picture", imgUrl)
                        }
                      >
                        <ArrowUpOnSquareIcon className="h-6 w-6" />{" "}
                      </FileUploaderButton>
                      {watchPicture ? (
                        <img
                          src={watchPicture}
                          alt="user profile picture"
                          className="rounded-full"
                        />
                      ) : (
                        <img
                          src={defaultImage}
                          alt="user profile picture"
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
                        autoFocus
                        variant="bordered"
                        fullWidth={true}
                        label="Name"
                        labelPlacement="outside"
                        isInvalid={isErrored}
                        errorMessage={errorMessage}
                        placeholder="Add your name"
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
                      value: 300,
                      message: "This input exceed maxLength of 300.",
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
                        placeholder="Tell us something about yourself!"
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

                <Controller
                  name="website"
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
                        autoFocus
                        variant="bordered"
                        fullWidth={true}
                        label="Website"
                        labelPlacement="outside"
                        isInvalid={isErrored}
                        errorMessage={errorMessage}
                        placeholder="Add your website address"
                        // controller props
                        onChange={onChange} // send value to hook form
                        onBlur={onBlur} // notify when input is touched/blur
                        value={value}
                      />
                    );
                  }}
                />
                <Controller
                  name="nip05"
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
                        autoFocus
                        variant="bordered"
                        fullWidth={true}
                        label="Nostr Address"
                        labelPlacement="outside"
                        isInvalid={isErrored}
                        errorMessage={errorMessage}
                        placeholder="Add your nip05 Address"
                        // controller props
                        onChange={onChange} // send value to hook form
                        onBlur={onBlur} // notify when input is touched/blur
                        value={value}
                      />
                    );
                  }}
                />

                <Controller
                  name="lud16"
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
                        autoFocus
                        variant="bordered"
                        fullWidth={true}
                        label="Lightning Address"
                        labelPlacement="outside"
                        isInvalid={isErrored}
                        errorMessage={errorMessage}
                        placeholder="Add your lightning address"
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
                  isDisabled={isUploadingProfile}
                  isLoading={isUploadingProfile}
                >
                  Save Profile
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

export default UserProfilePage;