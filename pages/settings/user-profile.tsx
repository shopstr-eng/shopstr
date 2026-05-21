import { nip19 } from "nostr-tools";
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
import {
  AVATARBADGEBUTTONCLASSNAMES,
  SHOPSTRBUTTONCLASSNAMES,
} from "@/utils/STATIC-VARIABLES";
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

function decodeNpubOrHexPubkey(value: string): string {
  if (/^[0-9A-Fa-f]{64}$/.test(value)) return value;
  const decoded = nip19.decode(value);
  if (decoded.type !== "npub") {
    throw new Error("Must be npub");
  }
  return decoded.data as string;
}

function profileContentToFormValues(content: Record<string, unknown>) {
  const p2pk = content.p2pk as
    | {
        enabled?: boolean;
        pubkey?: string;
        refundDelayDays?: number;
        locktime?: number;
        refund?: string[];
      }
    | undefined;

  return {
    ...content,
    p2pkEnabled: p2pk?.enabled ?? (content.p2pkEnabled as boolean) ?? false,
    p2pkPubkey: p2pk?.pubkey ?? (content.p2pkPubkey as string) ?? "",
    refundDelayDays: String(
      p2pk?.refundDelayDays ??
        p2pk?.locktime ??
        content.refundDelayDays ??
        content.lockTime ??
        ""
    ),
    refundPubKeys: Array.isArray(p2pk?.refund)
      ? p2pk.refund.join(", ")
      : ((content.refundPubKeys as string) ?? ""),
  };
}

const UserProfilePage = () => {
  const { nostr } = useContext(NostrContext);
  const [isUploadingProfile, setIsUploadingProfile] = useState(false);
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
  const { handleSubmit, control, reset, watch, setValue, setError } = useForm({
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
      p2pkEnabled: false,
      p2pkPubkey: "",
      refundDelayDays: "",
      refundPubKeys: "",
    },
  });

  const watchBanner = watch("banner");
  const watchPicture = watch("picture");
  const watchP2pkEnabled = watch("p2pkEnabled");

  const hasCurrentUserProfile =
    !!userPubkey && profileContext.profileData.has(userPubkey);
  const isFetchingProfile =
    !userPubkey || (profileContext.isLoading && !hasCurrentUserProfile);
  const defaultImage = useMemo(() => {
    return "https://robohash.org/" + userPubkey;
  }, [userPubkey]);

  const profileImageSrc = watchPicture || defaultImage;

  useEffect(() => {
    if (!userPubkey || profileContext.isLoading) return;

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
        reset(profileContentToFormValues(localFallback.content));
      } else {
        reset(profileContentToFormValues(profile.content));
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
          reset(profileContentToFormValues(localFallback.content));
        }
      } catch (error) {
        console.error("Failed to read local profile fallback:", error);
      }
    }
  }, [userPubkey, profileContext.isLoading, profileContext.profileData, reset]);

  const onSubmit = async (data: {
    [x: string]: any;
    p2pkEnabled?: boolean;
    p2pkPubkey?: string;
    refundDelayDays?: string;
    refundPubKeys?: string;
  }) => {
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

      if (data?.p2pkEnabled) {
        let mainHex: string;
        try {
          mainHex = decodeNpubOrHexPubkey(data?.p2pkPubkey as string);
        } catch {
          setError("p2pkPubkey", { message: "Must be valid hex or npub" });
          setIsUploadingProfile(false);
          return;
        }

        const refundArr: string[] = [];
        const invalidRefundKeys: string[] = [];
        for (const s of (data?.refundPubKeys ?? "").split(",")) {
          const trimmed = s.trim();
          if (!trimmed) continue;
          try {
            refundArr.push(decodeNpubOrHexPubkey(trimmed));
          } catch {
            invalidRefundKeys.push(trimmed);
          }
        }
        if (invalidRefundKeys.length > 0) {
          setError("refundPubKeys", {
            message: `Invalid refund key(s): ${invalidRefundKeys.join(", ")}`,
          });
          setIsUploadingProfile(false);
          return;
        }
        if (refundArr.length === 0) {
          setError("refundPubKeys", {
            message: "At least one refund pubkey is required",
          });
          setIsUploadingProfile(false);
          return;
        }

        const refundDelayDays = parseInt(data?.refundDelayDays as string);

        updatedData.p2pk = {
          enabled: true,
          pubkey: mainHex,
          refundDelayDays,
          refund: refundArr,
        };
      } else {
        updatedData.p2pk = { enabled: false };
      }

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

      if (!nostr || !signer) {
        console.error("Cannot save profile: nostr or signer is unavailable");
        return;
      }

      const signedProfileEvent = await createNostrProfileEvent(
        nostr,
        signer,
        JSON.stringify(updatedData)
      );
      profileContext.updateProfileData({
        pubkey: userPubkey,
        content: updatedData,
        created_at: signedProfileEvent.created_at,
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
                  <div className="relative z-20 mt-[-3rem] h-24 w-24 overflow-visible">
                    <FileUploaderButton
                      isIconOnly
                      className={AVATARBADGEBUTTONCLASSNAMES}
                      containerClassName="absolute right-[-0.5rem] bottom-[-0.5rem] z-20"
                      imgCallbackOnUpload={(imgUrl) =>
                        setValue("picture", imgUrl)
                      }
                    />
                    <Image
                      key={profileImageSrc}
                      src={profileImageSrc}
                      alt="user profile picture"
                      radius="full"
                      className="h-24 w-24 rounded-full object-cover"
                    />
                  </div>
                </div>
              </div>

              <div
                className="border-light-fg dark:border-dark-fg mx-auto mb-2 flex w-full max-w-2xl cursor-pointer flex-row items-center justify-center rounded-lg border-2 p-2 hover:opacity-60"
                onClick={() => {
                  if (userNPub) navigator.clipboard.writeText(userNPub);
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
                  {userNPub}
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

                {/* P2PK Toggle */}
                <Controller
                  name="p2pkEnabled"
                  control={control}
                  render={({ field: { onChange, value } }) => (
                    <div className="pb-4">
                      <label className="text-light-text dark:text-dark-text flex items-center gap-2 text-lg">
                        <input
                          type="checkbox"
                          checked={!!value}
                          onChange={(e) => onChange(e.target.checked)}
                        />
                        Enable Time-Locked P2PK Escrow
                      </label>
                    </div>
                  )}
                />

                {watchP2pkEnabled && (
                  <>
                    <Controller
                      name="p2pkPubkey"
                      control={control}
                      rules={{
                        required: "Required",
                        validate: (v: string) => {
                          try {
                            decodeNpubOrHexPubkey(v);
                            return true;
                          } catch {
                            return "Must be valid hex or npub";
                          }
                        },
                      }}
                      render={({
                        field: { onChange, onBlur, value },
                        fieldState: { error },
                      }) => (
                        <Input
                          className="text-light-text dark:text-dark-text pb-4"
                          classNames={{
                            label:
                              "text-light-text dark:text-dark-text text-lg",
                          }}
                          variant="bordered"
                          fullWidth
                          label="P2PK Redeem Pubkey (hex or npub)"
                          labelPlacement="outside"
                          placeholder="Your pubkey that will claim payments"
                          isInvalid={!!error}
                          errorMessage={error?.message}
                          onChange={onChange}
                          onBlur={onBlur}
                          value={value}
                        />
                      )}
                    />

                    <Controller
                      name="refundDelayDays"
                      control={control}
                      rules={{
                        required: "Required",
                        min: { value: 1, message: "Minimum 1 day" },
                        max: { value: 365, message: "Maximum 365 days" },
                      }}
                      render={({
                        field: { onChange, onBlur, value },
                        fieldState: { error },
                      }) => (
                        <Input
                          type="number"
                          min={1}
                          max={365}
                          className="text-light-text dark:text-dark-text pb-4"
                          classNames={{
                            label:
                              "text-light-text dark:text-dark-text text-lg",
                          }}
                          variant="bordered"
                          fullWidth
                          label="Refund Delay (days)"
                          labelPlacement="outside"
                          placeholder="e.g. 7"
                          isInvalid={!!error}
                          errorMessage={error?.message}
                          onChange={onChange}
                          onBlur={onBlur}
                          value={value}
                        />
                      )}
                    />

                    <Controller
                      name="refundPubKeys"
                      control={control}
                      rules={{
                        required: "At least one refund pubkey is required",
                        validate: (v: string) => {
                          const keys = v
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean);
                          if (keys.length === 0) {
                            return "At least one refund pubkey is required";
                          }
                          for (const trimmed of keys) {
                            try {
                              decodeNpubOrHexPubkey(trimmed);
                            } catch {
                              try {
                                if (!/^[0-9A-Fa-f]{64}$/.test(trimmed)) {
                                  const decoded = nip19.decode(trimmed);
                                  if (decoded.type !== "npub") {
                                    return "Refund keys must be npub";
                                  }
                                }
                              } catch {
                                // fall through to generic message
                              }
                              return `Invalid refund key: ${trimmed}`;
                            }
                          }
                          return true;
                        },
                      }}
                      render={({
                        field: { onChange, onBlur, value },
                        fieldState: { error },
                      }) => (
                        <Textarea
                          className="text-light-text dark:text-dark-text pb-4"
                          classNames={{
                            label:
                              "text-light-text dark:text-dark-text text-lg",
                          }}
                          variant="bordered"
                          fullWidth
                          label="Refund Pubkeys (comma separated)"
                          labelPlacement="outside"
                          placeholder="Buyer pubkeys that can refund after the refund delay expires"
                          isInvalid={!!error}
                          errorMessage={error?.message}
                          onChange={onChange}
                          onBlur={onBlur}
                          value={value}
                        />
                      )}
                    />
                  </>
                )}

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
