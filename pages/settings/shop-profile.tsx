import React, { useEffect, useState, useContext, useMemo } from "react";
import { useForm, Controller } from "react-hook-form";
import {
  Button,
  Textarea,
  Input,
  Image,
  Switch,
  Select,
  SelectItem,
} from "@nextui-org/react";

import { SettingsBreadCrumbs } from "@/components/settings/settings-bread-crumbs";
import { ShopMapContext } from "@/utils/context/context";
import { SHOPSTRBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";
import {
  SignerContext,
  NostrContext,
} from "@/components/utility-components/nostr-context-provider";
import { createNostrShopEvent } from "@/utils/nostr/nostr-helper-functions";
import { FileUploaderButton } from "@/components/utility-components/file-uploader";
import ShopstrSpinner from "@/components/utility-components/shopstr-spinner";
import { nip19 } from "nostr-tools";

const ShopProfilePage = () => {
  const { nostr } = useContext(NostrContext);
  const [isUploading, setIsUploading] = useState(false);
  const [isFetching, setIsFetching] = useState(false);

  const { signer, pubkey: userPubkey } = useContext(SignerContext);
  const shopContext = useContext(ShopMapContext);

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
      name: "",
      about: "",
      p2pkEnabled: false,
      p2pkPubkey: "",
      locktime: "",
      refund_pubkeys: "",
      p2pkSigflag: "SIG_INPUTS",
      p2pkNsigs: 1,
      p2pkPubkeys: "",
    },
  });

  const watchBanner = watch("banner");
  const watchPicture = watch("picture");
  const watchP2pkEnabled = watch("p2pkEnabled");
  const defaultImage = "/shopstr-2000x2000.png";

  // helper to convert npub or hex to hex
  const convertToHex = (key: string): string | null => {
    if (!key) return "";
    if (/^[0-9A-Fa-f]{64}$/.test(key)) return key;
    if (key.startsWith("npub")) {
      try {
        const { data } = nip19.decode(key);
        return data as string;
      } catch {
        return null;
      }
    }
    return null;
  };

  const pubkeyValidator = (value: string) => {
    if (!value) return true;
    return convertToHex(value)
      ? true
      : "Invalid pubkey (must be npub… or 64-char hex)";
  };
  const pubkeysValidator = (value: string) => {
    if (!value) return true;
    const parts = value.split(",").map((s) => s.trim()).filter(Boolean);
    for (const p of parts) {
      if (!convertToHex(p)) return "Invalid pubkey in list";
    }
    return true;
  };

  useEffect(() => {
    setIsFetching(true);
    const shop = shopContext.shopData.get(userPubkey!);
    if (shop) {
      const defaults: any = {
        banner: shop.content.ui?.banner || "",
        picture: shop.content.ui?.picture || "",
        name: shop.content.name || "",
        about: shop.content.about || "",
        p2pkEnabled: false,
        p2pkPubkey: "",
        locktime: "",
        refund_pubkeys: (shop.content.p2pk?.refund_pubkeys || []).join(","),
        p2pkSigflag: "SIG_INPUTS",
        p2pkNsigs: 1,
        p2pkPubkeys: "",
      };

      if (shop.content.p2pk) {
        defaults.p2pkEnabled = !!shop.content.p2pk.enabled;
        defaults.p2pkPubkey = shop.content.p2pk.pubkey || "";

        if (shop.content.p2pk.locktime) {
          const dt = new Date(shop.content.p2pk.locktime * 1000);
          defaults.locktime = dt.toISOString().slice(0, 16);
        }

        const tags = shop.content.p2pk.tags || [];
        const sf = tags.find((t) => t[0] === "sigflag");
        const ns = tags.find((t) => t[0] === "n_sigs");
        const pks = tags.filter((t) => t[0] === "pubkeys").map((t) => t[1]);
        if (sf) defaults.p2pkSigflag = sf[1];
        if (ns) defaults.p2pkNsigs = parseInt(ns[1], 10);
        if (pks.length) defaults.p2pkPubkeys = pks.join(",");
      }

      reset(defaults);
    }
    setIsFetching(false);
  }, [shopContext, userPubkey, reset]);

  const onSubmit = async (data: any) => {
    setIsUploading(true);

    const transformed: any = {
      name: data.name,
      about: data.about,
      ui: {
        banner: data.banner,
        picture: data.picture,
        theme: "",
        darkMode: false,
      },
      merchants: [userPubkey!],
    };

    if (data.p2pkEnabled) {
      const mainHex = convertToHex(data.p2pkPubkey);
      if (!mainHex) {
        setIsUploading(false);
        return;
      }

      const lockUnix = Math.floor(new Date(data.locktime).getTime() / 1000);
      const tags: string[][] = [
        ["sigflag", data.p2pkSigflag],
        ["n_sigs", data.p2pkNsigs.toString()],
        ["locktime", lockUnix.toString()],
      ];

      data.p2pkPubkeys
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean)
        .forEach((pk: string) => {
          const hx = convertToHex(pk);
          if (hx) tags.push(["pubkeys", hx]);
        });

      data.refund_pubkeys
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean)
        .map(convertToHex)
        .filter((h: string | null): h is string => !!h)
        .forEach((hx) => {
          tags.push(["refund", hx]);
        });

      transformed.p2pk = {
        enabled: true,
        pubkey: mainHex,
        locktime: lockUnix,
        refund_pubkeys: data.refund_pubkeys
          .split(",")
          .map((s: string) => s.trim())
          .filter(Boolean)
          .map(convertToHex)
          .filter((h): h is string => !!h),
        tags,
      };
    }

    try {
      await createNostrShopEvent(
        nostr!,
        signer!,
        userPubkey!,
        JSON.stringify(transformed)
      );
      shopContext.updateShopData({
        pubkey: userPubkey!,
        content: transformed,
        created_at: Math.floor(Date.now() / 1000),
      });
    } catch (e) {
      console.error("Error saving shop settings", e);
    }

    setIsUploading(false);
  };

  const buttonClass = useMemo(
    () => `mb-10 w-full ${SHOPSTRBUTTONCLASSNAMES}`,
    []
  );

  return (
    <div className="flex min-h-screen flex-col bg-light-bg pt-24 dark:bg-dark-bg md:pb-20">
      <div className="mx-auto w-full lg:w-1/2 px-4">
        <SettingsBreadCrumbs />
        {isFetching ? (
          <ShopstrSpinner />
        ) : (
          <>
            {/* Banner + Logo */}
            <div className="mb-20 h-40 rounded-lg bg-light-fg dark:bg-dark-fg">
              <div className="relative flex h-40 items-center justify-center rounded-lg bg-shopstr-purple-light dark:bg-dark-fg">
                {watchBanner && (
                  <Image
                    src={watchBanner}
                    alt="Banner"
                    className="h-40 w-full object-cover rounded-lg"
                  />
                )}
                <FileUploaderButton
                  className={`absolute bottom-5 right-5 z-20 border-2 border-white bg-shopstr-purple shadow-md ${SHOPSTRBUTTONCLASSNAMES}`}
                  imgCallbackOnUpload={(url) => setValue("banner", url)}
                >
                  Upload Banner
                </FileUploaderButton>
              </div>
              <div className="flex items-center justify-center">
                <div className="relative z-50 mt-[-3rem] h-24 w-24">
                  <FileUploaderButton
                    isIconOnly
                    className={`absolute bottom-[-0.5rem] right-[-0.5rem] z-20 ${SHOPSTRBUTTONCLASSNAMES}`}
                    imgCallbackOnUpload={(url) => setValue("picture", url)}
                  />
                  <Image
                    src={watchPicture || defaultImage}
                    alt="Logo"
                    className="rounded-full"
                  />
                </div>
              </div>
            </div>

            <form onSubmit={handleSubmit(onSubmit as any)}>
              {/* Shop Name */}
              <Controller
                name="name"
                control={control}
                rules={{
                  maxLength: { value: 50, message: "This input exceed maxLength of 50." },
                }}
                render={({ field, fieldState: { error } }) => (
                  <Input
                    {...field}
                    fullWidth
                    variant="bordered"
                    label="Shop Name"
                    placeholder="Add your shop's name . . ."
                    isInvalid={!!error}
                    errorMessage={error?.message}
                    className="pb-4 text-light-text dark:text-dark-text"
                    classNames={{
                      label: "text-light-text dark:text-dark-text text-lg",
                    }}
                  />
                )}
              />

              {/* About */}
              <Controller
                name="about"
                control={control}
                rules={{
                  maxLength: { value: 500, message: "This input exceed maxLength of 500." },
                }}
                render={({ field, fieldState: { error } }) => (
                  <Textarea
                    {...field}
                    fullWidth
                    variant="bordered"
                    label="About"
                    placeholder="Add something about your shop . . ."
                    isInvalid={!!error}
                    errorMessage={error?.message}
                    className="pb-4 text-light-text dark:text-dark-text"
                    classNames={{
                      label: "text-light-text dark:text-dark-text text-lg",
                    }}
                  />
                )}
              />

              {/* Enable Time-Locked Payments */}
              <Controller
                name="p2pkEnabled"
                control={control}
                render={({ field }) => (
                  <Switch
                    {...field}
                    isSelected={field.value}
                    onChange={(val) => field.onChange(val)}
                    className="mb-4"
                  >
                    Enable Time-Locked Payments
                  </Switch>
                )}
              />

              {watchP2pkEnabled && (
                <>
                  {/* Lock-to Pubkey */}
                  <Controller
                    name="p2pkPubkey"
                    control={control}
                    rules={{
                      required: "Required",
                      validate: pubkeyValidator,
                    }}
                    render={({ field, fieldState: { error } }) => (
                      <Input
                        {...field}
                        fullWidth
                        variant="bordered"
                        label="Lock-to Pubkey"
                        placeholder="npub…, or hex"
                        isInvalid={!!error}
                        errorMessage={error?.message}
                        className="mb-4"
                      />
                    )}
                  />

                  {/* DateTime Picker */}
                  <div className="mb-4">
                    <label className="block mb-1 text-light-text dark:text-dark-text">
                      Lock Expires (local time)
                    </label>
                    <Controller
                      name="locktime"
                      control={control}
                      rules={{
                        required: "Pick a date & time",
                        validate: (v) =>
                          new Date(v).getTime() > Date.now() ||
                          "Must be in the future",
                      }}
                      render={({ field, fieldState: { error } }) => (
                        <>
                          <input
                            {...field}
                            type="datetime-local"
                            className="w-full rounded border border-default px-3 py-2 text-light-text dark:text-dark-text bg-light-bg dark:bg-dark-bg"
                          />
                          {error && (
                            <p className="text-danger text-sm mt-1">
                              {error.message}
                            </p>
                          )}
                        </>
                      )}
                    />
                  </div>

                  {/* Refund Pubkeys */}
                  <Controller
                    name="refund_pubkeys"
                    control={control}
                    rules={{ validate: pubkeysValidator }}
                    render={({ field, fieldState: { error } }) => (
                      <Textarea
                        {...field}
                        fullWidth
                        variant="bordered"
                        label="Refund Pubkeys (CSV)"
                        placeholder="npub…,npub… or hex"
                        isInvalid={!!error}
                        errorMessage={error?.message}
                        className="mb-4"
                      />
                    )}
                  />

                  {/* Signature Flag */}
                  <Controller
                    name="p2pkSigflag"
                    control={control}
                    rules={{ required: "Required" }}
                    render={({ field, fieldState: { error } }) => (
                      <Select
                        {...field}
                        fullWidth
                        label="Signature Flag"
                        selectedKeys={new Set([field.value])}
                        onSelectionChange={(keys) =>
                          field.onChange(Array.from(keys)[0])
                        }
                        isInvalid={!!error}
                        errorMessage={error?.message}
                        className="mb-4"
                      >
                        <SelectItem key="SIG_INPUTS" value="SIG_INPUTS">
                          Inputs Only
                        </SelectItem>
                        <SelectItem key="SIG_ALL" value="SIG_ALL">
                          Inputs & Outputs
                        </SelectItem>
                      </Select>
                    )}
                  />

                  {/* Required Signatures */}
                  <Controller
                    name="p2pkNsigs"
                    control={control}
                    rules={{
                      required: "Required",
                      min: { value: 1, message: "Min 1" },
                      validate: (v) => {
                        const extra = `${watch("p2pkPubkeys")}`
                          .split(",")
                          .filter(Boolean).length;
                        return v <= extra + 1 || "Too many";
                      },
                    }}
                    render={({ field, fieldState: { error } }) => (
                      <Input
                        {...field}
                        type="number"
                        fullWidth
                        variant="bordered"
                        label="Required Signatures"
                        isInvalid={!!error}
                        errorMessage={error?.message}
                        className="mb-4"
                      />
                    )}
                  />

                  {/* Additional Pubkeys */}
                  <Controller
                    name="p2pkPubkeys"
                    control={control}
                    rules={{ validate: pubkeysValidator }}
                    render={({ field, fieldState: { error } }) => (
                      <Textarea
                        {...field}
                        fullWidth
                        variant="bordered"
                        label="Additional Pubkeys (CSV)"
                        placeholder="npub…,npub… or hex"
                        isInvalid={!!error}
                        errorMessage={error?.message}
                        className="mb-4"
                      />
                    )}
                  />
                </>
              )}

              {/* Save Shop */}
              <Button
                className={buttonClass}
                type="submit"
                isLoading={isUploading}
                isDisabled={isUploading}
              >
                Save Shop
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};

export default ShopProfilePage;
