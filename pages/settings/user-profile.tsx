import React, { useEffect, useState, useContext, useMemo } from "react";
import { SettingsBreadCrumbs } from "@/components/settings/settings-bread-crumbs";
import { ProfileMapContext } from "@/utils/context/context";
import { useForm, Controller } from "react-hook-form";
import {
  Button,
  Chip,
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
import { SHOPSTRBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";
import {
  SignerContext,
  NostrContext,
} from "@/components/utility-components/nostr-context-provider";
import { NostrNSecSigner } from "@/utils/nostr/signers/nostr-nsec-signer";
import { createNostrProfileEvent } from "@/utils/nostr/nostr-helper-functions";
import { FileUploaderButton } from "@/components/utility-components/file-uploader";
import ShopstrSpinner from "@/components/utility-components/shopstr-spinner";
import { nip19 } from "nostr-tools"; 

const UserProfilePage = () => {
  const { nostr } = useContext(NostrContext);
  const [isUploadingProfile, setIsUploadingProfile] = useState(false);
  const [isFetchingProfile, setIsFetchingProfile] = useState(false);

  const { signer, pubkey: userPubkey, npub: userNPub } = useContext(
    SignerContext
  );
  const [isNPubCopied, setIsNPubCopied] = useState(false);
  const [isNSecCopied, setIsNSecCopied] = useState(false);
  const [userNSec, setUserNSec] = useState("");
  const [viewState, setViewState] = useState<"shown" | "hidden">("hidden");

  const profileContext = useContext(ProfileMapContext);

  const {
    handleSubmit,
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
      nip05: "",
      about: "",
      website: "",
      lud16: "",
      payment_preference: "ecash",
      fiat_options: [] as string[],
      shopstr_donation: 2.1,
      p2pkEnabled: false,
      p2pkPubkey: "",
      locktime: "",
      refundPubkeys: "",
    },
  });

  const watchBanner = watch("banner");
  const watchPicture = watch("picture");
  const watchP2pkEnabled = watch("p2pkEnabled");

  const defaultImage = useMemo(() => {
    return "https://robohash.org/" + userPubkey;
  }, [userPubkey]);

  // Pre-fill form (including P2PK) from existing ProfileData.content
  useEffect(() => {
    if (!userPubkey) return;
    setIsFetchingProfile(true);

    const profileMap = profileContext.profileData;
    const profile = profileMap.get(userPubkey) || undefined;

    if (profile) {
      reset({
        banner: profile.content.banner  || "",
        picture: profile.content.picture || "",
        display_name: profile.content.display_name || "",
        name: profile.content.name || "",
        nip05: profile.content.nip05  || "",
        about: profile.content.about || "",
        website: profile.content.website || "",
        lud16: profile.content.lud16 || "",
        payment_preference:
          profile.content.payment_preference || "ecash",
        fiat_options: profile.content.fiat_options || [],
        shopstr_donation: profile.content.shopstr_donation || 2.1,
        p2pkEnabled: profile.content.p2pk?.enabled || false,
        p2pkPubkey: profile.content.p2pk?.pubkey || "",
        locktime: profile.content.p2pk?.locktime
          ? new Date(profile.content.p2pk.locktime * 1000)
            .toISOString()
            .slice(0, 16)
          : "",
        refundPubkeys: profile.content.p2pk?.refund?.join(", ") || "",

      });
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

  const onSubmit = async (data: {
    [key: string]: any;
    p2pkEnabled: boolean;
    p2pkPubkey: string;
    locktime: string;
    refundPubkeys: string;
  }) => {
    if (!userPubkey) throw new Error("pubkey is undefined");
    setIsUploadingProfile(true);

    const profileContent: any = {
      banner: data.banner  || "",
      picture: data.picture || "",
      display_name: data.display_name || "",
      name: data.name || "",
      nip05: data.nip05 || "",
      about: data.about || "",
      website: data.website || "",
      lud16: data.lud16 || "",
      payment_preference: data.payment_preference || "ecash",
      fiat_options: data.fiat_options || [],
      shopstr_donation: data.shopstr_donation || 2.1,
    };

    if (data.p2pkEnabled) {
      let mainHex: string;
      if (/^[0-9A-Fa-f]{64}$/.test(data.p2pkPubkey)) {
        mainHex = data.p2pkPubkey;
      } else {
        const { data: decoded } = nip19.decode(data.p2pkPubkey);
        mainHex = decoded as string;
      }

      const unixLock = Math.floor(new Date(data.locktime).getTime() / 1000);
      const refundArr: string[] = data.refundPubkeys
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean);

      profileContent.p2pk = {
        enabled: true,
        pubkey: mainHex,
        locktime: unixLock,
        refund: refundArr,
        tags: [],
      };
    }

    await createNostrProfileEvent(
      nostr!,
      signer!,
      userPubkey!,
      JSON.stringify(profileContent)
    );

    profileContext.updateProfileData({
      pubkey: userPubkey!,
      content: profileContent,
      created_at: Math.floor(Date.now() / 1000),
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
              {/* ─── Banner + Avatar ─── */}
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
                    <div>
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

              {/* ─── Copy NPUB ─── */}
              <div
                className="mx-auto mb-2 flex w-full max-w-2xl cursor-pointer flex-row items-center justify-center rounded-lg border-2 border-light-fg p-2 hover:opacity-60 dark:border-dark-fg"
                onClick={() => {
                  navigator.clipboard.writeText(userNPub!);
                  setIsNPubCopied(true);
                  setTimeout(() => setIsNPubCopied(false), 2100);
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

              {/* ─── Copy NSEC ─── */}
              {userNSec && (
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
                        setTimeout(() => setIsNSecCopied(false), 2100);
                      }}
                    />
                  )}
                  {viewState === "shown" ? (
                    <EyeSlashIcon
                      className="h-6 w-6 flex-shrink-0 px-1 text-light-text hover:text-purple-700 dark:text-dark-text dark:hover:text-yellow-700"
                      onClick={() => setViewState("hidden")}
                    />
                  ) : (
                    <EyeIcon
                      className="h-6 w-6 flex-shrink-0 px-1 text-light-text hover:text-purple-700 dark:text-dark-text dark:hover:text-yellow-700"
                      onClick={() => setViewState("shown")}
                    />
                  )}
                </div>
              )}

              <form onSubmit={handleSubmit(onSubmit as any)}>
                {/* ─── Display Name ─── */}
                <Controller
                  name="display_name"
                  control={control}
                  render={({
                    field: { onChange, onBlur, value },
                    fieldState: { error },
                  }) => {
                    const isErrored = !!error;
                    const errorMessage = error?.message ?? "";
                    return (
                      <Input
                        className="pb-4 text-light-text dark:text-dark-text"
                        classNames={{
                          label: "text-light-text dark:text-dark-text text-lg",
                        }}
                        variant="bordered"
                        fullWidth
                        label="Display name"
                        labelPlacement="outside"
                        isInvalid={isErrored}
                        errorMessage={errorMessage}
                        placeholder="Add your display name…"
                        onChange={onChange}
                        onBlur={onBlur}
                        value={value}
                      />
                    );
                  }}
                />

                {/* ─── Username ─── */}
                <Controller
                  name="name"
                  control={control}
                  render={({
                    field: { onChange, onBlur, value },
                    fieldState: { error },
                  }) => {
                    const isErrored = !!error;
                    const errorMessage = error?.message ?? "";
                    return (
                      <Input
                        className="pb-4 text-light-text dark:text-dark-text"
                        classNames={{
                          label: "text-light-text dark:text-dark-text text-lg",
                        }}
                        variant="bordered"
                        fullWidth
                        label="Username"
                        labelPlacement="outside"
                        isInvalid={isErrored}
                        errorMessage={errorMessage}
                        placeholder="Add your username…"
                        onChange={onChange}
                        onBlur={onBlur}
                        value={value}
                      />
                    );
                  }}
                />

                {/* ─── About ─── */}
                <Controller
                  name="about"
                  control={control}
                  render={({
                    field: { onChange, onBlur, value },
                    fieldState: { error },
                  }) => {
                    const isErrored = !!error;
                    const errorMessage = error?.message ?? "";
                    return (
                      <Textarea
                        className="pb-4 text-light-text dark:text-dark-text"
                        classNames={{
                          label: "text-light-text dark:text-dark-text text-lg",
                        }}
                        variant="bordered"
                        fullWidth
                        placeholder="Add something about yourself…"
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

                {/* ─── Website ─── */}
                <Controller
                  name="website"
                  control={control}
                  render={({
                    field: { onChange, onBlur, value },
                    fieldState: { error },
                  }) => {
                    const isErrored = !!error;
                    const errorMessage = error?.message ?? "";
                    return (
                      <Input
                        className="pb-4 text-light-text dark:text-dark-text"
                        classNames={{
                          label: "text-light-text dark:text-dark-text text-lg",
                        }}
                        variant="bordered"
                        fullWidth
                        label="Website"
                        labelPlacement="outside"
                        isInvalid={isErrored}
                        errorMessage={errorMessage}
                        placeholder="Add your website URL…"
                        onChange={onChange}
                        onBlur={onBlur}
                        value={value}
                      />
                    );
                  }}
                />

                {/* ─── NIP-05 ─── */}
                <Controller
                  name="nip05"
                  control={control}
                  render={({
                    field: { onChange, onBlur, value },
                    fieldState: { error },
                  }) => {
                    const isErrored = !!error;
                    const errorMessage = error?.message ?? "";
                    return (
                      <Input
                        className="pb-4 text-light-text dark:text-dark-text"
                        classNames={{
                          label: "text-light-text dark:text-dark-text text-lg",
                        }}
                        variant="bordered"
                        fullWidth
                        label="Nostr address"
                        labelPlacement="outside"
                        isInvalid={isErrored}
                        errorMessage={errorMessage}
                        placeholder="Add your NIP-05 address…"
                        onChange={onChange}
                        onBlur={onBlur}
                        value={value}
                      />
                    );
                  }}
                />

                {/* ─── Lightning Address ─── */}
                <Controller
                  name="lud16"
                  control={control}
                  render={({
                    field: { onChange, onBlur, value },
                    fieldState: { error },
                  }) => {
                    const isErrored = !!error;
                    const errorMessage = error?.message ?? "";
                    return (
                      <Input
                        className="pb-4 text-light-text dark:text-dark-text"
                        classNames={{
                          label: "text-light-text dark:text-dark-text text-lg",
                        }}
                        variant="bordered"
                        fullWidth
                        label="Lightning address"
                        labelPlacement="outside"
                        isInvalid={isErrored}
                        errorMessage={errorMessage}
                        placeholder="Add your Lightning address…"
                        onChange={onChange}
                        onBlur={onBlur}
                        value={value}
                      />
                    );
                  }}
                />

                {/* ─── Payment Preference ─── */}
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
                      fullWidth
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
                  )}
                />

                {/* ─── Fiat Options ─── */}
                <Controller
                  name="fiat_options"
                  control={control}
                  render={({ field: { onChange, onBlur, value } }) => {
                    const selectedOptions = Array.isArray(value)
                      ? value
                      : value
                      ? [value]
                      : [];
                    return (
                      <Select
                        className="pb-4 text-light-text dark:text-dark-text"
                        classNames={{
                          label: "text-light-text dark:text-dark-text text-lg",
                        }}
                        variant="bordered"
                        fullWidth
                        label="Alternative payment options"
                        labelPlacement="outside"
                        selectionMode="multiple"
                        selectedKeys={new Set(selectedOptions)}
                        onChange={(e) => {
                          const selectedValues = Array.from(
                            new Set(e.target.value.split(","))
                          );
                          onChange(selectedValues);
                        }}
                        onBlur={onBlur}
                        renderValue={(items) => (
                          <div className="flex flex-wrap gap-2">
                            {items.map((item) => (
                              <Chip key={item.key}>
                                {item.key ? (item.key as string) : "unknown"}
                              </Chip>
                            ))}
                          </div>
                        )}
                      >
                        <SelectItem
                          key="cash"
                          value="cash"
                          className="text-light-text dark:text-dark-text"
                        >
                          Cash
                        </SelectItem>
                        <SelectItem
                          key="venmo"
                          value="venmo"
                          className="text-light-text dark:text-dark-text"
                        >
                          Venmo
                        </SelectItem>
                        <SelectItem
                          key="zelle"
                          value="zelle"
                          className="text-light-text dark:text-dark-text"
                        >
                          Zelle
                        </SelectItem>
                        <SelectItem
                          key="cashapp"
                          value="cashapp"
                          className="text-light-text dark:text-dark-text"
                        >
                          Cash App
                        </SelectItem>
                        <SelectItem
                          key="applepay"
                          value="applepay"
                          className="text-light-text dark:text-dark-text"
                        >
                          Apple Pay
                        </SelectItem>
                        <SelectItem
                          key="googlepay"
                          value="googlepay"
                          className="text-light-text dark:text-dark-text"
                        >
                          Google Pay
                        </SelectItem>
                        <SelectItem
                          key="paypal"
                          value="paypal"
                          className="text-light-text dark:text-dark-text"
                        >
                          PayPal
                        </SelectItem>
                      </Select>
                    );
                  }}
                />

                {/* ─── Shopstr Donation ─── */}
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

                {/* ─── P2PK Enabled Checkbox ─── */}
                <Controller
                  name="p2pkEnabled"
                  control={control}
                  render={({ field: { onChange, value } }) => (
                    <div className="pb-4">
                      <label className="text-lg text-light-text dark:text-dark-text flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={value}
                          onChange={(e) => onChange(e.target.checked)}
                        />
                        Enable Time-Locked Payment (P2PK)
                      </label>
                    </div>
                  )}
                />

                {watchP2pkEnabled && (
                  <>
                    {/* ─── P2PK Redeem Pubkey ─── */}
                    <Controller
                      name="p2pkPubkey"
                      control={control}
                      rules={{
                        required: "Required",
                        validate: (v: string) => {
                          if (/^[0-9A-Fa-f]{64}$/.test(v)) return true;
                          if (v.startsWith("npub")) {
                            try {
                              const { data: d } = nip19.decode(v);
                              return /^[0-9A-Fa-f]{64}$/.test(d as string)
                                ? true
                                : "Decoded npub is not valid hex";
                            } catch {
                              return "Invalid npub";
                            }
                          }
                          return "Must be 64-char hex or npub…";
                        },
                      }}
                      render={({
                        field: { onChange, onBlur, value },
                        fieldState: { error },
                      }) => {
                        const isErrored = !!error;
                        const errorMessage = error?.message ?? "";
                        return (
                          <Input
                            className="pb-4 text-light-text dark:text-dark-text"
                            classNames={{
                              label: "text-light-text dark:text-dark-text text-lg",
                            }}
                            variant="bordered"
                            fullWidth
                            label="P2PK Redeem Pubkey (hex or npub)"
                            labelPlacement="outside"
                            placeholder="Enter the merchant’s P2PK pubkey"
                            isInvalid={isErrored}
                            errorMessage={errorMessage}
                            onChange={onChange}
                            onBlur={onBlur}
                            value={value}
                          />
                        );
                      }}
                    />

                    {/* ─── Lock Expires (date + time) ─── */}
                    <Controller
                      name="locktime"
                      control={control}
                      rules={{
                        required: "Pick a date & time",               
                        validate: (val: string) =>
                          new Date(val).getTime() > Date.now() ||      
                          "Must pick a future date/time",
                      }}
                      render={({
                        field: { onChange, onBlur, value },
                        fieldState: { error },
                      }) => {
                        const isErrored = !!error;
                        const errorMessage = error?.message ?? "";
                        return (
                          <div className="mb-4">
                            <label
                              className="block mb-1 text-light-text dark:text-dark-text"
                            >
                              Lock Expires (local time)
                            </label>
                            <input
                              type="datetime-local"
                              className="w-full rounded border border-default px-3 py-2 text-light-text dark:text-dark-text bg-light-bg dark:bg-dark-bg"
                              value={value}
                              onChange={(e) => onChange(e.target.value)}
                              onBlur={onBlur}
                            />
                            {isErrored && (
                              <p className="text-danger text-sm mt-1">{errorMessage}</p>
                            )}
                          </div>
                        );
                      }}
                    />

                    <Controller
                      name="refundPubkeys"
                      control={control}
                      rules={{
                        validate: (v: string) => {
                          const parts = v
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean);
                          for (const p of parts) {
                            if (
                              !/^[0-9A-Fa-f]{64}$/.test(p) &&
                              !p.startsWith("npub")
                            ) {
                              return "Invalid pubkey in list";
                            }
                          }
                          return true;
                        },
                      }}
                      render={({
                        field: { onChange, onBlur, value },
                        fieldState: { error },
                      }) => {
                        const isErrored = !!error;
                        const errorMessage = error?.message ?? "";
                        return (
                          <Textarea
                            className="pb-4 text-light-text dark:text-dark-text"
                            classNames={{
                              label: "text-light-text dark:text-dark-text text-lg",
                            }}
                            variant="bordered"
                            fullWidth
                            placeholder="Comma-separated refund pubkeys (hex or npub)…"
                            isInvalid={isErrored}
                            errorMessage={errorMessage}
                            label="Refund Pubkeys"
                            labelPlacement="outside"
                            onChange={onChange}
                            onBlur={onBlur}
                            value={value}
                          />
                        );
                      }}
                    />
                  </>
                )}

                <Button
                  className={`mb-10 w-full ${SHOPSTRBUTTONCLASSNAMES}`}
                  type="submit"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleSubmit(onSubmit as any)();
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
