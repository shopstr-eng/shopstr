import React, { useEffect, useState, useContext, useMemo } from "react";
import { useRouter } from "next/router";
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
import { ProfileMapContext } from "@/utils/context/context";
import { SHOPSTRBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";
import {
  SignerContext,
  NostrContext,
} from "@/components/utility-components/nostr-context-provider";
import { createNostrProfileEvent } from "@/utils/nostr/nostr-helper-functions";
import { FileUploaderButton } from "@/components/utility-components/file-uploader";
import ShopstrSpinner from "@/components/utility-components/shopstr-spinner";

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
      fiat_options: [],
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

    if (isOnboarding) {
      router.push("/onboarding/shop-profile");
    }
  };

  if (isFetchingProfile) {
    return <ShopstrSpinner />;
  }

  return (
    <>
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
            <div className="">
              <FileUploaderButton
                isIconOnly
                className={`absolute bottom-[-0.5rem] right-[-0.5rem] z-20 ${SHOPSTRBUTTONCLASSNAMES}`}
                imgCallbackOnUpload={(imgUrl) => setValue("picture", imgUrl)}
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
                className="pb-4 text-light-text dark:text-dark-text"
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
            );
          }}
        />

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
              fullWidth={true}
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
                fullWidth={true}
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
                        {item.key ? (item.key as string) : "unknown option"}
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
