import { nip19 } from "nostr-tools";
import { useEffect, useState, useContext, useMemo } from "react";
import { SettingsBreadCrumbs } from "@/components/settings/settings-bread-crumbs";
import { CashuWalletContext, ProfileMapContext } from "@/utils/context/context";
import { useForm, Controller, SubmitHandler } from "react-hook-form";
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
import { FiatOptionsType } from "@/utils/types/types";
import {
  SignerContext,
  NostrContext,
} from "@/components/utility-components/nostr-context-provider";
import { NostrNSecSigner } from "@/utils/nostr/signers/nostr-nsec-signer";
import { createNostrProfileEvent } from "@/utils/nostr/nostr-helper-functions";
import { FileUploaderButton } from "@/components/utility-components/file-uploader";
import ShopstrSpinner from "@/components/utility-components/shopstr-spinner";
import { NEO_BTN } from "@/utils/STATIC-VARIABLES";
import ProtectedRoute from "@/components/utility-components/protected-route";
import {
  normalizeCashuPubkey,
  isP2pkEscrowFeatureEnabled,
} from "@/utils/cashu/p2pk-checkout";

function decodeNpubOrHexPubkey(value: string): string {
  const cashuPubkey = normalizeCashuPubkey(value);
  if (cashuPubkey) return cashuPubkey;

  const decoded = nip19.decode(value);
  if (decoded.type !== "npub") {
    throw new Error("Must be npub");
  }
  const decodedCashuPubkey = normalizeCashuPubkey(decoded.data as string);
  if (!decodedCashuPubkey) {
    throw new Error("Must be Cashu-compatible pubkey");
  }
  return decodedCashuPubkey;
}

function profileContentToFormValues(content: Record<string, any>) {
  const p2pk = content.p2pk as
    | {
        enabled?: boolean;
        pubkey?: string;
        refundDelayDays?: number;
        locktime?: number;
        reclaimKeys?: string[];
      }
    | undefined;

  return {
    ...content,
    p2pkEnabled: p2pk?.enabled ?? content.p2pkEnabled ?? false,
    p2pkPubkey: p2pk?.pubkey ?? content.p2pkPubkey ?? "",
    refundDelayDays: String(
      p2pk?.refundDelayDays ??
        p2pk?.locktime ??
        content.refundDelayDays ??
        content.lockTime ??
        ""
    ),
    reclaimPubKeys: Array.isArray(p2pk?.reclaimKeys)
      ? p2pk.reclaimKeys.join(", ")
      : (content.reclaimPubKeys ?? ""),
  };
}

interface UserProfileFormData {
  banner: string;
  picture: string;
  display_name: string;
  name: string;
  nip05: string;
  about: string;
  website: string;
  lud16: string;
  payment_preference: string;
  fiat_options: FiatOptionsType;
  shopstr_donation: number;
  p2pkEnabled: boolean;
  p2pkPubkey: string;
  refundDelayDays: string;
  reclaimPubKeys: string;
}

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
  const { cashuPubkey } = useContext(CashuWalletContext);
  const { handleSubmit, control, reset, watch, setValue, setError } =
    useForm<UserProfileFormData>({
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
        p2pkEnabled: false,
        p2pkPubkey: "",
        refundDelayDays: "",
        reclaimPubKeys: "",
      },
    });

  const watchBanner = watch("banner");
  const watchPicture = watch("picture");
  const watchP2pkEnabled = watch("p2pkEnabled");
  const watchP2pkPubkey = watch("p2pkPubkey");
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
      reset(profileContentToFormValues(profile.content));
    }
    setIsFetchingProfile(false);
  }, [profileContext, userPubkey, reset]);

  useEffect(() => {
    if (watchP2pkEnabled && cashuPubkey && !watchP2pkPubkey) {
      setValue("p2pkPubkey", cashuPubkey);
    }
  }, [watchP2pkEnabled, cashuPubkey, watchP2pkPubkey, setValue]);

  const onSubmit: SubmitHandler<UserProfileFormData> = async (data) => {
    if (!userPubkey) throw new Error("pubkey is undefined");
    setIsUploadingProfile(true);

    const updatedData: Record<string, any> = { ...data };
    const reclaimArr: string[] = [];
    const invalidReclaimKeys: string[] = [];

    for (const key of (data.reclaimPubKeys ?? "").split(",")) {
      const trimmed = key.trim();
      if (!trimmed) continue;
      try {
        reclaimArr.push(decodeNpubOrHexPubkey(trimmed));
      } catch {
        invalidReclaimKeys.push(trimmed);
      }
    }

    if (invalidReclaimKeys.length > 0) {
      setError("reclaimPubKeys", {
        message: `Invalid reclaim key(s): ${invalidReclaimKeys.join(", ")}`,
      });
      setIsUploadingProfile(false);
      return;
    }

    if (data.p2pkEnabled) {
      if (!data.p2pkPubkey) {
        setError("p2pkPubkey", {
          message:
            "Cashu wallet key not yet available. Key management is coming soon.",
        });
        setIsUploadingProfile(false);
        return;
      }

      let mainHex: string;
      try {
        mainHex = decodeNpubOrHexPubkey(data.p2pkPubkey);
      } catch {
        setError("p2pkPubkey", {
          message: "Must be a Cashu-compatible pubkey",
        });
        setIsUploadingProfile(false);
        return;
      }

      const refundDelayDays = parseInt(data.refundDelayDays, 10);
      if (!refundDelayDays || refundDelayDays <= 0) {
        setError("refundDelayDays", { message: "Required" });
        setIsUploadingProfile(false);
        return;
      }

      updatedData.p2pk = {
        enabled: true,
        pubkey: mainHex,
        refundDelayDays,
        ...(reclaimArr.length > 0 ? { reclaimKeys: reclaimArr } : {}),
      };
    } else {
      updatedData.p2pk = {
        enabled: false,
        ...(reclaimArr.length > 0 ? { reclaimKeys: reclaimArr } : {}),
      };
    }

    await createNostrProfileEvent(nostr!, signer!, JSON.stringify(updatedData));
    profileContext.updateProfileData({
      pubkey: userPubkey!,
      content: updatedData as any,
      created_at: 0,
    });
    setIsUploadingProfile(false);
  };

  return (
    <ProtectedRoute>
      <div className="relative flex min-h-screen flex-col bg-[#111] pt-24 selection:bg-yellow-400 selection:text-black md:pb-20">
        {/* Background Grid Pattern */}
        <div className="pointer-events-none absolute inset-0 z-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] bg-[size:24px_24px]"></div>

        <div className="relative z-10 mx-auto h-full w-full px-4 lg:w-1/2">
          <SettingsBreadCrumbs />
          {isFetchingProfile ? (
            <ShopstrSpinner />
          ) : (
            <>
              <div className="mb-20 h-40 overflow-visible rounded-2xl border border-zinc-800 bg-[#161616]">
                <div className="relative flex h-40 items-center justify-center rounded-2xl bg-[#111]">
                  {watchBanner && (
                    <Image
                      alt={"User banner image"}
                      src={watchBanner}
                      className="h-40 w-full rounded-2xl object-cover"
                    />
                  )}
                  <FileUploaderButton
                    className={`${NEO_BTN} absolute right-4 bottom-4 z-20 h-10 px-4 text-xs`}
                    imgCallbackOnUpload={(imgUrl) => setValue("banner", imgUrl)}
                  >
                    Upload Banner
                  </FileUploaderButton>
                </div>
                <div className="flex items-center justify-center">
                  <div className="relative z-50 mt-[-3rem] h-28 w-28">
                    <div className="rounded-full border-4 border-[#111]">
                      <FileUploaderButton
                        isIconOnly
                        className={`${NEO_BTN} absolute right-0 bottom-0 z-20 h-10 w-10 min-w-10 rounded-full border-white p-0`}
                        imgCallbackOnUpload={(imgUrl) =>
                          setValue("picture", imgUrl)
                        }
                      />
                      {watchPicture ? (
                        <Image
                          src={watchPicture}
                          alt="user profile picture"
                          className="h-24 w-24 rounded-full object-cover"
                        />
                      ) : (
                        <Image
                          src={defaultImage}
                          alt="user profile picture"
                          className="h-24 w-24 rounded-full object-cover"
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div
                className="max-2xl mx-auto mb-4 flex w-full cursor-pointer flex-row items-center justify-center rounded-xl border-2 border-zinc-800 bg-[#161616] p-3 transition-all hover:border-yellow-400"
                onClick={() => {
                  navigator.clipboard.writeText(userNPub!);
                  setIsNPubCopied(true);
                  setTimeout(() => {
                    setIsNPubCopied(false);
                  }, 2100);
                }}
              >
                <span
                  className="lg:text-md pr-3 font-mono text-[0.60rem] font-bold break-all text-zinc-400 sm:text-xs md:text-sm"
                  suppressHydrationWarning
                >
                  {userNPub!}
                </span>
                {isNPubCopied ? (
                  <CheckIcon
                    width={18}
                    height={18}
                    className="flex-shrink-0 text-green-500"
                  />
                ) : (
                  <ClipboardIcon
                    width={18}
                    height={18}
                    className="flex-shrink-0 text-zinc-500 hover:text-yellow-400"
                  />
                )}
              </div>

              {userNSec ? (
                <div className="mx-auto mb-12 flex w-full max-w-2xl cursor-pointer flex-row items-center justify-center rounded-xl border-2 border-zinc-800 bg-[#161616] p-3">
                  <span
                    className="lg:text-md pr-3 font-mono text-[0.60rem] font-bold break-all text-zinc-400 sm:text-xs md:text-sm"
                    suppressHydrationWarning
                  >
                    {viewState === "shown"
                      ? userNSec
                      : "***************************************************************"}
                  </span>
                  {isNSecCopied ? (
                    <CheckIcon
                      width={18}
                      height={18}
                      className="flex-shrink-0 text-green-500"
                    />
                  ) : (
                    <ClipboardIcon
                      width={18}
                      height={18}
                      className="flex-shrink-0 text-zinc-500 hover:text-yellow-400"
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
                      className="h-6 w-6 flex-shrink-0 px-2 text-zinc-500 hover:text-white"
                      onClick={() => {
                        setViewState("hidden");
                      }}
                    />
                  ) : (
                    <EyeIcon
                      className="h-6 w-6 flex-shrink-0 px-2 text-zinc-500 hover:text-white"
                      onClick={async () => {
                        if (!userNSec && signer instanceof NostrNSecSigner) {
                          try {
                            const nsec = await signer._getNSec();
                            setUserNSec(nsec);
                          } catch (err) {
                            console.error(err);
                            return;
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

              <form onSubmit={handleSubmit(onSubmit)}>
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
                        className="pb-6"
                        classNames={{
                          label:
                            "text-zinc-400 font-bold uppercase tracking-wider text-sm",
                          input: "text-white",
                          inputWrapper:
                            "border-zinc-700 bg-[#111] hover:border-zinc-500 group-data-[focus=true]:border-yellow-400 h-12",
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
                        className="pb-6"
                        classNames={{
                          label:
                            "text-zinc-400 font-bold uppercase tracking-wider text-sm",
                          input: "text-white",
                          inputWrapper:
                            "border-zinc-700 bg-[#111] hover:border-zinc-500 group-data-[focus=true]:border-yellow-400 h-12",
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
                        className="pb-6"
                        classNames={{
                          label:
                            "text-zinc-400 font-bold uppercase tracking-wider text-sm",
                          input: "text-white",
                          inputWrapper:
                            "border-zinc-700 bg-[#111] hover:border-zinc-500 group-data-[focus=true]:border-yellow-400",
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
                        className="pb-6"
                        classNames={{
                          label:
                            "text-zinc-400 font-bold uppercase tracking-wider text-sm",
                          input: "text-white",
                          inputWrapper:
                            "border-zinc-700 bg-[#111] hover:border-zinc-500 group-data-[focus=true]:border-yellow-400 h-12",
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
                        className="pb-6"
                        classNames={{
                          label:
                            "text-zinc-400 font-bold uppercase tracking-wider text-sm",
                          input: "text-white",
                          inputWrapper:
                            "border-zinc-700 bg-[#111] hover:border-zinc-500 group-data-[focus=true]:border-yellow-400 h-12",
                        }}
                        variant="bordered"
                        fullWidth={true}
                        label="Nostr address"
                        labelPlacement="outside"
                        isInvalid={isErrored}
                        errorMessage={errorMessage}
                        placeholder="Add your NIP-05 address . . ."
                        onChange={onChange}
                        onBlur={onBlur}
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
                        className="pb-6"
                        classNames={{
                          label:
                            "text-zinc-400 font-bold uppercase tracking-wider text-sm",
                          input: "text-white",
                          inputWrapper:
                            "border-zinc-700 bg-[#111] hover:border-zinc-500 group-data-[focus=true]:border-yellow-400 h-12",
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
                    );
                  }}
                />
                <Controller
                  name="payment_preference"
                  control={control}
                  render={({ field: { onChange, onBlur, value } }) => (
                    <Select
                      className="pb-8"
                      classNames={{
                        label:
                          "text-zinc-400 font-bold uppercase tracking-wider text-sm",
                        trigger:
                          "border-zinc-700 bg-[#111] hover:border-zinc-500 data-[focus=true]:border-yellow-400 h-12",
                        value: "text-white",
                      }}
                      variant="bordered"
                      fullWidth={true}
                      label="Bitcoin payment preference"
                      labelPlacement="outside"
                      selectedKeys={value ? [value] : []}
                      onChange={(e) => onChange(e.target.value)}
                      onBlur={onBlur}
                    >
                      <SelectItem key="ecash" className="text-zinc-800">
                        Cashu (Bitcoin)
                      </SelectItem>
                      <SelectItem key="lightning" className="text-zinc-800">
                        Lightning (Bitcoin)
                      </SelectItem>
                      <SelectItem key="fiat" className="text-zinc-800">
                        Local Currency (Fiat)
                      </SelectItem>
                    </Select>
                  )}
                />

                <div className="pb-8">
                  <label className="mb-4 block text-sm font-bold tracking-wider text-zinc-400 uppercase">
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
                        className="flex items-center space-x-4 rounded-xl border border-zinc-800 bg-[#1a1a1a] p-3"
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
                          className="h-5 w-5 rounded border-zinc-700 bg-zinc-900 text-yellow-400 focus:ring-yellow-400"
                        />
                        <label
                          htmlFor={option.key}
                          className="font-bold text-white"
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
                              classNames={{
                                input: "text-white text-xs",
                                inputWrapper: "border-zinc-700 bg-[#111] h-8",
                              }}
                              className="flex-1"
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
                      className="pb-10"
                      classNames={{
                        label:
                          "text-zinc-400 font-bold uppercase tracking-wider text-sm",
                        input: "text-white font-mono",
                        inputWrapper:
                          "border-zinc-700 bg-[#111] hover:border-zinc-500 group-data-[focus=true]:border-yellow-400 h-12",
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

                {isP2pkEscrowFeatureEnabled() && (
                  <>
                    <p className="mb-2 text-lg font-black tracking-tight text-white uppercase">
                      P2PK escrow (for your shop)
                    </p>
                    <p className="mb-4 text-sm text-zinc-500">
                      When enabled, Cashu payments to you are locked to your
                      redeem pubkey for a delay period. Buyers can configure
                      their own reclaim keys separately below.
                    </p>
                    <Controller
                      name="p2pkEnabled"
                      control={control}
                      render={({ field: { onChange, value } }) => (
                        <div className="pb-4">
                          <label className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-[#1a1a1a] p-3 font-bold text-white">
                            <input
                              type="checkbox"
                              checked={!!value}
                              onChange={(e) => onChange(e.target.checked)}
                              className="h-5 w-5 rounded border-zinc-700 bg-zinc-900 text-yellow-400 focus:ring-yellow-400"
                            />
                            Enable P2PK escrow on my listings
                          </label>
                        </div>
                      )}
                    />

                    {watchP2pkEnabled && (
                      <>
                        <Controller
                          name="p2pkPubkey"
                          control={control}
                          render={({
                            field: { onChange, onBlur, value },
                            fieldState: { error },
                          }) => (
                            <div>
                              <Input
                                className="pb-2"
                                classNames={{
                                  label:
                                    "text-zinc-400 font-bold uppercase tracking-wider text-sm",
                                  input: "text-white font-mono",
                                  inputWrapper:
                                    "border-zinc-700 bg-[#111] hover:border-zinc-500 group-data-[focus=true]:border-yellow-400 h-12",
                                }}
                                variant="bordered"
                                fullWidth
                                label="P2PK Redeem Pubkey (Cashu wallet key)"
                                labelPlacement="outside"
                                placeholder="Will be auto-filled from your Cashu wallet key"
                                isInvalid={!!error}
                                errorMessage={error?.message}
                                onChange={onChange}
                                onBlur={onBlur}
                                value={value}
                              />
                              <p className="mb-4 text-xs text-zinc-500">
                                Auto-filled from your Cashu wallet when
                                available. This key is separate from your Nostr
                                identity.
                              </p>
                            </div>
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
                              className="py-6"
                              classNames={{
                                label:
                                  "text-zinc-400 font-bold uppercase tracking-wider text-sm",
                                input: "text-white font-mono",
                                inputWrapper:
                                  "border-zinc-700 bg-[#111] hover:border-zinc-500 group-data-[focus=true]:border-yellow-400 h-12",
                              }}
                              variant="bordered"
                              fullWidth
                              label="Reclaim opens after (days)"
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
                      </>
                    )}
                  </>
                )}

                <p className="mt-6 mb-2 text-lg font-black tracking-tight text-white uppercase">
                  Escrow reclaim keys (when you buy)
                </p>
                <p className="mb-4 text-sm text-zinc-500">
                  Optional. Embedded into P2PK payments you make so you can
                  manually reclaim after the seller&apos;s delay. Your current
                  Cashu wallet pubkey is always included at checkout.
                </p>
                <Controller
                  name="reclaimPubKeys"
                  control={control}
                  rules={{
                    validate: (value: string) => {
                      const keys = value
                        .split(",")
                        .map((key) => key.trim())
                        .filter(Boolean);
                      for (const key of keys) {
                        try {
                          decodeNpubOrHexPubkey(key);
                        } catch {
                          return `Invalid Cashu reclaim key: ${key}`;
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
                      className="pb-4"
                      classNames={{
                        label:
                          "text-zinc-400 font-bold uppercase tracking-wider text-sm",
                        input: "text-white font-mono",
                        inputWrapper:
                          "border-zinc-700 bg-[#111] hover:border-zinc-500 group-data-[focus=true]:border-yellow-400",
                      }}
                      variant="bordered"
                      fullWidth
                      label="Reclaim pubkeys (comma separated, optional)"
                      labelPlacement="outside"
                      placeholder="Leave empty to use your Cashu wallet pubkey when paying"
                      isInvalid={!!error}
                      errorMessage={error?.message}
                      onChange={onChange}
                      onBlur={onBlur}
                      value={value}
                    />
                  )}
                />

                <Button
                  className={`${NEO_BTN} mb-10 h-14 w-full text-sm font-black tracking-widest`}
                  type="submit"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleSubmit(onSubmit)();
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
