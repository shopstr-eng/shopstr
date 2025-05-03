import React, { useEffect, useState, useContext, useMemo } from "react";
import { useForm, Controller } from "react-hook-form";
import { Button, Textarea, Input, Image, Card, Tooltip } from "@nextui-org/react";
import { ArrowUpOnSquareIcon } from "@heroicons/react/24/outline";

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

const ShopSettingsPage = () => {
  const { nostr } = useContext(NostrContext);
  const [isUploadingShopSettings, setIsUploadingShopSettings] = useState(false);
  const [isFetchingShop, setIsFetchingShop] = useState(false);

  const { signer, pubkey: userPubkey } = useContext(SignerContext);

  const shopContext = useContext(ShopMapContext);
  const { handleSubmit, control, reset, watch, setValue } = useForm({
    defaultValues: {
      banner: "",
      picture: "",
      name: "",
      about: "",
    },
  });

  const watchBanner = watch("banner");
  const watchPicture = watch("picture");
  const defaultImage = "/shopstr-2000x2000.png";

  useEffect(() => {
    setIsFetchingShop(true);
    const shopMap = shopContext.shopData;

    const shop = shopMap.has(userPubkey!)
      ? shopMap.get(userPubkey!)
      : undefined;
    if (shop) {
      const mappedContent = {
        name: shop.content.name,
        about: shop.content.about,
        picture: shop.content.ui.picture,
        banner: shop.content.ui.banner,
      };
      reset(mappedContent);
    }
    setIsFetchingShop(false);
  }, [shopContext, userPubkey, reset]);

  const onSubmit = async (data: { [x: string]: string }) => {
    setIsUploadingShopSettings(true);
    const transformedData = {
      name: data.name || "",
      about: data.about || "",
      ui: {
        picture: data.picture || "",
        banner: data.banner || "",
        theme: "",
        darkMode: false,
      },
      merchants: [userPubkey!],
    };
    await createNostrShopEvent(
      nostr!,
      signer!,
      userPubkey!,
      JSON.stringify(transformedData)
    );
    shopContext.updateShopData({
      pubkey: userPubkey!,
      content: transformedData,
      created_at: 0,
    });
    setIsUploadingShopSettings(false);
  };

  const buttonClassName = useMemo(() => {
    return `w-full ${SHOPSTRBUTTONCLASSNAMES} hover:opacity-90 transition-opacity duration-200`;
  }, []);

  return (
    <>
      <div className="flex min-h-screen flex-col bg-light-bg pt-24 dark:bg-dark-bg md:pb-20">
        <div className="mx-auto h-full w-full px-4 lg:w-1/2">
          <SettingsBreadCrumbs />
          {isFetchingShop ? (
            <div className="flex h-64 items-center justify-center">
              <ShopstrSpinner />
            </div>
          ) : (
            <Card className="overflow-hidden bg-light-fg dark:bg-dark-fg w-full p-0">
              {/* Banner and Profile Icon */}
              <div className="relative h-48 w-full">
                {watchBanner ? (
                  <Image
                    alt="Shop banner image"
                    src={watchBanner}
                    className="h-48 w-full object-cover object-center"
                  />
                ) : (
                  <div className="h-48 w-full bg-gradient-to-r from-gray-400/50 to-gray-500/50 dark:from-gray-700/50 dark:to-gray-800/50" />
                )}
                <Tooltip content="Upload a banner image for your shop" placement="bottom">
                  <FileUploaderButton
                    isIconOnly={false}
                    className={`absolute bottom-5 right-5 z-20 ${SHOPSTRBUTTONCLASSNAMES}`}
                    imgCallbackOnUpload={(imgUrl) => setValue("banner", imgUrl)}
                  >
                    Upload Banner
                  </FileUploaderButton>
                </Tooltip>
                {/* Profile Icon */}
                <div className="absolute left-1/2 bottom-[-3rem] z-30 -translate-x-1/2">
                  <div className="relative h-24 w-24 rounded-full border-4 border-light-fg dark:border-dark-fg shadow-lg">
                    <Tooltip content="Upload a profile picture for your shop" placement="bottom">
                      <FileUploaderButton
                        isIconOnly
                        className={`absolute bottom-[-0.5rem] right-[-0.5rem] z-20 ${SHOPSTRBUTTONCLASSNAMES}`}
                        imgCallbackOnUpload={(imgUrl) => setValue("picture", imgUrl)}
                      >
                        <ArrowUpOnSquareIcon className="h-6 w-6" />
                      </FileUploaderButton>
                    </Tooltip>
                    <Image
                      src={watchPicture || defaultImage}
                      alt="shop logo"
                      className="rounded-full h-24 w-24 object-cover"
                    />
                  </div>
                </div>
              </div>
              {/* Form */}
              <div className="pt-16 px-6 pb-6">
                <form onSubmit={handleSubmit(onSubmit as any)} className="space-y-6">
                  <Controller
                    name="name"
                    control={control}
                    rules={{
                      maxLength: {
                        value: 50,
                        message: "This input exceed maxLength of 50.",
                      },
                    }}
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
                          className="bg-light-fg dark:bg-dark-fg"
                          classNames={{
                            label: "text-light-text dark:text-dark-text text-lg",
                            input: "text-light-text dark:text-dark-text",
                            base: "border-light-text/20 dark:border-dark-text/20 hover:border-shopstr-purple dark:hover:border-shopstr-yellow"
                          }}
                          variant="bordered"
                          fullWidth={true}
                          label="Shop Name"
                          labelPlacement="outside"
                          isInvalid={isErrored}
                          errorMessage={errorMessage}
                          placeholder="Add your shop's name . . ."
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
                    rules={{
                      maxLength: {
                        value: 500,
                        message: "This input exceed maxLength of 500.",
                      },
                    }}
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
                          className="bg-light-fg dark:bg-dark-fg"
                          classNames={{
                            label: "text-light-text dark:text-dark-text text-lg",
                            input: "text-light-text dark:text-dark-text",
                            base: "border-light-text/20 dark:border-dark-text/20 hover:border-shopstr-purple dark:hover:border-shopstr-yellow"
                          }}
                          variant="bordered"
                          fullWidth={true}
                          label="About Your Shop"
                          labelPlacement="outside"
                          isInvalid={isErrored}
                          errorMessage={errorMessage}
                          placeholder="Tell us about your shop . . ."
                          onChange={onChange}
                          onBlur={onBlur}
                          value={value}
                          minRows={4}
                        />
                      );
                    }}
                  />

                  <Button
                    type="submit"
                    className={buttonClassName}
                    isLoading={isUploadingShopSettings}
                  >
                    Save Changes
                  </Button>
                </form>
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  );
};

export default ShopSettingsPage;
