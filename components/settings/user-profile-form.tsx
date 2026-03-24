import { useEffect, useState, useContext, useMemo } from "react";
import { useRouter } from "next/router";
import { useForm, Controller } from "react-hook-form";
import {
  Button,
  Textarea,
  Input,
  Image,
  Select,
  SelectItem,
  Checkbox,
  Tooltip,
} from "@nextui-org/react";
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
import { NostrNSecSigner } from "@/utils/nostr/signers/nostr-nsec-signer";
import { createNostrProfileEvent } from "@/utils/nostr/nostr-helper-functions";
import { FileUploaderButton } from "@/components/utility-components/file-uploader";
import MilkMarketSpinner from "@/components/utility-components/mm-spinner";

interface UserProfileFormProps {
  isOnboarding?: boolean;
}

const UserProfileForm = ({ isOnboarding }: UserProfileFormProps) => {
  const router = useRouter();
  const { nostr } = useContext(NostrContext);
  const [isUploadingProfile, setIsUploadingProfile] = useState(false);
  const [isFetchingProfile, setIsFetchingProfile] = useState(false);
  const [isNPubCopied, setIsNPubCopied] = useState(false);
  const [isNSecCopied, setIsNSecCopied] = useState(false);
  const [isNSecVisible, setIsNSecVisible] = useState(false);

  const {
    signer,
    pubkey: userPubkey,
    npub: userNPub,
  } = useContext(SignerContext);

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
      payment_preference: "ecash",
      fiat_options: {} as FiatOptionsType,
      shopstr_donation: 2.1,
    },
  });

  const watchBanner = watch("banner");
  const watchPicture = watch("picture");
  const [userNSec, setUserNSec] = useState("");
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

    if (isOnboarding) {
      router.push("/onboarding/shop-profile");
    }
  };

  if (isFetchingProfile) {
    return <MilkMarketSpinner />;
  }

  return (
    <>
      {/* Banner and Profile Picture Section */}
      <div className="mb-20 h-40 rounded-md">
        <div className="relative flex h-48 items-center justify-center overflow-hidden rounded-xl border-3 border-black bg-primary-blue">
          {watchBanner && (
            <Image
              alt={"User Banner Image"}
              src={watchBanner}
              className="h-full w-full object-cover"
              classNames={{
                wrapper: "!max-w-full w-full h-full",
              }}
            />
          )}
          <FileUploaderButton
            className={`absolute right-4 top-4 z-20 ${WHITEBUTTONCLASSNAMES}`}
            imgCallbackOnUpload={(imgUrl) => setValue("banner", imgUrl)}
          >
            Upload Banner
          </FileUploaderButton>
        </div>
        <div className="flex justify-center">
          <div className="relative -mt-12">
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
              className={`!min-w-10 absolute bottom-0 right-0 z-20 !h-10 !w-10 ${WHITEBUTTONCLASSNAMES}`}
              imgCallbackOnUpload={(imgUrl) => setValue("picture", imgUrl)}
            />
          </div>
        </div>
      </div>

      {/* NPub Display */}
      {!isOnboarding && (
        <div className="mb-4 flex items-center justify-between gap-2 overflow-hidden rounded-md border-3 border-black bg-white p-3">
          <p className="break-all font-mono text-sm font-medium text-black">
            {userNPub!}
          </p>
          <Tooltip
            content={isNPubCopied ? "Copied!" : "Copy npub"}
            classNames={{
              content: "text-black bg-white border border-black rounded-md",
            }}
            closeDelay={100}
          >
            <Button
              isIconOnly
              variant="light"
              className="h-6 w-6 min-w-0 flex-shrink-0 p-0 text-black"
              onClick={() => {
                navigator.clipboard.writeText(userNPub!);
                setIsNPubCopied(true);
                setTimeout(() => setIsNPubCopied(false), 2000);
              }}
            >
              {isNPubCopied ? "✅" : "📋"}
            </Button>
          </Tooltip>
        </div>
      )}

      {/* NSec Display */}
      {!isOnboarding && userNSec ? (
        <div className="mb-12 flex items-center justify-between gap-2 overflow-hidden rounded-md border-3 border-black bg-white p-3">
          <p className="break-all font-mono text-sm font-medium text-black">
            {isNSecVisible
              ? userNSec
              : "•••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••"}
          </p>
          <div className="flex flex-shrink-0 gap-2">
            <Tooltip
              content={isNSecVisible ? "Hide nsec" : "Show nsec"}
              classNames={{
                content: "text-black bg-white border border-black rounded-md",
              }}
              closeDelay={100}
            >
              <Button
                isIconOnly
                variant="light"
                className="h-6 w-6 min-w-0 p-0 text-black"
                onClick={() => setIsNSecVisible(!isNSecVisible)}
              >
                {isNSecVisible ? "👁️⃠" : "👁️"}
              </Button>
            </Tooltip>
            <Tooltip
              content={isNSecCopied ? "Copied!" : "Copy nsec"}
              classNames={{
                content: "text-black bg-white border border-black rounded-md",
              }}
              closeDelay={100}
            >
              <Button
                isIconOnly
                variant="light"
                className="h-6 w-6 min-w-0 p-0 text-black"
                onClick={() => {
                  navigator.clipboard.writeText(userNSec);
                  setIsNSecCopied(true);
                  setTimeout(() => setIsNSecCopied(false), 2000);
                }}
              >
                {isNSecCopied ? "✅" : "📋"}
              </Button>
            </Tooltip>
          </div>
        </div>
      ) : !isOnboarding ? (
        <div className="mb-12" />
      ) : null}

      {/* Nostr Info Box */}
      {!isOnboarding && (
        <div className="mb-8 flex w-full items-start gap-3 rounded-md border-3 border-black bg-white p-4">
          <InformationCircleIcon className="h-6 w-6 flex-shrink-0 text-black" />
          <p className="text-sm text-black">
            Accounts are created using{" "}
            <a
              href="https://nostr.com"
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold text-primary-yellow hover:underline"
            >
              Nostr keys
            </a>
            . Please back up your keys in a secure location to ensure you
            don&apos;t lose access to your account.
          </p>
        </div>
      )}

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

        {/* About */}
        <div className="space-y-2">
          <label className="block text-base font-bold text-black">About</label>
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
                  classNames={{
                    inputWrapper:
                      "!bg-white border-3 border-black rounded-md shadow-none hover:!bg-white group-data-[hover=true]:!bg-white group-data-[hover=true]:border-black group-data-[focus=true]:border-3 group-data-[focus=true]:border-black group-data-[focus=true]:!bg-white transition-none",
                    input:
                      "text-base !text-black font-medium placeholder:text-gray-400",
                  }}
                  fullWidth={true}
                  placeholder="Add something about yourself..."
                  isInvalid={isErrored}
                  errorMessage={errorMessage}
                  onChange={onChange}
                  onBlur={onBlur}
                  value={value}
                  minRows={3}
                />
              );
            }}
          />
        </div>

        {/* Website */}
        <div className="space-y-2">
          <label className="block text-base font-bold text-black">
            Website
          </label>
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
                  classNames={{
                    inputWrapper:
                      "!bg-white border-3 border-black rounded-md shadow-none hover:!bg-white group-data-[hover=true]:!bg-white group-data-[hover=true]:border-black group-data-[focus=true]:border-3 group-data-[focus=true]:border-black group-data-[focus=true]:!bg-white h-12 transition-none",
                    input:
                      "text-base !text-black font-medium placeholder:text-gray-400",
                  }}
                  fullWidth={true}
                  isInvalid={isErrored}
                  errorMessage={errorMessage}
                  placeholder="Add your website URL..."
                  onChange={onChange}
                  onBlur={onBlur}
                  value={value}
                />
              );
            }}
          />
        </div>

        {/* Nostr Address */}
        <div className="space-y-2">
          <label className="block text-base font-bold text-black">
            Nostr address
          </label>
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

        {/* Lightning Address */}
        <div className="space-y-2">
          <label className="block text-base font-bold text-black">
            Lightning address
          </label>
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
                <SelectItem
                  key="ecash"
                  value="ecash"
                  className="font-medium text-black"
                >
                  Cashu (Bitcoin)
                </SelectItem>
                <SelectItem
                  key="lightning"
                  value="lightning"
                  className="font-medium text-black"
                >
                  Lightning (Bitcoin)
                </SelectItem>
                <SelectItem
                  key="fiat"
                  value="fiat"
                  className="font-medium text-black"
                >
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
                          [option.key]: "", // Set to empty string to show input
                        });
                      } else {
                        setValue("fiat_options", {
                          ...currentOptions,
                          [option.key]: "available", // "available" for no-username options
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
          <label className="block text-base font-bold text-black">
            Milk Market donation (%)
          </label>
          <Controller
            name="shopstr_donation"
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
          Save Profile
        </Button>
      </form>
    </>
  );
};

export default UserProfileForm;
