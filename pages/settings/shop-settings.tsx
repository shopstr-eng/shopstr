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
  }, [shopContext, userPubkey, userPubkey]);

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
            <Card className="p-6 shadow-md bg-light-fg dark:bg-dark-fg rounded-xl transition-all duration-300">
              <h1 className="text-2xl font-bold mb-6 text-center text-light-text dark:text-dark-text">Shop Settings</h1>
              
              <div className="mb-10 overflow-hidden rounded-lg bg-gradient-to-r from-shopstr-purple-light to-shopstr-purple dark:from-shopstr-yellow-light dark:to-shopstr-yellow">
                <div className="relative flex h-48 items-center justify-center rounded-lg bg-light-fg bg-opacity-10 dark:bg-dark-fg dark:bg-opacity-10">
                  {watchBanner && (
                    <Image
                      alt={"Shop banner image"}
                      src={watchBanner}
                      className="h-48 w-full rounded-lg object-cover object-center transition-transform duration-500 hover:scale-105"
                    />
                  )}
                  <Tooltip content="Upload a banner image for your shop" placement="bottom">
                    <FileUploaderButton
                      isIconOnly={false}
                      className={`absolute bottom-5 right-5 z-20 border-2 border-white bg-shopstr-purple shadow-md hover:shadow-lg transition-all duration-200 ${SHOPSTRBUTTONCLASSNAMES}`}
                      imgCallbackOnUpload={(imgUrl) => setValue("banner", imgUrl)}
                    >
                      Upload Banner
                    </FileUploaderButton>
                  </Tooltip>
                </div>
                <div className="flex items-center justify-center">
                  <div className="relative z-50 mt-[-3rem] h-24 w-24 rounded-full border-4 border-light-fg dark:border-dark-fg shadow-lg transition-transform duration-300 hover:scale-105">
                    <div className="">
                      <Tooltip content="Upload a profile picture for your shop" placement="bottom">
                        <FileUploaderButton
                          isIconOnly
                          className={`absolute bottom-[-0.5rem] right-[-0.5rem] z-20 hover:shadow-lg transition-all duration-200 ${SHOPSTRBUTTONCLASSNAMES}`}
                          imgCallbackOnUpload={(imgUrl) =>
                            setValue("picture", imgUrl)
                          }
                        >
                          <ArrowUpOnSquareIcon className="h-6 w-6" />
                        </FileUploaderButton>
                      </Tooltip>
                      {watchPicture ? (
                        <Image
                          src={watchPicture}
                          alt="shop logo"
                          className="rounded-full h-24 w-24 object-cover"
                        />
                      ) : (
                        <Image
                          src={defaultImage}
                          alt="shop logo"
                          className="rounded-full h-24 w-24 object-cover"
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>

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
                        className="pb-4 text-light-text dark:text-dark-text"
                        classNames={{
                          label: "text-light-text dark:text-dark-text text-lg",
                        }}
                        variant="bordered"
                        fullWidth={true}
                        label="Shop Name"
                        labelPlacement="outside"
                        isInvalid={isErrored}
                        errorMessage={errorMessage}
                        placeholder="Add your shop's name . . ."
                        // controller props
                        onChange={onChange} // send value to hook form
                        onBlur={onBlur} // notify when input is touched/blur
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
                        className="pb-4 text-light-text dark:text-dark-text"
                        classNames={{
                          label: "text-light-text dark:text-dark-text text-lg",
                        }}
                        variant="bordered"
                        fullWidth={true}
                        placeholder="Add something about your shop . . ."
                        isInvalid={isErrored}
                        errorMessage={errorMessage}
                        label="About"
                        labelPlacement="outside"
                        // controller props
                        onChange={onChange} // send value to hook form
                        onBlur={onBlur} // notify when input is touched/blur
                        value={value}
                      />
                    );
                  }}
                />

                <div className="pt-4">
                  <Button
                    className={buttonClassName}
                    type="submit"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault(); // Prevent default to avoid submitting the form again
                        handleSubmit(onSubmit as any)(); // Programmatic submit
                      }
                    }}
                    isDisabled={isUploadingShopSettings}
                    isLoading={isUploadingShopSettings}
                    size="lg"
                    radius="md"
                  >
                    {isUploadingShopSettings ? "Saving..." : "Save Shop Settings"}
                  </Button>
                </div>
              </form>
            </Card>
          )}
        </div>
      </div>
    </>
  );
};

export default ShopSettingsPage;
