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
  Card,
  Tooltip,
} from "@nextui-org/react";
import {
  ArrowUpOnSquareIcon,
  CheckIcon,
  ClipboardIcon,
  EyeSlashIcon,
  EyeIcon,
} from "@heroicons/react/24/outline";
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
    await createNostrProfileEvent(
      nostr!,
      signer!,
      userPubkey!,
      JSON.stringify(data)
    );
    profileContext.updateProfileData({
      pubkey: userPubkey!,
      content: data,
      created_at: 0,
    });
    setIsUploadingProfile(false);
  };

  const isButtonDisabled = useMemo(() => {
    return !!(signer && userPubkey);
  }, [signer, userPubkey]);

  const buttonClassName = useMemo(() => {
    const disabledStyle = "from-gray-300 to-gray-400 cursor-not-allowed";
    const enabledStyle = SHOPSTRBUTTONCLASSNAMES;
    const className = isButtonDisabled ? disabledStyle : enabledStyle;
    return `w-full mb-10 ${className}`;
  }, [isButtonDisabled]);

  return (
    <>
      <div className="flex min-h-screen flex-col bg-light-bg pt-24 dark:bg-dark-bg md:pb-20">
        <div className="mx-auto h-full w-full px-4 lg:w-1/2">
          <SettingsBreadCrumbs />
          {isFetchingProfile ? (
            <ShopstrSpinner />
          ) : (
            <Card className="overflow-hidden bg-light-fg dark:bg-dark-fg w-full p-0">
              {/* Banner and Profile Icon */}
              <div className="relative h-48 w-full">
                {watchBanner ? (
                  <Image
                    alt="User banner image"
                    src={watchBanner}
                    className="h-48 w-full object-cover object-center"
                  />
                ) : (
                  <div className="h-48 w-full bg-gradient-to-r from-gray-400/50 to-gray-500/50 dark:from-gray-700/50 dark:to-gray-800/50" />
                )}
                <Tooltip content="Upload a banner image for your profile" placement="bottom">
                  <FileUploaderButton
                    isIconOnly={false}
                    className={`absolute bottom-5 right-5 z-20 ${SHOPSTRBUTTONCLASSNAMES}`}
                    imgCallbackOnUpload={(imgUrl) => setValue("banner", imgUrl)}
                  >
                    Upload Banner
                  </FileUploaderButton>
                </Tooltip>
                {/* Profile Icon */}
                <div className="absolute left-1/2 bottom-[-3rem] z-30 -translate-x-1/2">
                  <div className="relative h-24 w-24 rounded-full border-4 border-light-fg dark:border-dark-fg shadow-lg">
                    <Tooltip content="Upload a profile picture" placement="bottom">
                      <FileUploaderButton
                        isIconOnly
                        className={`absolute bottom-[-0.5rem] right-[-0.5rem] z-20 ${SHOPSTRBUTTONCLASSNAMES}`}
                        imgCallbackOnUpload={(imgUrl) => setValue("picture", imgUrl)}
                      >
                        <ArrowUpOnSquareIcon className="h-6 w-6" />
                      </FileUploaderButton>
                    </Tooltip>
                    <Image
                      src={watchPicture || defaultImage}
                      alt="user profile picture"
                      className="rounded-full h-24 w-24 object-cover"
                    />
                  </div>
                </div>
              </div>
              {/* NPUB/NSec and Form */}
              <div className="pt-16 px-6 pb-6">
                <Card className="mb-2 overflow-hidden bg-light-fg dark:bg-dark-fg">
                  <div
                    className="mx-auto flex w-full max-w-2xl cursor-pointer flex-row items-center justify-center p-2 hover:opacity-60"
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
                </Card>

                {userNSec ? (
                  <Card className="mb-12 overflow-hidden bg-light-fg dark:bg-dark-fg">
                    <div className="mx-auto flex w-full max-w-2xl cursor-pointer flex-row items-center justify-center p-2">
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
                  </Card>
                ) : (
                  <div className="mb-12" />
                )}

                <form onSubmit={handleSubmit(onSubmit as any)} className="space-y-6">
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
                        <div className="shopstr-card">
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
                            onChange={onChange}
                            onBlur={onBlur}
                            value={value}
                          />
                        </div>
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
                        <div className="shopstr-card">
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
                            onChange={onChange}
                            onBlur={onBlur}
                            value={value}
                          />
                        </div>
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
                        <div className="shopstr-card">
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
                            onChange={onChange}
                            onBlur={onBlur}
                            value={value}
                          />
                        </div>
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
                        <div className="shopstr-card">
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
                            onChange={onChange}
                            onBlur={onBlur}
                            value={value}
                          />
                        </div>
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
                        <div className="shopstr-card">
                          <Input
                            className="pb-4 text-light-text dark:text-dark-text"
                            classNames={{
                              label: "text-light-text dark:text-dark-text text-lg",
                            }}
                            variant="bordered"
                            fullWidth={true}
                            label="Nostr Address"
                            labelPlacement="outside"
                            isInvalid={isErrored}
                            errorMessage={errorMessage}
                            placeholder="Add your Nostr address . . ."
                            onChange={onChange}
                            onBlur={onBlur}
                            value={value}
                          />
                        </div>
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
                        <div className="shopstr-card">
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
                            onChange={onChange}
                            onBlur={onBlur}
                            value={value}
                          />
                        </div>
                      );
                    }}
                  />
                  <Controller
                    name="payment_preference"
                    control={control}
                    render={({ field: { onChange, onBlur, value } }) => {
                      return (
                        <div className="shopstr-card">
                          <Select
                            className="pb-4 text-light-text dark:text-dark-text"
                            classNames={{
                              label: "text-light-text dark:text-dark-text text-lg",
                            }}
                            variant="bordered"
                            fullWidth={true}
                            label="Payment preference"
                            labelPlacement="outside"
                            selectedKeys={value ? [value] : []}
                            onChange={(e) => onChange(e.target.value)}
                            onBlur={onBlur}
                          >
                            {/* <SelectItem
                              key="service"
                              value="service"
                              className="text-light-text dark:text-dark-text"
                            >
                              Service
                            </SelectItem> */}
                            <SelectItem
                              key="ecash"
                              value="ecash"
                              className="text-light-text dark:text-dark-text"
                            >
                              Cashu
                            </SelectItem>
                            <SelectItem
                              key="lightning"
                              value="lightning"
                              className="text-light-text dark:text-dark-text"
                            >
                              Lightning
                            </SelectItem>
                          </Select>
                        </div>
                      );
                    }}
                  />

                  <Controller
                    name="shopstr_donation"
                    control={control}
                    render={({ field: { onChange, onBlur, value } }) => {
                      return (
                        <div className="shopstr-card">
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
                        </div>
                      );
                    }}
                  />

                  <Button
                    className={buttonClassName + " !bg-[#EADE81] !text-black hover:opacity-90"}
                    type="submit"
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
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  );
};

export default UserProfilePage;
