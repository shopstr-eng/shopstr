import React, { useEffect, useState, useContext, useMemo } from "react";
import { useRouter } from "next/router";
import { useForm, Controller } from "react-hook-form";
import {
  Button,
  Textarea,
  Input,
  Image,
  Select,
  SelectItem,
} from "@nextui-org/react";
import { ProfileMapContext } from "@/utils/context/context";
import { FiatOptionsType } from "@/utils/types/types";
import {
  SignerContext,
  NostrContext,
} from "@/components/utility-components/nostr-context-provider";
import { createNostrProfileEvent } from "@/utils/nostr/nostr-helper-functions";
import { FileUploaderButton } from "@/components/utility-components/file-uploader";
import ShopstrSpinner from "@/components/utility-components/shopstr-spinner";
import { NEO_BTN } from "@/utils/STATIC-VARIABLES";

interface UserProfileFormProps {
  isOnboarding?: boolean;
}

const UserProfileForm = ({ isOnboarding }: UserProfileFormProps) => {
  const router = useRouter();
  const { nostr } = useContext(NostrContext);
  const [isUploadingProfile, setIsUploadingProfile] = useState(false);
  const [isFetchingProfile, setIsFetchingProfile] = useState(false);

  const { signer, pubkey: userPubkey } = useContext(SignerContext);

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
  }, [profileContext, userPubkey, reset]);

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

    if (isOnboarding) {
      router.push("/onboarding/shop-profile");
    }
  };

  if (isFetchingProfile) {
    return <ShopstrSpinner />;
  }

  return (
    <>
      <div className="mb-16 md:mb-20 h-32 md:h-40 rounded-2xl bg-[#161616] border border-zinc-800 overflow-visible">
        <div className="relative flex h-32 md:h-40 items-center justify-center rounded-2xl bg-[#111] overflow-hidden">
          {watchBanner && (
            <Image
              alt={"User banner image"}
              src={watchBanner}
              className="h-32 md:h-40 w-full rounded-2xl object-cover"
            />
          )}
          <FileUploaderButton
            className={`${NEO_BTN} absolute bottom-2 right-2 md:bottom-4 md:right-4 z-20 h-8 md:h-10 px-3 md:px-4 text-[10px] md:text-xs`}
            imgCallbackOnUpload={(imgUrl) => setValue("banner", imgUrl)}
          >
            Upload Banner
          </FileUploaderButton>
        </div>
        <div className="flex items-center justify-center">
          <div className="relative z-50 mt-[-2.5rem] md:mt-[-3rem] h-20 w-20 md:h-28 md:w-28">
            <div className="border-4 border-[#111] rounded-full">
              <FileUploaderButton
                isIconOnly
                className={`${NEO_BTN} absolute bottom-0 right-0 z-[60] h-8 w-8 md:h-10 md:w-10 min-w-0 rounded-full border-white p-0 shadow-lg`}
                imgCallbackOnUpload={(imgUrl) => setValue("picture", imgUrl)}
              />
              {watchPicture ? (
                <Image
                  src={watchPicture}
                  alt="user profile picture"
                  className="rounded-full h-18 w-18 md:h-24 md:w-24 object-cover"
                />
              ) : (
                <Image
                  src={defaultImage}
                  alt="user profile picture"
                  className="rounded-full h-18 w-18 md:h-24 md:w-24 object-cover"
                />
              )}
            </div>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit as any)}>
        <Controller
          name="display_name"
          control={control}
          render={({
            field: { onChange, onBlur, value },
            fieldState: { error },
          }) => {
            const isErrored = error !== undefined;
            const errorMessage: string = error?.message ? error.message : "";
            return (
              <Input
                className="pb-6"
                classNames={{
                  label: "text-zinc-400 font-bold uppercase tracking-wider text-sm",
                  input: "text-white",
                  inputWrapper: "border-zinc-700 bg-[#111] hover:border-zinc-500 group-data-[focus=true]:border-yellow-400 h-12",
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
            const errorMessage: string = error?.message ? error.message : "";
            return (
              <Input
                className="pb-6"
                classNames={{
                  label: "text-zinc-400 font-bold uppercase tracking-wider text-sm",
                  input: "text-white",
                  inputWrapper: "border-zinc-700 bg-[#111] hover:border-zinc-500 group-data-[focus=true]:border-yellow-400 h-12",
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
            const errorMessage: string = error?.message ? error.message : "";
            return (
              <Textarea
                className="pb-6"
                classNames={{
                  label: "text-zinc-400 font-bold uppercase tracking-wider text-sm",
                  input: "text-white",
                  inputWrapper: "border-zinc-700 bg-[#111] hover:border-zinc-500 group-data-[focus=true]:border-yellow-400",
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
            const errorMessage: string = error?.message ? error.message : "";
            return (
              <Input
                className="pb-6"
                classNames={{
                  label: "text-zinc-400 font-bold uppercase tracking-wider text-sm",
                  input: "text-white",
                  inputWrapper: "border-zinc-700 bg-[#111] hover:border-zinc-500 group-data-[focus=true]:border-yellow-400 h-12",
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
            const errorMessage: string = error?.message ? error.message : "";
            return (
              <Input
                className="pb-6"
                classNames={{
                  label: "text-zinc-400 font-bold uppercase tracking-wider text-sm",
                  input: "text-white",
                  inputWrapper: "border-zinc-700 bg-[#111] hover:border-zinc-500 group-data-[focus=true]:border-yellow-400 h-12",
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
            const errorMessage: string = error?.message ? error.message : "";
            return (
              <Input
                className="pb-6"
                classNames={{
                  label: "text-zinc-400 font-bold uppercase tracking-wider text-sm",
                  input: "text-white",
                  inputWrapper: "border-zinc-700 bg-[#111] hover:border-zinc-500 group-data-[focus=true]:border-yellow-400 h-12",
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
                label: "text-zinc-400 font-bold uppercase tracking-wider text-sm",
                trigger: "border-zinc-700 bg-[#111] hover:border-zinc-500 data-[focus=true]:border-yellow-400 h-12",
                value: "text-white",
              }}
              variant="bordered"
              fullWidth={true}
              label="Payment preference (for sellers)"
              labelPlacement="outside"
              selectedKeys={value ? [value] : []}
              onChange={(e) => onChange(e.target.value)}
              onBlur={onBlur}
            >
              <SelectItem
                key="ecash"
                value="ecash"
                className="text-zinc-800"
              >
                Cashu (Bitcoin)
              </SelectItem>
              <SelectItem
                key="lightning"
                value="lightning"
                className="text-zinc-800"
              >
                Lightning (Bitcoin)
              </SelectItem>
              <SelectItem
                key="fiat"
                value="fiat"
                className="text-zinc-800"
              >
                Local Currency (Fiat)
              </SelectItem>
            </Select>
          )}
        />

        <div className="pb-8">
          <label className="mb-4 block text-zinc-400 font-bold uppercase tracking-wider text-sm">
            Fiat payment options (for sellers)
          </label>
          <div className="space-y-4">
            {[
              { key: "cash", label: "Cash", requiresUsername: false },
              { key: "venmo", label: "Venmo", requiresUsername: true },
              { key: "zelle", label: "Zelle", requiresUsername: true },
              { key: "cashapp", label: "Cash App", requiresUsername: true },
              { key: "applepay", label: "Apple Pay", requiresUsername: true },
              { key: "googlepay", label: "Google Pay", requiresUsername: true },
              { key: "paypal", label: "PayPal", requiresUsername: true },
            ].map((option) => (
              <div key={option.key} className="flex flex-wrap items-center gap-3 bg-[#1a1a1a] p-3 rounded-xl border border-zinc-800">
                <input
                  type="checkbox"
                  id={option.key}
                  checked={Object.keys(watch("fiat_options") || {}).includes(
                    option.key
                  )}
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
                  className="text-white font-bold"
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
                        const currentOptions = watch("fiat_options") || {};
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
                label: "text-zinc-400 font-bold uppercase tracking-wider text-sm",
                input: "text-white font-mono",
                inputWrapper: "border-zinc-700 bg-[#111] hover:border-zinc-500 group-data-[focus=true]:border-yellow-400 h-12",
              }}
              variant="bordered"
              fullWidth
              label="Shopstr donation % (for sellers)"
              labelPlacement="outside"
              onChange={onChange}
              onBlur={onBlur}
              value={value.toString()}
            />
          )}
        />

        <Button
          className={`${NEO_BTN} mb-10 h-14 w-full text-sm shadow-[4px_4px_0px_0px_#ffffff]`}
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
  );
};

export default UserProfileForm;
