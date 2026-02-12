import React, { useEffect, useState, useContext } from "react";
import { useForm, Controller } from "react-hook-form";
import { Button, Textarea, Input, Image } from "@nextui-org/react";

import { SettingsBreadCrumbs } from "@/components/settings/settings-bread-crumbs";
import { ShopMapContext } from "@/utils/context/context";
import {
  SignerContext,
  NostrContext,
} from "@/components/utility-components/nostr-context-provider";
import { createNostrShopEvent } from "@/utils/nostr/nostr-helper-functions";
import { FileUploaderButton } from "@/components/utility-components/file-uploader";
import ShopstrSpinner from "@/components/utility-components/shopstr-spinner";
import { NEO_BTN } from "@/utils/STATIC-VARIABLES";

const ShopProfilePage = () => {
  const { nostr } = useContext(NostrContext);
  const [isUploadingShopProfile, setIsUploadingShopProfile] = useState(false);
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
    setIsUploadingShopProfile(true);
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
      JSON.stringify(transformedData)
    );
    shopContext.updateShopData({
      pubkey: userPubkey!,
      content: transformedData,
      created_at: 0,
    });
    setIsUploadingShopProfile(false);
  };

  return (
    <>
      <div className="relative flex min-h-screen flex-col bg-[#111] pt-24 selection:bg-yellow-400 selection:text-black md:pb-20">
        {/* Background Grid Pattern */}
        <div className="pointer-events-none absolute inset-0 z-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]"></div>

        <div className="relative z-10 mx-auto h-full w-full px-4 lg:w-1/2">
          <SettingsBreadCrumbs />
          {isFetchingShop ? (
            <ShopstrSpinner />
          ) : (
            <>
              <div className="mb-20 h-40 rounded-2xl border border-zinc-800 bg-[#161616] overflow-visible">
                <div className="relative flex h-40 items-center justify-center rounded-2xl bg-[#111]">
                  {watchBanner && (
                    <Image
                      alt={"Shop banner image"}
                      src={watchBanner}
                      className="h-40 w-full rounded-2xl object-cover"
                    />
                  )}
                  <FileUploaderButton
                    className={`${NEO_BTN} absolute bottom-4 right-4 z-20 h-10 px-4 text-xs`}
                    imgCallbackOnUpload={(imgUrl) => setValue("banner", imgUrl)}
                  >
                    Upload Banner
                  </FileUploaderButton>
                </div>
                <div className="flex items-center justify-center">
                  <div className="relative z-50 mt-[-3rem] h-28 w-28">
                    <div className="border-4 border-[#111] rounded-full">
                      <FileUploaderButton
                        isIconOnly={true}
                        className={`${NEO_BTN} absolute bottom-0 right-0 z-20 h-10 w-10 min-w-10 rounded-full p-0 border-white`}
                        imgCallbackOnUpload={(imgUrl) =>
                          setValue("picture", imgUrl)
                        }
                      />
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

              <form onSubmit={handleSubmit(onSubmit as any)}>
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
                        className="pb-6"
                        classNames={{
                          label: "text-zinc-400 font-bold uppercase tracking-wider text-sm",
                          input: "text-white",
                          inputWrapper: "border-zinc-700 bg-[#111] hover:border-zinc-500 group-data-[focus=true]:border-yellow-400 h-12",
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
                        className="pb-8"
                        classNames={{
                          label: "text-zinc-400 font-bold uppercase tracking-wider text-sm",
                          input: "text-white",
                          inputWrapper: "border-zinc-700 bg-[#111] hover:border-zinc-500 group-data-[focus=true]:border-yellow-400",
                        }}
                        variant="bordered"
                        fullWidth={true}
                        placeholder="Add something about your shop . . ."
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

                <Button
                  className={`${NEO_BTN} mb-10 h-14 w-full text-sm font-black tracking-widest`}
                  type="submit"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleSubmit(onSubmit as any)();
                    }
                  }}
                  isDisabled={isUploadingShopProfile}
                  isLoading={isUploadingShopProfile}
                >
                  Save Shop
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </>
  );
};

export default ShopProfilePage;
