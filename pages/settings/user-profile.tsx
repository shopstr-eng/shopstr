import { useEffect, useState, useContext, useMemo } from "react";
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
} from "@heroui/react";
import {
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
import {
  createNostrProfileEvent,
  getLocalUserProfileKey,
  parseLocalProfileFallback,
  isProfileContentPopulated,
} from "@/utils/nostr/nostr-helper-functions";
import { FileUploaderButton } from "@/components/utility-components/file-uploader";
import ShopstrSpinner from "@/components/utility-components/shopstr-spinner";
import ProtectedRoute from "@/components/utility-components/protected-route";

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
  const profileImageSrc = watchPicture || defaultImage;

  useEffect(() => {
    if (!userPubkey) return;
    setIsFetchingProfile(true);

    const localFallback = parseLocalProfileFallback(
      localStorage.getItem(getLocalUserProfileKey(userPubkey))
    );

    const profileMap = profileContext.profileData;
    const profile = profileMap.has(userPubkey)
      ? profileMap.get(userPubkey)
      : undefined;

    if (profile) {
      const profileCreatedAt = profile.created_at || 0;
      const shouldUseLocalFallback =
        !!localFallback &&
        localFallback.updatedAt > profileCreatedAt &&
        isProfileContentPopulated(localFallback.content);

      if (shouldUseLocalFallback) {
        reset(localFallback.content);
      } else {
        reset(profile.content);
      }

      try {
        localStorage.setItem(
          getLocalUserProfileKey(userPubkey),
          JSON.stringify({
            content: shouldUseLocalFallback
              ? localFallback!.content
              : profile.content,
            updatedAt: shouldUseLocalFallback
              ? localFallback!.updatedAt
              : profileCreatedAt,
          })
        );
      } catch (error) {
        console.error("Failed to persist profile fallback locally:", error);
      }
    } else {
      try {
        if (localFallback?.content) {
          reset(localFallback.content);
        }
      } catch (error) {
        console.error("Failed to read local profile fallback:", error);
      }
    }
    setIsFetchingProfile(false);
  }, [profileContext, userPubkey, reset]);

  const onSubmit = async (data: { [x: string]: string }) => {
    if (!userPubkey) {
      console.error("Cannot save profile: pubkey is undefined");
      return;
    }

    setIsUploadingProfile(true);
    try {
      const profileMap = profileContext.profileData;
      const existingProfile = profileMap.has(userPubkey)
        ? profileMap.get(userPubkey)?.content
        : {};

      const updatedData = {
        ...existingProfile,
        ...data,
      };

      try {
        localStorage.setItem(
          getLocalUserProfileKey(userPubkey),
          JSON.stringify({
            content: updatedData,
            updatedAt: Math.floor(Date.now() / 1000),
          })
        );
      } catch (error) {
        console.error("Failed to save local profile fallback:", error);
      }

      await createNostrProfileEvent(
        nostr!,
        signer!,
        JSON.stringify(updatedData)
      );
      profileContext.updateProfileData({
        pubkey: userPubkey,
        content: updatedData,
        created_at: Math.floor(Date.now() / 1000),
      });
    } catch (error) {
      console.error("Failed to save user profile:", error);
    } finally {
      setIsUploadingProfile(false);
    }
  };

  return (
    <ProtectedRoute>
      <div className="bg-light-bg dark:bg-dark-bg flex min-h-screen flex-col pt-24 md:pb-20">
        <div className="mx-auto h-full w-full px-4 lg:w-1/2">
          <SettingsBreadCrumbs />
          {isFetchingProfile ? (
            <ShopstrSpinner />
          ) : (
            <>
              <div className="bg-light-fg dark:bg-dark-fg mb-20 h-40 rounded-lg">
                <div className="bg-shopstr-purple-light dark:bg-dark-fg relative flex h-40 items-center justify-center rounded-lg">
                  {watchBanner && (
                    <Image
                      alt={"User banner image"}
                      src={watchBanner}
                      className="h-40 w-full rounded-lg object-cover object-fill"
                    />
                  )}
                  <FileUploaderButton
                    className={`bg-shopstr-purple absolute right-5 bottom-5 z-20 border-2 border-white shadow-md ${SHOPSTRBUTTONCLASSNAMES}`}
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
                        className={`absolute right-[-0.5rem] bottom-[-0.5rem] z-20 ${SHOPSTRBUTTONCLASSNAMES}`}
                        imgCallbackOnUpload={(imgUrl) =>
                          setValue("picture", imgUrl)
                        }
                      />
                      <Image
                        key={profileImageSrc}
                        src={profileImageSrc}
                        alt="user profile picture"
                        radius="full"
                        className="h-24 w-24 object-cover"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div
                className="border-light-fg dark:border-dark-fg mx-auto mb-2 flex w-full max-w-2xl cursor-pointer flex-row items-center justify-center rounded-lg border-2 p-2 hover:opacity-60"
                onClick={() => {
                  navigator.clipboard.writeText(userNPub!);
                  setIsNPubCopied(true);
                  setTimeout(() => {
                    setIsNPubCopied(false);
                  }, 2100);
                }}
              >
                <span
                  className="lg:text-md text-light-text dark:text-dark-text pr-2 text-[0.50rem] font-bold break-all sm:text-xs md:text-sm"
                  suppressHydrationWarning
                >
                  {userNPub!}
                </span>
                {isNPubCopied ? (
                  <CheckIcon
                    width={15}
                    height={15}
                    className="text-light-text dark:text-dark-text flex-shrink-0"
                  />
                ) : (
                  <ClipboardIcon
                    width={15}
                    height={15}
                    className="text-light-text dark:text-dark-text flex-shrink-0 hover:text-purple-700 dark:hover:text-yellow-700"
                  />
                )}
              </div>

              {userNSec ? (
                <div className="border-light-fg dark:border-dark-fg mx-auto mb-12 flex w-full max-w-2xl cursor-pointer flex-row items-center justify-center rounded-lg border-2 p-2">
                  <span
                    className="lg:text-md text-light-text dark:text-dark-text pr-2 text-[0.50rem] font-bold break-all sm:text-xs md:text-sm"
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
                      className="text-light-text dark:text-dark-text flex-shrink-0"
                    />
                  ) : (
                    <ClipboardIcon
                      width={15}
                      height={15}
                      className="text-light-text dark:text-dark-text flex-shrink-0 hover:text-purple-700 dark:hover:text-yellow-700"
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
                      className="text-light-text dark:text-dark-text h-6 w-6 flex-shrink-0 px-1 hover:text-purple-700 dark:hover:text-yellow-700"
                      onClick={() => {
                        setViewState("hidden");
                      }}
                    />
                  ) : (
                    <EyeIcon
                      className="text-light-text dark:text-dark-text h-6 w-6 flex-shrink-0 px-1 hover:text-purple-700 dark:hover:text-yellow-700"
                      onClick={async () => {
                        // Only decrypt nsec when user explicitly asks to see it.
                        if (!userNSec && signer instanceof NostrNSecSigner) {
                          try {
                            const nsec = await (
                              signer as NostrNSecSigner
                            )._getNSec();
                            setUserNSec(nsec);
                          } catch (err) {
                            console.error(err);
                          }
                        }
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
                        className="text-light-text dark:text-dark-text pb-4"
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
                        className="text-light-text dark:text-dark-text pb-4"
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
                        className="text-light-text dark:text-dark-text pb-4"
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
                        className="text-light-text dark:text-dark-text pb-4"
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
                        className="text-light-text dark:text-dark-text pb-4"
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
                        className="text-light-text dark:text-dark-text pb-4"
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
                      className="text-light-text dark:text-dark-text pb-4"
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
                        className="text-light-text dark:text-dark-text"
                      >
                        Cashu (Bitcoin)
                      </SelectItem>
                      <SelectItem
                        key="lightning"
                        className="text-light-text dark:text-dark-text"
                      >
                        Lightning (Bitcoin)
                      </SelectItem>
                    </Select>
                  )}
                />

                <Controller
                  name="shopstr_donation"
                  control={control}
                  render={({ field: { onChange, onBlur, value } }) => (
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step={0.1}
                      className="text-light-text dark:text-dark-text pb-4"
                      classNames={{
                        label: "text-light-text dark:text-dark-text text-lg",
                      }}
                      variant="bordered"
                      fullWidth
                      label="Shopstr donation (%)"
                      labelPlacement="outside"
                      onChange={onChange}
                      onBlur={onBlur}
                      value={value?.toString() || ""}
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
    </ProtectedRoute>
  );
};

export default UserProfilePage;
