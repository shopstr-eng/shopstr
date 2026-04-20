import { useEffect, useState, useContext, useMemo } from "react";
import { useRouter } from "next/router";
import { useForm, Controller } from "react-hook-form";
import { Button, Input, Image } from "@heroui/react";
import { ProfileMapContext } from "@/utils/context/context";
import { SHOPSTRBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";
import {
  SignerContext,
  NostrContext,
} from "@/components/utility-components/nostr-context-provider";
import { createNostrProfileEvent } from "@/utils/nostr/nostr-helper-functions";
import { FileUploaderButton } from "@/components/utility-components/file-uploader";
import ShopstrSpinner from "@/components/utility-components/shopstr-spinner";

interface BuyerProfileFormProps {
  isOnboarding?: boolean;
}

const BuyerProfileForm = ({ isOnboarding }: BuyerProfileFormProps) => {
  const router = useRouter();
  const { nostr } = useContext(NostrContext);
  const [isUploadingProfile, setIsUploadingProfile] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isFetchingProfile, setIsFetchingProfile] = useState(false);

  const { signer, pubkey: userPubkey } = useContext(SignerContext);

  const profileContext = useContext(ProfileMapContext);
  const { handleSubmit, control, reset, watch, setValue } = useForm({
    defaultValues: {
      picture: "",
      display_name: "",
      name: "",
    },
  });

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
      reset({
        picture: profile.content.picture || "",
        display_name: profile.content.display_name || "",
        name: profile.content.name || "",
      });
    }
    setIsFetchingProfile(false);
  }, [profileContext, userPubkey, reset]);

  const onSubmit = async (data: { [x: string]: string }) => {
    if (!userPubkey) throw new Error("pubkey is undefined");
    setIsUploadingProfile(true);

    const profileMap = profileContext.profileData;
    const existingProfile = profileMap.has(userPubkey)
      ? profileMap.get(userPubkey)?.content
      : {};

    const updatedData = {
      ...existingProfile,
      picture: data.picture || "",
      display_name: data.display_name || "",
      name: data.name || "",
    };

    await createNostrProfileEvent(nostr!, signer!, JSON.stringify(updatedData));
    profileContext.updateProfileData({
      pubkey: userPubkey!,
      content: updatedData,
      created_at: 0,
    });
    setIsUploadingProfile(false);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);

    if (isOnboarding) {
      router.push("/onboarding/wallet?type=buyer");
    }
  };

  if (isFetchingProfile) {
    return <ShopstrSpinner />;
  }

  return (
    <>
      <div className="mb-16 flex items-center justify-center">
        <div className="relative h-24 w-24">
          <FileUploaderButton
            isIconOnly
            className={`absolute right-[-0.5rem] bottom-[-0.5rem] z-20 ${SHOPSTRBUTTONCLASSNAMES}`}
            imgCallbackOnUpload={(imgUrl) => setValue("picture", imgUrl)}
          />
          {watchPicture ? (
            <Image
              src={watchPicture}
              alt="User Profile Picture"
              className="rounded-full"
            />
          ) : (
            <Image
              src={defaultImage}
              alt="User Profile Picture"
              className="rounded-full"
            />
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit as any)} className="space-y-4">
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

        <Button
          className={`mb-4 w-full ${SHOPSTRBUTTONCLASSNAMES}`}
          type="submit"
          onKeyDown={(e: any) => {
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

export default BuyerProfileForm;
