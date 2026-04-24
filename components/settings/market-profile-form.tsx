import { useEffect, useRef, useState, useContext, useMemo } from "react";
import { useRouter } from "next/router";
import { useForm, Controller } from "react-hook-form";
import {
  Button,
  Input,
  Image,
  Select,
  SelectItem,
  Checkbox,
  Tooltip,
} from "@heroui/react";
import { InformationCircleIcon } from "@heroicons/react/24/outline";
import { ProfileMapContext } from "@/utils/context/context";
import { FiatOptionsType } from "@/utils/types/types";
import {
  BLUEBUTTONCLASSNAMES,
  WHITEBUTTONCLASSNAMES,
} from "@/utils/STATIC-VARIABLES";
import {
  SignerContext,
  NostrContext,
} from "@/components/utility-components/nostr-context-provider";
import {
  createNostrProfileEvent,
  getLocalUserProfileKey,
  parseLocalProfileFallback,
  isProfileContentPopulated,
} from "@/utils/nostr/nostr-helper-functions";
import { FileUploaderButton } from "@/components/utility-components/file-uploader";
import MilkMarketSpinner from "@/components/utility-components/mm-spinner";

interface MarketProfileFormProps {
  isOnboarding?: boolean;
}

const MarketProfileForm = ({ isOnboarding }: MarketProfileFormProps) => {
  const router = useRouter();
  const { nostr } = useContext(NostrContext);
  const [isUploadingProfile, setIsUploadingProfile] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isFetchingProfile, setIsFetchingProfile] = useState(false);

  const { signer, pubkey: userPubkey } = useContext(SignerContext);

  const profileContext = useContext(ProfileMapContext);
  const { handleSubmit, control, reset, watch, setValue } = useForm({
    defaultValues: {
      banner: "",
      picture: "",
      display_name: "",
      name: "",
      nip05: "",
      about: "",
      website: "",
      lud16: "",
      payment_preference: "fiat",
      fiat_options: {} as FiatOptionsType,
      mm_donation: 0,
    },
  });

  const watchPicture = watch("picture");
  const defaultImage = useMemo(() => {
    return "https://robohash.org/" + userPubkey;
  }, [userPubkey]);

  const contextLoadedRef = useRef(false);
  useEffect(() => {
    if (!userPubkey) return;
    if (contextLoadedRef.current) return;
    setIsFetchingProfile(true);
    fetch(`/api/db/fetch-profile?pubkey=${encodeURIComponent(userPubkey)}`)
      .then((r) => r.json())
      .then((data) => {
        if (contextLoadedRef.current) return;
        if (data?.profile?.content) reset(data.profile.content);
      })
      .catch(() => {})
      .finally(() => {
        if (!contextLoadedRef.current) setIsFetchingProfile(false);
      });
  }, [userPubkey, reset]);

  useEffect(() => {
    if (!userPubkey) return;
    const profile = profileContext.profileData.get(userPubkey);
    if (!profile) return;
    contextLoadedRef.current = true;
    setIsFetchingProfile(true);

    const localFallback = parseLocalProfileFallback(
      localStorage.getItem(getLocalUserProfileKey(userPubkey))
    );
    const profileCreatedAt = profile.created_at || 0;
    const shouldUseLocalFallback =
      !!localFallback &&
      localFallback.updatedAt > profileCreatedAt &&
      isProfileContentPopulated(localFallback.content);

    reset(shouldUseLocalFallback ? localFallback.content : profile.content);

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

      const updatedData: Record<string, unknown> = {
        ...existingProfile,
        ...data,
      };
      // Drop any legacy donation field; mm_donation is the canonical key.
      if ("shopstr_donation" in updatedData) {
        delete updatedData.shopstr_donation;
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

      await createNostrProfileEvent(nostr, signer, JSON.stringify(updatedData));
      profileContext.updateProfileData({
        pubkey: userPubkey,
        content: updatedData,
        created_at: Math.floor(Date.now() / 1000),
      });

      if (isOnboarding) {
        router.push("/onboarding/wallet?type=seller");
      }
    } catch (error) {
      console.error("Failed to save user profile:", error);
    } finally {
      setIsUploadingProfile(false);
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2000);
    }
  };

  if (isFetchingProfile) {
    return <MilkMarketSpinner />;
  }

  return (
    <>
      {/* Profile Picture Section */}
      <div className="mb-8 flex justify-center">
        <div className="relative">
          <div className="relative h-24 w-24">
            {watchPicture ? (
              <Image
                src={watchPicture}
                alt="User Profile Picture"
                className="h-full w-full rounded-full object-cover"
                classNames={{
                  wrapper: "!max-w-full w-full h-full",
                }}
              />
            ) : (
              <Image
                src={defaultImage}
                alt="User Profile Picture"
                className="h-full w-full rounded-full object-cover"
                classNames={{
                  wrapper: "!max-w-full w-full h-full",
                }}
              />
            )}
          </div>
          <FileUploaderButton
            isIconOnly={true}
            className={`absolute right-0 bottom-0 z-20 !h-10 !w-10 !min-w-10 ${WHITEBUTTONCLASSNAMES}`}
            imgCallbackOnUpload={(imgUrl) => setValue("picture", imgUrl)}
          />
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit as any)} className="space-y-6">
        {/* Display Name */}
        <div className="space-y-2">
          <label className="block text-base font-bold text-black">
            Display name
          </label>
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
                  classNames={{
                    inputWrapper:
                      "!bg-white border-3 border-black rounded-md shadow-none hover:!bg-white group-data-[hover=true]:!bg-white group-data-[hover=true]:border-black group-data-[focus=true]:border-3 group-data-[focus=true]:border-black group-data-[focus=true]:!bg-white h-12 transition-none",
                    input:
                      "text-base !text-black font-medium placeholder:text-gray-400",
                  }}
                  fullWidth={true}
                  isInvalid={isErrored}
                  errorMessage={errorMessage}
                  placeholder="Add your display name..."
                  onChange={onChange}
                  onBlur={onBlur}
                  value={value}
                />
              );
            }}
          />
        </div>

        {/* Username */}
        <div className="space-y-2">
          <label className="block text-base font-bold text-black">
            Username
          </label>
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
                  classNames={{
                    inputWrapper:
                      "!bg-white border-3 border-black rounded-md shadow-none hover:!bg-white group-data-[hover=true]:!bg-white group-data-[hover=true]:border-black group-data-[focus=true]:border-3 group-data-[focus=true]:border-black group-data-[focus=true]:!bg-white h-12 transition-none",
                    input:
                      "text-base !text-black font-medium placeholder:text-gray-400",
                  }}
                  fullWidth={true}
                  isInvalid={isErrored}
                  errorMessage={errorMessage}
                  placeholder="Add your username..."
                  onChange={onChange}
                  onBlur={onBlur}
                  value={value}
                />
              );
            }}
          />
        </div>

        {/* Nostr Address */}
        {!isOnboarding && (
          <div className="space-y-2">
            <label className="block text-base font-bold text-black">
              Nostr address{" "}
              <span className="text-sm font-normal text-gray-400">
                (Optional)
              </span>
            </label>
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
                    classNames={{
                      inputWrapper:
                        "!bg-white border-3 border-black rounded-md shadow-none hover:!bg-white group-data-[hover=true]:!bg-white group-data-[hover=true]:border-black group-data-[focus=true]:border-3 group-data-[focus=true]:border-black group-data-[focus=true]:!bg-white h-12 transition-none",
                      input:
                        "text-base !text-black font-medium placeholder:text-gray-400",
                    }}
                    fullWidth={true}
                    isInvalid={isErrored}
                    errorMessage={errorMessage}
                    placeholder="Add your NIP-05 address..."
                    onChange={onChange}
                    onBlur={onBlur}
                    value={value}
                  />
                );
              }}
            />
          </div>
        )}

        {/* Lightning Address */}
        {!isOnboarding && (
          <div className="space-y-2">
            <label className="block text-base font-bold text-black">
              Lightning address{" "}
              <span className="text-sm font-normal text-gray-400">
                (Optional)
              </span>
            </label>
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
                    classNames={{
                      inputWrapper:
                        "!bg-white border-3 border-black rounded-md shadow-none hover:!bg-white group-data-[hover=true]:!bg-white group-data-[hover=true]:border-black group-data-[focus=true]:border-3 group-data-[focus=true]:border-black group-data-[focus=true]:!bg-white h-12 transition-none",
                      input:
                        "text-base !text-black font-medium placeholder:text-gray-400",
                    }}
                    fullWidth={true}
                    isInvalid={isErrored}
                    errorMessage={errorMessage}
                    placeholder="Add your Lightning address..."
                    onChange={onChange}
                    onBlur={onBlur}
                    value={value}
                  />
                );
              }}
            />
          </div>
        )}

        {/* Payment Preference */}
        <div className="space-y-2">
          <label className="block text-base font-bold text-black">
            Payment preference
          </label>
          <Controller
            name="payment_preference"
            control={control}
            render={({ field: { onChange, onBlur, value } }) => (
              <Select
                classNames={{
                  trigger:
                    "!bg-white border-3 border-black rounded-md shadow-none hover:!bg-white data-[hover=true]:!bg-white data-[hover=true]:border-black data-[focus=true]:border-3 data-[focus=true]:border-black data-[focus=true]:!bg-white h-12 transition-none",
                  popoverContent: "bg-white border-3 border-black rounded-md",
                  value: "text-base !text-black font-medium",
                  listboxWrapper: "text-black",
                  listbox: "text-black",
                }}
                fullWidth={true}
                selectedKeys={value ? [value] : []}
                onChange={(e) => onChange(e.target.value)}
                onBlur={onBlur}
              >
                <SelectItem key="ecash" className="font-medium text-black">
                  Cashu (Bitcoin)
                </SelectItem>
                <SelectItem key="lightning" className="font-medium text-black">
                  Lightning (Bitcoin)
                </SelectItem>
                <SelectItem key="fiat" className="font-medium text-black">
                  Local Currency (Fiat)
                </SelectItem>
              </Select>
            )}
          />
        </div>

        {/* Fiat Payment Options */}
        <div className="space-y-3">
          <label className="block text-base font-bold text-black">
            Fiat payment options
          </label>
          <div className="grid grid-cols-1 gap-y-4 sm:grid-cols-2 sm:gap-x-8">
            {[
              { key: "cash", label: "Cash", requiresUsername: false },
              { key: "venmo", label: "Venmo", requiresUsername: true },
              { key: "zelle", label: "Zelle", requiresUsername: true },
              { key: "cashapp", label: "Cash App", requiresUsername: true },
              { key: "applepay", label: "Apple Pay", requiresUsername: true },
              { key: "googlepay", label: "Google Pay", requiresUsername: true },
              { key: "paypal", label: "PayPal", requiresUsername: true },
            ].map((option) => (
              <div key={option.key} className="flex flex-col gap-2">
                <Checkbox
                  classNames={{
                    wrapper:
                      "border-2 border-black rounded-[4px] before:rounded-[2px] after:bg-black after:text-white",
                    icon: "text-white",
                    label: "text-black text-base font-medium",
                  }}
                  isSelected={Object.keys(watch("fiat_options") || {}).includes(
                    option.key
                  )}
                  onValueChange={(isSelected) => {
                    const currentOptions = watch("fiat_options") || {};
                    if (isSelected) {
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
                >
                  {option.label}
                </Checkbox>
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
                        inputWrapper:
                          "!bg-white border-3 border-black rounded-md shadow-none hover:!bg-white group-data-[hover=true]:!bg-white group-data-[hover=true]:border-black group-data-[focus=true]:border-3 group-data-[focus=true]:border-black group-data-[focus=true]:!bg-white h-10 transition-none",
                        input:
                          "text-sm !text-black font-medium placeholder:text-gray-400",
                      }}
                    />
                  )}
              </div>
            ))}
          </div>
        </div>

        {/* Milk Market Donation */}
        <div className="space-y-2">
          <label className="flex items-center gap-1.5 text-base font-bold text-black">
            Milk Market donation (%)
            <Tooltip
              content="This donation helps fund Milk Market and keep the marketplace running. You can change it at any time."
              placement="top"
              className="max-w-xs"
            >
              <InformationCircleIcon className="h-5 w-5 cursor-help text-black" />
            </Tooltip>
          </label>
          <Controller
            name="mm_donation"
            control={control}
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                type="number"
                min={0}
                max={100}
                step={0.1}
                classNames={{
                  inputWrapper:
                    "!bg-white border-3 border-black rounded-md shadow-none hover:!bg-white group-data-[hover=true]:!bg-white group-data-[hover=true]:border-black group-data-[focus=true]:border-3 group-data-[focus=true]:border-black group-data-[focus=true]:!bg-white h-12 transition-none",
                  input:
                    "text-base !text-black font-medium placeholder:text-gray-400",
                }}
                fullWidth
                onChange={onChange}
                onBlur={onBlur}
                value={value.toString()}
              />
            )}
          />
        </div>

        {/* Submit Button */}
        <Button
          className={`w-full ${BLUEBUTTONCLASSNAMES}`}
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
          {isSaved ? "✅ Saved!" : "Save Profile"}
        </Button>
      </form>
    </>
  );
};

export default MarketProfileForm;
