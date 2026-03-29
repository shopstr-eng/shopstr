import { useEffect, useState, useContext, useMemo } from "react";
import { useRouter } from "next/router";
import { useForm, Controller } from "react-hook-form";
import { Button, Input, Image } from "@nextui-org/react";
import { ProfileMapContext } from "@/utils/context/context";
import {
  BLUEBUTTONCLASSNAMES,
  WHITEBUTTONCLASSNAMES,
} from "@/utils/STATIC-VARIABLES";
import {
  SignerContext,
  NostrContext,
} from "@/components/utility-components/nostr-context-provider";
import { createNostrProfileEvent } from "@/utils/nostr/nostr-helper-functions";
import { FileUploaderButton } from "@/components/utility-components/file-uploader";
import MilkMarketSpinner from "@/components/utility-components/mm-spinner";

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
      banner: "",
      picture: "",
      display_name: "",
      name: "",
      about: "",
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
        banner: profile.content.banner || "",
        picture: profile.content.picture || "",
        display_name: profile.content.display_name || "",
        name: profile.content.name || "",
        about: profile.content.about || "",
      });
    }
    setIsFetchingProfile(false);
  }, [profileContext, userPubkey, reset]);

  const onSubmit = async (data: { [x: string]: string }) => {
    if (!userPubkey) throw new Error("pubkey is undefined");
    setIsUploadingProfile(true);

    // Preserve existing profile data and only update buyer-relevant fields
    const profileMap = profileContext.profileData;
    const existingProfile = profileMap.has(userPubkey)
      ? profileMap.get(userPubkey)?.content
      : {};

    const updatedData = {
      ...existingProfile,
      banner: data.banner || "",
      picture: data.picture || "",
      display_name: data.display_name || "",
      name: data.name || "",
      about: data.about || "",
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
      router.push("/marketplace");
    }
  };

  if (isFetchingProfile) {
    return <MilkMarketSpinner />;
  }

  return (
    <>
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
            className={`!min-w-10 absolute bottom-0 right-0 z-20 !h-10 !w-10 ${WHITEBUTTONCLASSNAMES}`}
            imgCallbackOnUpload={(imgUrl) => setValue("picture", imgUrl)}
          />
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit as any)} className="space-y-6">
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

        <Button
          className={`mb-10 w-full ${BLUEBUTTONCLASSNAMES}`}
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

export default BuyerProfileForm;
