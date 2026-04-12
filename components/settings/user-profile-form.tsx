import { useEffect, useState, useContext, useMemo } from "react";
import { useRouter } from "next/router";
import { useForm, Controller } from "react-hook-form";
import {
  Button,
  Input,
  Image,
  Select,
  SelectItem,
  Tooltip,
} from "@heroui/react";
import { ProfileMapContext } from "@/utils/context/context";
import { SHOPSTRBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";
import {
  SignerContext,
  NostrContext,
} from "@/components/utility-components/nostr-context-provider";
import { NostrNSecSigner } from "@/utils/nostr/signers/nostr-nsec-signer";
import { createNostrProfileEvent } from "@/utils/nostr/nostr-helper-functions";
import { FileUploaderButton } from "@/components/utility-components/file-uploader";
import ShopstrSpinner from "@/components/utility-components/shopstr-spinner";

interface UserProfileFormProps {
  isOnboarding?: boolean;
}

const getLocalUserProfileKey = (pubkey: string) =>
  `shopstr:user-profile:${pubkey}`;

interface LocalProfileFallback {
  content: Record<string, unknown>;
  updatedAt: number;
}

const isProfileContentPopulated = (content: Record<string, unknown>) =>
  Object.values(content).some(
    (value) => value !== "" && value !== null && value !== undefined
  );

const parseLocalProfileFallback = (
  raw: string | null
): LocalProfileFallback | null => {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);

    // Backward compatibility: previously we stored content directly.
    if (
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      !("content" in parsed)
    ) {
      return {
        content: parsed as Record<string, unknown>,
        updatedAt: 0,
      };
    }

    if (
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      "content" in parsed
    ) {
      const fallback = parsed as LocalProfileFallback;
      return {
        content: fallback.content || {},
        updatedAt: fallback.updatedAt || 0,
      };
    }
  } catch (error) {
    console.error("Failed to parse local profile fallback:", error);
  }

  return null;
};

const UserProfileForm = ({ isOnboarding }: UserProfileFormProps) => {
  const router = useRouter();
  const { nostr } = useContext(NostrContext);
  const [isUploadingProfile, setIsUploadingProfile] = useState(false);
  const [isFetchingProfile, setIsFetchingProfile] = useState(false);
  const [isNPubCopied, setIsNPubCopied] = useState(false);
  const [isNSecCopied, setIsNSecCopied] = useState(false);
  const [isNSecVisible, setIsNSecVisible] = useState(false);
  const [isNcryptsecCopied, setIsNcryptsecCopied] = useState(false);
  const [isNcryptsecVisible, setIsNcryptsecVisible] = useState(false);
  const [userNcryptsec, setUserNcryptsec] = useState("");
  const [userNSec, setUserNSec] = useState("");

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
      shopstr_donation: 2.1,
    },
  });

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
      const encKey = nsecSigner.getEncryptedPrivKey();
      if (encKey && encKey.startsWith("ncryptsec")) {
        setUserNcryptsec(encKey);
      }
    }
  }, [profileContext, userPubkey, signer, reset]);

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

      if (isOnboarding) {
        router.push("/onboarding/wallet?type=seller");
      }
    } catch (error) {
      console.error("Failed to save user profile:", error);
    } finally {
      setIsUploadingProfile(false);
    }
  };

  if (isFetchingProfile) {
    return <ShopstrSpinner />;
  }

  return (
    <>
      <div className="mb-8 flex items-center justify-center">
        <div className="relative h-24 w-24">
          <FileUploaderButton
            isIconOnly
            className={`absolute right-[-0.5rem] bottom-[-0.5rem] z-20 ${SHOPSTRBUTTONCLASSNAMES}`}
            imgCallbackOnUpload={(imgUrl) => setValue("picture", imgUrl)}
          />
          <Image
            key={profileImageSrc}
            src={profileImageSrc}
            alt="user profile picture"
            className="rounded-full"
          />
        </div>
      </div>

      {/* NPub Display */}
      {!isOnboarding && userNPub && (
        <div className="border-light-border dark:border-dark-border mb-4 flex items-center justify-between gap-2 overflow-hidden rounded-lg border p-3">
          <p className="text-light-text dark:text-dark-text font-mono text-sm font-medium break-all">
            {userNPub}
          </p>
          <Tooltip
            content={isNPubCopied ? "Copied!" : "Copy npub"}
            closeDelay={100}
          >
            <Button
              isIconOnly
              variant="light"
              className="h-6 w-6 min-w-0 flex-shrink-0 p-0"
              onClick={() => {
                navigator.clipboard.writeText(userNPub);
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
        <div className="border-light-border dark:border-dark-border mb-4 flex items-center justify-between gap-2 overflow-hidden rounded-lg border p-3">
          <p className="text-light-text dark:text-dark-text font-mono text-sm font-medium break-all">
            {isNSecVisible
              ? userNSec
              : "•••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••"}
          </p>
          <div className="flex flex-shrink-0 gap-2">
            <Tooltip
              content={isNSecVisible ? "Hide nsec" : "Show nsec"}
              closeDelay={100}
            >
              <Button
                isIconOnly
                variant="light"
                className="h-6 w-6 min-w-0 p-0"
                onClick={() => setIsNSecVisible(!isNSecVisible)}
              >
                {isNSecVisible ? "🙈" : "👁️"}
              </Button>
            </Tooltip>
            <Tooltip
              content={isNSecCopied ? "Copied!" : "Copy nsec"}
              closeDelay={100}
            >
              <Button
                isIconOnly
                variant="light"
                className="h-6 w-6 min-w-0 p-0"
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
        <div className="mb-4" />
      ) : null}

      {/* NCryptsec Display */}
      {!isOnboarding && userNcryptsec ? (
        <div className="border-light-border dark:border-dark-border mb-4 flex items-center justify-between gap-2 overflow-hidden rounded-lg border p-3">
          <div className="min-w-0 flex-1">
            <p className="mb-1 text-xs font-bold text-gray-500">ncryptsec</p>
            <p className="text-light-text dark:text-dark-text font-mono text-sm font-medium break-all">
              {isNcryptsecVisible
                ? userNcryptsec
                : "•••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••"}
            </p>
          </div>
          <div className="flex flex-shrink-0 gap-2">
            <Tooltip
              content={isNcryptsecVisible ? "Hide ncryptsec" : "Show ncryptsec"}
              closeDelay={100}
            >
              <Button
                isIconOnly
                variant="light"
                className="h-6 w-6 min-w-0 p-0"
                onClick={() => setIsNcryptsecVisible(!isNcryptsecVisible)}
              >
                {isNcryptsecVisible ? "🙈" : "👁️"}
              </Button>
            </Tooltip>
            <Tooltip
              content={isNcryptsecCopied ? "Copied!" : "Copy ncryptsec"}
              closeDelay={100}
            >
              <Button
                isIconOnly
                variant="light"
                className="h-6 w-6 min-w-0 p-0"
                onClick={() => {
                  navigator.clipboard.writeText(userNcryptsec);
                  setIsNcryptsecCopied(true);
                  setTimeout(() => setIsNcryptsecCopied(false), 2000);
                }}
              >
                {isNcryptsecCopied ? "✅" : "📋"}
              </Button>
            </Tooltip>
          </div>
        </div>
      ) : !isOnboarding ? (
        <div className="mb-4" />
      ) : null}

      {!isOnboarding && userNcryptsec && (
        <p className="mb-4 text-xs text-gray-500">
          Your ncryptsec is your nsec in encrypted form. It is safer to use your
          ncryptsec instead of your nsec to sign in across devices, as it cannot
          be used without your passphrase.
        </p>
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
            const errorMessage: string = error?.message ? error.message : "";
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
                onChange={onChange}
                onBlur={onBlur}
                value={value}
              />
            );
          }}
        />

        {!isOnboarding && (
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
                  onChange={onChange}
                  onBlur={onBlur}
                  value={value}
                />
              );
            }}
          />
        )}

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
              className="text-light-text dark:text-dark-text pb-4"
              classNames={{
                label: "text-light-text dark:text-dark-text text-lg",
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
              label="Shopstr donation % (for sellers)"
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
