import { useEffect, useState, useContext } from "react";
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

import { ShopMapContext } from "@/utils/context/context";
import { SHOPSTRBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";
import {
  SignerContext,
  NostrContext,
} from "@/components/utility-components/nostr-context-provider";
import { createNostrShopEvent } from "@/utils/nostr/nostr-helper-functions";
import { FileUploaderButton } from "@/components/utility-components/file-uploader";
import ShopstrSpinner from "@/components/utility-components/shopstr-spinner";
import currencySelection from "@/public/currencySelection.json";

interface ShopProfileFormProps {
  isOnboarding?: boolean;
}

const CURRENCY_OPTIONS = Object.keys(currencySelection);

const ShopProfileForm = ({ isOnboarding = false }: ShopProfileFormProps) => {
  const router = useRouter();
  const { nostr } = useContext(NostrContext);
  const [isUploadingShopProfile, setIsUploadingShopProfile] = useState(false);
  const [isFetchingShop, setIsFetchingShop] = useState(false);
  const [freeShippingThreshold, setFreeShippingThreshold] =
    useState<string>("");
  const [freeShippingCurrency, setFreeShippingCurrency] =
    useState<string>("USD");

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
      if (
        shop.content.freeShippingThreshold !== undefined &&
        shop.content.freeShippingThreshold > 0
      ) {
        setFreeShippingThreshold(String(shop.content.freeShippingThreshold));
      }
      if (shop.content.freeShippingCurrency) {
        setFreeShippingCurrency(shop.content.freeShippingCurrency);
      }
    }
    setIsFetchingShop(false);
  }, [shopContext, userPubkey, reset]);

  const onSubmit = async (data: { [x: string]: string }) => {
    setIsUploadingShopProfile(true);
    const thresholdValue = freeShippingThreshold
      ? parseFloat(freeShippingThreshold)
      : undefined;
    const transformedData: any = {
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
    if (thresholdValue && thresholdValue > 0) {
      transformedData.freeShippingThreshold = thresholdValue;
      transformedData.freeShippingCurrency = freeShippingCurrency;
    }
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

    if (isOnboarding) {
      router.push("/marketplace");
    }
  };

  if (isFetchingShop) {
    return <ShopstrSpinner />;
  }

  return (
    <>
      <div className="mb-20 h-40 rounded-lg bg-light-fg dark:bg-dark-fg">
        <div className="relative flex h-40 items-center justify-center rounded-lg bg-shopstr-purple-light dark:bg-dark-fg">
          {watchBanner && (
            <Image
              alt={"Shop banner image"}
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
          <div className="relative z-50 mt-[-3rem] h-24 w-24">
            <div className="">
              <FileUploaderButton
                isIconOnly={true}
                className={`absolute bottom-[-0.5rem] right-[-0.5rem] z-20 ${SHOPSTRBUTTONCLASSNAMES}`}
                imgCallbackOnUpload={(imgUrl) => setValue("picture", imgUrl)}
              />
              {watchPicture ? (
                <Image
                  src={watchPicture}
                  alt="shop logo"
                  className="rounded-full"
                />
              ) : (
                <Image
                  src={defaultImage}
                  alt="shop logo"
                  className="rounded-full"
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
            const errorMessage: string = error?.message ? error.message : "";
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
            const errorMessage: string = error?.message ? error.message : "";
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
                onChange={onChange}
                onBlur={onBlur}
                value={value}
              />
            );
          }}
        />

        <div className="pb-4">
          <label className="mb-2 block text-lg text-light-text dark:text-dark-text">
            Free Shipping Threshold
          </label>
          <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">
            Set a minimum order amount to offer free shipping. When a
            buyer&apos;s order total from your shop reaches this amount,
            shipping costs will be waived.
          </p>
          <div className="flex gap-3">
            <div className="flex-1">
              <Input
                className="text-light-text dark:text-dark-text"
                variant="bordered"
                fullWidth={true}
                type="number"
                min="0"
                step="0.01"
                placeholder="e.g. 50.00"
                value={freeShippingThreshold}
                onChange={(e) => setFreeShippingThreshold(e.target.value)}
              />
            </div>
            <div className="w-32">
              <Select
                variant="bordered"
                selectedKeys={[freeShippingCurrency]}
                onChange={(e) => {
                  if (e.target.value) setFreeShippingCurrency(e.target.value);
                }}
                aria-label="Currency"
                className="text-light-text dark:text-dark-text"
              >
                {CURRENCY_OPTIONS.map((currency) => (
                  <SelectItem key={currency} value={currency}>
                    {currency}
                  </SelectItem>
                ))}
              </Select>
            </div>
          </div>
          {freeShippingThreshold && parseFloat(freeShippingThreshold) > 0 && (
            <p className="mt-2 text-sm text-green-600 dark:text-green-400">
              Buyers will get free shipping on orders of{" "}
              {parseFloat(freeShippingThreshold).toFixed(2)}{" "}
              {freeShippingCurrency} or more from your shop.
            </p>
          )}
        </div>

        <Button
          className={`mb-10 w-full ${SHOPSTRBUTTONCLASSNAMES}`}
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
  );
};

export default ShopProfileForm;
