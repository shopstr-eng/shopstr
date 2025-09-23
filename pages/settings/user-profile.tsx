import React, { useEffect, useState, useContext, useMemo } from "react";
import { SettingsBreadCrumbs } from "@/components/settings/settings-bread-crumbs";
import { ProfileMapContext } from "@/utils/context/context";
import { useForm, Controller } from "react-hook-form";
import {
  Button,
  Textarea,
  Input,
  Image,
  Select,
  SelectItem,
} from "@nextui-org/react";
import {
  CheckIcon,
  ClipboardIcon,
  EyeSlashIcon,
  EyeIcon,
} from "@heroicons/react/24/outline";
import { FiatOptionsType } from "@/utils/types/types";
import { SHOPSTRBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";
import {
  SignerContext,
  NostrContext,
} from "@/components/utility-components/nostr-context-provider";
import { NostrNSecSigner } from "@/utils/nostr/signers/nostr-nsec-signer";
import { createNostrProfileEvent } from "@/utils/nostr/nostr-helper-functions";
import { FileUploaderButton } from "@/components/utility-components/file-uploader";
import ShopstrSpinner from "@/components/utility-components/shopstr-spinner";

const UserProfilePage = () => {
  const { nostr } = useContext(NostrContext);
  const [isUploadingProfile, setIsUploadingProfile] = useState(false);
  const [isFetchingProfile, setIsFetchingProfile] = useState(false);
  const {
    signer,
    pubkey: userPubkey,
    npub: userNPub,
  } = useContext(SignerContext);
  const [isNPubCopied, setIsNPubCopied] = useState(false);
  const [isNSecCopied, setIsNSecCopied] = useState(false);
  const [userNSec, setUserNSec] = useState("");
  const [viewState, setViewState] = useState<"shown" | "hidden">("hidden");

  const profileContext = useContext(ProfileMapContext);
  const { handleSubmit, control, reset, watch, setValue } = useForm({
    defaultValues: {
      banner: "",
      picture: "",
      display_name: "",
      name: "",
      nip05: "", // Nostr address
      about: "",
      website: "",
      lud16: "", // Lightning address
      payment_preference: "ecash",
      fiat_options: {} as FiatOptionsType,
      shopstr_donation: 2.1,
    },
  });

  const watchBanner = watch("banner");
  const watchPicture = watch("picture");
  const defaultImage = useMemo(() => {
    return "https://robohash.org/" + userPubkey;
  }, [userPubkey]);

  useEffect(() => {
    if (!userPubkey) return;
    setIsFetchingProfile(true);
    const profileMap = profileContext.profileData;
    const profile = profileMap.has(userPubkey)
      ? profileMap.get(userPubkey)
      : undefined;
    if (profile) {
      reset(profile.content);
    }
    setIsFetchingProfile(false);

    if (signer instanceof NostrNSecSigner) {
      const nsecSigner = signer as NostrNSecSigner;
      nsecSigner._getNSec().then(
        (nsec) => {
          setUserNSec(nsec);
        },
        (err: unknown) => {
          console.error(err);
        }
      );
    }
  }, [profileContext, userPubkey, signer, reset]);

  const onSubmit = async (data: { [x: string]: string }) => {
    if (!userPubkey) throw new Error("pubkey is undefined");
    setIsUploadingProfile(true);
    await createNostrProfileEvent(nostr!, signer!, JSON.stringify(data));
    profileContext.updateProfileData({
      pubkey: userPubkey!,
      content: data,
      created_at: 0,
    });
    setIsUploadingProfile(false);
  };

  return (
    <>
      <div className="flex min-h-screen flex-col bg-light-bg pt-24 dark:bg-dark-bg md:pb-20">
        <div className="mx-auto h-full w-full px-4 lg:w-1/2">
          <SettingsBreadCrumbs />
          {isFetchingProfile ? (
            <ShopstrSpinner />
          ) : (
            <>
              <div className="mb-20 h-40 rounded-lg bg-light-fg dark:bg-dark-fg">
                <div className="relative flex h-40 items-center justify-center rounded-lg bg-shopstr-purple-light dark:bg-dark-fg">
                  {watchBanner && (
                    <Image
                      alt={"User banner image"}
                      src={watchBanner}
                      className="h-40 w-full rounded-lg object-cover object-fill"
                    />
                  )}
                  <FileUploaderButton
                    className={`absolute bottom-5 right-5 z-20 border-2 border-white bg-shopstr-purple shadow-md ${SHOPSTRBUTTONCLASSNAMES}`}
                    imgCallbackOnUpload={(imgUrl) => setValue("banner", imgUrl)}
                  >
                    Upload Banner
                  </FileUploaderButton>
                </div>
                <div className="flex items-center justify-center">
                  <div className="relative z-20 mt-[-3rem] h-24 w-24">
                    <div className="">
                      <FileUploaderButton
                        isIconOnly
                        className={`absolute bottom-[-0.5rem] right-[-0.5rem] z-20 ${SHOPSTRBUTTONCLASSNAMES}`}
                        imgCallbackOnUpload={(imgUrl) =>
                          setValue("picture", imgUrl)
                        }
                      />
                      {watchPicture ? (
                        <Image
                          src={watchPicture}
                          alt="user profile picture"
                          className="rounded-full"
                        />
                      ) : (
                        <Image
                          src={defaultImage}
                          alt="user profile picture"
                          className="rounded-full"
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div
                className="mx-auto mb-2 flex w-full max-w-2xl cursor-pointer flex-row items-center justify-center rounded-lg border-2 border-light-fg p-2 hover:opacity-60 dark:border-dark-fg"
                onClick={() => {
                  navigator.clipboard.writeText(userNPub!);
                  setIsNPubCopied(true);
                  setTimeout(() => {
                    setIsNPubCopied(false);
                  }, 2100);
                }}
              >
                <span
                  className="lg:text-md break-all pr-2 text-[0.50rem] font-bold text-light-text dark:text-dark-text sm:text-xs md:text-sm"
                  suppressHydrationWarning
                >
                  {userNPub!}
                </span>
                {isNPubCopied ? (
                  <CheckIcon
                    width={15}
                    height={15}
                    className="flex-shrink-0 text-light-text dark:text-dark-text"
                  />
                ) : (
                  <ClipboardIcon
                    width={15}
                    height={15}
                    className="flex-shrink-0 text-light-text hover:text-purple-700 dark:text-dark-text dark:hover:text-yellow-700"
                  />
                )}
              </div>

              {userNSec ? (
                <div className="mx-auto mb-12 flex w-full max-w-2xl cursor-pointer flex-row items-center justify-center rounded-lg border-2 border-light-fg p-2 dark:border-dark-fg">
                  <span
                    className="lg:text-md break-all pr-2 text-[0.50rem] font-bold text-light-text dark:text-dark-text sm:text-xs md:text-sm"
                    suppressHydrationWarning
                  >
                    {viewState === "shown"
                      ? userNSec
                      : "***************************************************************"}
                  </span>
                  {isNSecCopied ? (
                    <CheckIcon
                      width={15}
                      height={15}
                      className="flex-shrink-0 text-light-text dark:text-dark-text"
                    />
                  ) : (
                    <ClipboardIcon
                      width={15}
                      height={15}
                      className="flex-shrink-0 text-light-text hover:text-purple-700 dark:text-dark-text dark:hover:text-yellow-700"
                      onClick={() => {
                        navigator.clipboard.writeText(userNSec);
                        setIsNSecCopied(true);
                        setTimeout(() => {
                          setIsNSecCopied(false);
                        }, 2100);
                      }}
                    />
                  )}
                  {viewState === "shown" ? (
                    <EyeSlashIcon
                      className="h-6 w-6 flex-shrink-0 px-1 text-light-text hover:text-purple-700 dark:text-dark-text dark:hover:text-yellow-700"
                      onClick={() => {
                        setViewState("hidden");
                      }}
                    />
                  ) : (
                    <EyeIcon
                      className="h-6 w-6 flex-shrink-0 px-1 text-light-text hover:text-purple-700 dark:text-dark-text dark:hover:text-yellow-700"
                      onClick={() => {
                        setViewState("shown");
                      }}
                    />
                  )}
                </div>
              ) : (
                <div className="mb-12" />
              )}

              <form onSubmit={handleSubmit(onSubmit as any)}>
                <Controller
                  name="display_name"
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
                        placeholder="Add your display name . . ."
                        // controller props
                        onChange={onChange} // send value to hook form
                        onBlur={onBlur} // notify when input is touched/blur
                        value={value}
                      />
                    );
                  }}
                />

                <Controller
                  name="name"
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
                        className="pb-4 text-light-text dark:text-dark-text"
                        classNames={{
                          label: "text-light-text dark:text-dark-text text-lg",
                        }}
                        variant="bordered"
                        fullWidth={true}
                        label="Username"
                        labelPlacement="outside"
                        isInvalid={isErrored}
                        errorMessage={errorMessage}
                        placeholder="Add your username . . ."
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
                        className="pb-4 text-light-text dark:text-dark-text"
                        classNames={{
                          label: "text-light-text dark:text-dark-text text-lg",
                        }}
                        variant="bordered"
                        fullWidth={true}
                        placeholder="Add something about yourself . . ."
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
                        className="pb-4 text-light-text dark:text-dark-text"
                        classNames={{
                          label: "text-light-text dark:text-dark-text text-lg",
                        }}
                        variant="bordered"
                        fullWidth={true}
                        label="Website"
                        labelPlacement="outside"
                        isInvalid={isErrored}
                        errorMessage={errorMessage}
                        placeholder="Add your website URL . . ."
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
                        className="pb-4 text-light-text dark:text-dark-text"
                        classNames={{
                          label: "text-light-text dark:text-dark-text text-lg",
                        }}
                        variant="bordered"
                        fullWidth={true}
                        label="Nostr address"
                        labelPlacement="outside"
                        isInvalid={isErrored}
                        errorMessage={errorMessage}
                        placeholder="Add your NIP-05 address . . ."
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
                        className="pb-4 text-light-text dark:text-dark-text"
                        classNames={{
                          label: "text-light-text dark:text-dark-text text-lg",
                        }}
                        variant="bordered"
                        fullWidth={true}
                        label="Lightning address"
                        labelPlacement="outside"
                        isInvalid={isErrored}
                        errorMessage={errorMessage}
                        placeholder="Add your Lightning address . . ."
                        // controller props
                        onChange={onChange} // send value to hook form
                        onBlur={onBlur} // notify when input is touched/blur
                        value={value}
                      />
                    );
                  }}
                />
                <Controller
                  name="payment_preference"
                  control={control}
                  render={({ field: { onChange, onBlur, value } }) => (
                    <Select
                      className="pb-4 text-light-text dark:text-dark-text"
                      classNames={{
                        label: "text-light-text dark:text-dark-text text-lg",
                      }}
                      variant="bordered"
                      fullWidth={true}
                      label="Bitcoin payment preference"
                      labelPlacement="outside"
                      selectedKeys={value ? [value] : []}
                      onChange={(e) => onChange(e.target.value)}
                      onBlur={onBlur}
                    >
                      <SelectItem
                        key="ecash"
                        value="ecash"
                        className="text-light-text dark:text-dark-text"
                      >
                        Cashu (Bitcoin)
                      </SelectItem>
                      <SelectItem
                        key="lightning"
                        value="lightning"
                        className="text-light-text dark:text-dark-text"
                      >
                        Lightning (Bitcoin)
                      </SelectItem>
                      <SelectItem
                        key="fiat"
                        value="fiat"
                        className="text-light-text dark:text-dark-text"
                      >
                        Local Currency (Fiat)
                      </SelectItem>
                    </Select>
                  )}
                />

                <div className="pb-4">
                  <label className="mb-2 block text-lg text-light-text dark:text-dark-text">
                    Fiat payment options
                  </label>
                  <div className="space-y-4">
                    {[
                      { key: "cash", label: "Cash", requiresUsername: false },
                      { key: "venmo", label: "Venmo", requiresUsername: true },
                      { key: "zelle", label: "Zelle", requiresUsername: true },
                      {
                        key: "cashapp",
                        label: "Cash App",
                        requiresUsername: true,
                      },
                      {
                        key: "applepay",
                        label: "Apple Pay",
                        requiresUsername: true,
                      },
                      {
                        key: "googlepay",
                        label: "Google Pay",
                        requiresUsername: true,
                      },
                      {
                        key: "paypal",
                        label: "PayPal",
                        requiresUsername: true,
                      },
                    ].map((option) => (
                      <div
                        key={option.key}
                        className="flex items-center space-x-4"
                      >
                        <input
                          type="checkbox"
                          id={option.key}
                          checked={Object.keys(
                            watch("fiat_options") || {}
                          ).includes(option.key)}
                          onChange={(e) => {
                            const currentOptions = watch("fiat_options") || {};
                            if (e.target.checked) {
                              if (option.requiresUsername) {
                                setValue("fiat_options", {
                                  ...currentOptions,
                                  [option.key]: "",
                                });
                              } else {
                                setValue("fiat_options", {
                                  ...currentOptions,
                                  [option.key]: "available",
                                });
                              }
                            } else {
                              const { [option.key]: _removed, ...rest } =
                                currentOptions;
                              setValue("fiat_options", rest);
                            }
                          }}
                          className="h-4 w-4 rounded border-gray-300 text-shopstr-purple focus:ring-shopstr-purple"
                        />
                        <label
                          htmlFor={option.key}
                          className="text-light-text dark:text-dark-text"
                        >
                          {option.label}
                        </label>
                        {option.requiresUsername &&
                          Object.keys(watch("fiat_options") || {}).includes(
                            option.key
                          ) && (
                            <Input
                              size="sm"
                              placeholder={`Enter your ${option.label} username/tag`}
                              value={watch("fiat_options")?.[option.key] || ""}
                              onChange={(e) => {
                                const currentOptions =
                                  watch("fiat_options") || {};
                                setValue("fiat_options", {
                                  ...currentOptions,
                                  [option.key]: e.target.value,
                                });
                              }}
                              className="flex-1 text-light-text dark:text-dark-text"
                              variant="bordered"
                            />
                          )}
                      </div>
                    ))}
                  </div>
                </div>

                <Controller
                  name="shopstr_donation"
                  control={control}
                  render={({ field: { onChange, onBlur, value } }) => (
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step={0.1}
                      className="pb-4 text-light-text dark:text-dark-text"
                      classNames={{
                        label: "text-light-text dark:text-dark-text text-lg",
                      }}
                      variant="bordered"
                      fullWidth
                      label="Shopstr donation (%)"
                      labelPlacement="outside"
                      onChange={onChange}
                      onBlur={onBlur}
                      value={value.toString()}
                    />
                  )}
                />

                <Button
                  className={`mb-10 w-full ${SHOPSTRBUTTONCLASSNAMES}`}
                  type="submit"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
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
    </>
  );
};

export default UserProfilePage;
