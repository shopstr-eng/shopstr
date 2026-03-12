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

import { ShopMapContext, ProfileMapContext } from "@/utils/context/context";
import {
  WHITEBUTTONCLASSNAMES,
  BLUEBUTTONCLASSNAMES,
} from "@/utils/STATIC-VARIABLES";
import {
  SignerContext,
  NostrContext,
} from "@/components/utility-components/nostr-context-provider";
import { createNostrShopEvent } from "@/utils/nostr/nostr-helper-functions";
import { FileUploaderButton } from "@/components/utility-components/file-uploader";
import MilkMarketSpinner from "@/components/utility-components/mm-spinner";
import currencySelection from "@/public/currencySelection.json";
import { StorefrontConfig, StorefrontColorScheme } from "@/utils/types/types";

interface ShopProfileFormProps {
  isOnboarding?: boolean;
}

const CURRENCY_OPTIONS = Object.keys(currencySelection);

const DEFAULT_COLORS: StorefrontColorScheme = {
  primary: "#FFD23F",
  secondary: "#1E293B",
  accent: "#3B82F6",
  background: "#FFFFFF",
  text: "#000000",
};

const COLOR_PRESETS: { name: string; colors: StorefrontColorScheme }[] = [
  {
    name: "Default",
    colors: {
      primary: "#FFD23F",
      secondary: "#1E293B",
      accent: "#3B82F6",
      background: "#FFFFFF",
      text: "#000000",
    },
  },
  {
    name: "Forest",
    colors: {
      primary: "#22C55E",
      secondary: "#14532D",
      accent: "#86EFAC",
      background: "#F0FDF4",
      text: "#14532D",
    },
  },
  {
    name: "Ocean",
    colors: {
      primary: "#0EA5E9",
      secondary: "#0C4A6E",
      accent: "#38BDF8",
      background: "#F0F9FF",
      text: "#0C4A6E",
    },
  },
  {
    name: "Sunset",
    colors: {
      primary: "#F97316",
      secondary: "#7C2D12",
      accent: "#FB923C",
      background: "#FFF7ED",
      text: "#431407",
    },
  },
  {
    name: "Berry",
    colors: {
      primary: "#A855F7",
      secondary: "#3B0764",
      accent: "#C084FC",
      background: "#FAF5FF",
      text: "#3B0764",
    },
  },
  {
    name: "Earth",
    colors: {
      primary: "#A16207",
      secondary: "#422006",
      accent: "#CA8A04",
      background: "#FEFCE8",
      text: "#422006",
    },
  },
  {
    name: "Dark",
    colors: {
      primary: "#FFD23F",
      secondary: "#111827",
      accent: "#60A5FA",
      background: "#1F2937",
      text: "#F9FAFB",
    },
  },
];

const ShopProfileForm = ({ isOnboarding = false }: ShopProfileFormProps) => {
  const router = useRouter();
  const { nostr } = useContext(NostrContext);
  const [isUploadingShopProfile, setIsUploadingShopProfile] = useState(false);
  const [isFetchingShop, setIsFetchingShop] = useState(false);
  const [notificationEmail, setNotificationEmail] = useState("");
  const [freeShippingThreshold, setFreeShippingThreshold] =
    useState<string>("");
  const [freeShippingCurrency, setFreeShippingCurrency] =
    useState<string>("USD");
  const [paymentMethodDiscounts, setPaymentMethodDiscounts] = useState<{
    [method: string]: string;
  }>({});

  const [shopSlug, setShopSlug] = useState("");
  const [slugStatus, setSlugStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [slugError, setSlugError] = useState("");
  const [colorScheme, setColorScheme] =
    useState<StorefrontColorScheme>(DEFAULT_COLORS);
  const [productLayout, setProductLayout] = useState<
    "grid" | "list" | "featured"
  >("grid");
  const [landingPageStyle, setLandingPageStyle] = useState<
    "classic" | "hero" | "minimal"
  >("hero");
  const [customDomain, setCustomDomain] = useState("");
  const [domainInfo, setDomainInfo] = useState<{
    domain: string;
    verified: boolean;
  } | null>(null);

  const { signer, pubkey: userPubkey } = useContext(SignerContext);

  const shopContext = useContext(ShopMapContext);
  const profileContext = useContext(ProfileMapContext);
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
  const defaultImage = "/milk-market.png";

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
      if (shop.content.paymentMethodDiscounts) {
        const stringDiscounts: { [method: string]: string } = {};
        Object.entries(shop.content.paymentMethodDiscounts).forEach(
          ([key, value]) => {
            if (value > 0) {
              stringDiscounts[key] = String(value);
            }
          }
        );
        setPaymentMethodDiscounts(stringDiscounts);
      }
      if (shop.content.storefront) {
        const sf = shop.content.storefront;
        if (sf.shopSlug) setShopSlug(sf.shopSlug);
        if (sf.colorScheme)
          setColorScheme({ ...DEFAULT_COLORS, ...sf.colorScheme });
        if (sf.productLayout) setProductLayout(sf.productLayout);
        if (sf.landingPageStyle) setLandingPageStyle(sf.landingPageStyle);
      }
    }
    setIsFetchingShop(false);
  }, [shopContext, userPubkey, reset]);

  useEffect(() => {
    if (userPubkey) {
      fetch(`/api/storefront/custom-domain?pubkey=${userPubkey}`)
        .then((res) => res.json())
        .then((data) => {
          if (data && data.domain) {
            setCustomDomain(data.domain);
            setDomainInfo(data);
          }
        })
        .catch(() => {});
    }
  }, [userPubkey]);

  useEffect(() => {
    if (userPubkey) {
      fetch(`/api/email/notification-email?pubkey=${userPubkey}&role=seller`)
        .then((res) => res.json())
        .then((data) => {
          if (data.email) {
            setNotificationEmail(data.email);
          }
        })
        .catch(() => {});
    }
  }, [userPubkey]);

  const handleSaveSlug = async () => {
    if (!shopSlug || !userPubkey) return;
    setSlugStatus("saving");
    setSlugError("");
    try {
      const res = await fetch("/api/storefront/register-slug", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pubkey: userPubkey, slug: shopSlug }),
      });
      const data = await res.json();
      if (res.ok) {
        setShopSlug(data.slug);
        setSlugStatus("saved");
      } else {
        setSlugError(data.error || "Failed to save");
        setSlugStatus("error");
      }
    } catch {
      setSlugError("Failed to save");
      setSlugStatus("error");
    }
  };

  const handleSaveCustomDomain = async () => {
    if (!customDomain || !userPubkey) return;
    try {
      const res = await fetch("/api/storefront/custom-domain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pubkey: userPubkey, domain: customDomain }),
      });
      const data = await res.json();
      if (res.ok) {
        setDomainInfo({ domain: data.domain, verified: data.verified });
      }
    } catch {}
  };

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
    const parsedDiscounts: { [method: string]: number } = {};
    Object.entries(paymentMethodDiscounts).forEach(([key, value]) => {
      const num = parseFloat(value);
      if (!isNaN(num) && num > 0 && num <= 100) {
        parsedDiscounts[key] = num;
      }
    });
    if (Object.keys(parsedDiscounts).length > 0) {
      transformedData.paymentMethodDiscounts = parsedDiscounts;
    }
    const storefrontConfig: StorefrontConfig = {
      colorScheme,
      productLayout,
      landingPageStyle,
      shopSlug: shopSlug || undefined,
      customDomain: customDomain || undefined,
    };
    transformedData.storefront = storefrontConfig;

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

    if (shopSlug) {
      handleSaveSlug();
    }

    if (notificationEmail) {
      try {
        await fetch("/api/email/notification-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pubkey: userPubkey,
            email: notificationEmail,
            role: "seller",
          }),
        });
      } catch (e) {}
    }

    setIsUploadingShopProfile(false);

    if (isOnboarding) {
      router.push("/onboarding/stripe-connect");
    }
  };

  if (isFetchingShop) {
    return <MilkMarketSpinner />;
  }

  return (
    <>
      <div className="mb-8">
        <div className="relative flex h-48 items-center justify-center overflow-hidden rounded-xl border-3 border-black bg-primary-blue">
          {watchBanner && (
            <Image
              alt={"Shop Banner Image"}
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

        <div className="flex items-center justify-center">
          <div className="relative mt-[-4rem] h-32 w-32">
            <div className="relative h-full w-full overflow-hidden rounded-full border-4 border-black bg-white">
              {watchPicture ? (
                <Image
                  src={watchPicture}
                  alt="Shop Logo"
                  className="h-full w-full rounded-full object-cover"
                  classNames={{
                    wrapper: "!max-w-full w-full h-full",
                  }}
                />
              ) : (
                <Image
                  src={defaultImage}
                  alt="Shop Logo"
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
            const errorMessage: string = error?.message ? error.message : "";
            return (
              <div>
                <label className="mb-2 block text-base font-bold text-black">
                  Shop Name
                </label>
                <Input
                  classNames={{
                    inputWrapper:
                      "border-3 border-black rounded-lg bg-white shadow-none hover:bg-white data-[hover=true]:bg-white group-data-[focus=true]:border-4 group-data-[focus=true]:border-black",
                    input: "text-base",
                  }}
                  variant="bordered"
                  fullWidth={true}
                  isInvalid={isErrored}
                  errorMessage={errorMessage}
                  placeholder="Add your shop's name..."
                  onChange={onChange}
                  onBlur={onBlur}
                  value={value}
                />
              </div>
            );
          }}
        />

        <div>
          <label className="mb-2 block text-base font-bold text-black">
            Notification Email
          </label>
          <Input
            classNames={{
              inputWrapper:
                "border-3 border-black rounded-lg bg-white shadow-none hover:bg-white data-[hover=true]:bg-white group-data-[focus=true]:border-4 group-data-[focus=true]:border-black",
              input: "text-base",
            }}
            variant="bordered"
            fullWidth={true}
            type="email"
            placeholder="Email for order notifications..."
            value={notificationEmail}
            onChange={(e) => setNotificationEmail(e.target.value)}
          />
          <p className="mt-1 text-xs text-gray-500">
            Receive email alerts when customers place orders
          </p>
        </div>

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
              <div>
                <label className="mb-2 block text-base font-bold text-black">
                  About
                </label>
                <Textarea
                  classNames={{
                    inputWrapper:
                      "border-3 border-black rounded-lg bg-white shadow-none hover:bg-white data-[hover=true]:bg-white group-data-[focus=true]:border-4 group-data-[focus=true]:border-black",
                    input: "text-base",
                  }}
                  variant="bordered"
                  fullWidth={true}
                  minRows={4}
                  placeholder="Add something about your shop..."
                  isInvalid={isErrored}
                  errorMessage={errorMessage}
                  onChange={onChange}
                  onBlur={onBlur}
                  value={value}
                />
              </div>
            );
          }}
        />

        <div>
          <label className="mb-2 block text-base font-bold text-black">
            Free Shipping Threshold
          </label>
          <p className="mb-3 text-sm text-gray-500">
            Set a minimum order amount to offer free shipping. When a buyer's
            order total from your shop reaches this amount, shipping costs will
            be waived.
          </p>
          <div className="flex gap-3">
            <div className="flex-1">
              <Input
                classNames={{
                  inputWrapper:
                    "border-3 border-black rounded-lg bg-white shadow-none hover:bg-white data-[hover=true]:bg-white group-data-[focus=true]:border-4 group-data-[focus=true]:border-black",
                  input: "text-base",
                }}
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
                classNames={{
                  trigger:
                    "border-3 border-black rounded-lg bg-white shadow-none hover:bg-white data-[hover=true]:bg-white",
                  value: "text-base !text-black",
                  popoverContent: "border-2 border-black rounded-lg bg-white",
                  listbox: "!text-black",
                }}
                variant="bordered"
                selectedKeys={[freeShippingCurrency]}
                onChange={(e) => {
                  if (e.target.value) setFreeShippingCurrency(e.target.value);
                }}
                aria-label="Currency"
              >
                {CURRENCY_OPTIONS.map((currency) => (
                  <SelectItem
                    key={currency}
                    value={currency}
                    className="text-black"
                  >
                    {currency}
                  </SelectItem>
                ))}
              </Select>
            </div>
          </div>
          {freeShippingThreshold && parseFloat(freeShippingThreshold) > 0 && (
            <p className="mt-2 text-sm text-green-600">
              Buyers will get free shipping on orders of{" "}
              {parseFloat(freeShippingThreshold).toFixed(2)}{" "}
              {freeShippingCurrency} or more from your shop.
            </p>
          )}
        </div>

        <div>
          <label className="mb-2 block text-base font-bold text-black">
            Payment Method Discounts
          </label>
          <p className="mb-3 text-sm text-gray-500">
            Offer flat percentage discounts for specific payment methods. Buyers
            will see the discounted price on each payment button at checkout.
          </p>
          <div className="space-y-3">
            {[
              { key: "bitcoin", label: "Bitcoin (Lightning / Cashu / NWC)" },
              { key: "stripe", label: "Card (Stripe)" },
              ...(userPubkey
                ? Object.keys(
                    profileContext.profileData.get(userPubkey)?.content
                      ?.fiat_options || {}
                  ).map((key) => ({
                    key,
                    label:
                      {
                        cash: "Cash",
                        venmo: "Venmo",
                        zelle: "Zelle",
                        cashapp: "Cash App",
                        applepay: "Apple Pay",
                        googlepay: "Google Pay",
                        paypal: "PayPal",
                      }[key] || key,
                  }))
                : []),
            ].map((method) => (
              <div key={method.key} className="flex items-center gap-3">
                <span className="w-56 text-sm font-medium text-black">
                  {method.label}
                </span>
                <div className="flex-1">
                  <Input
                    classNames={{
                      inputWrapper:
                        "border-3 border-black rounded-lg bg-white shadow-none hover:bg-white data-[hover=true]:bg-white group-data-[focus=true]:border-4 group-data-[focus=true]:border-black",
                      input: "text-base",
                    }}
                    variant="bordered"
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    placeholder="0"
                    value={paymentMethodDiscounts[method.key] || ""}
                    onChange={(e) => {
                      setPaymentMethodDiscounts((prev) => ({
                        ...prev,
                        [method.key]: e.target.value,
                      }));
                    }}
                    endContent={
                      <span className="text-sm text-gray-500">%</span>
                    }
                  />
                </div>
              </div>
            ))}
          </div>
          {Object.entries(paymentMethodDiscounts).some(
            ([, v]) => parseFloat(v) > 0
          ) && (
            <p className="mt-2 text-sm text-green-600">
              Discounts will be shown to buyers on the payment buttons at
              checkout.
            </p>
          )}
        </div>

        {!isOnboarding && (
          <>
            <div className="border-t-4 border-black pt-6">
              <h2 className="mb-4 text-xl font-bold text-black">
                Storefront Settings
              </h2>
              <p className="mb-6 text-sm text-gray-500">
                Customize your standalone shop page. Buyers can visit your
                storefront directly for a branded shopping experience.
              </p>

              <div className="mb-6">
                <label className="mb-2 block text-base font-bold text-black">
                  Shop URL Slug
                </label>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <Input
                      classNames={{
                        inputWrapper:
                          "border-3 border-black rounded-lg bg-white shadow-none hover:bg-white data-[hover=true]:bg-white group-data-[focus=true]:border-4 group-data-[focus=true]:border-black",
                        input: "text-base",
                      }}
                      variant="bordered"
                      fullWidth={true}
                      placeholder="my-farm-shop"
                      value={shopSlug}
                      onChange={(e) => {
                        setShopSlug(
                          e.target.value
                            .toLowerCase()
                            .replace(/[^a-z0-9-]/g, "-")
                        );
                        setSlugStatus("idle");
                      }}
                      startContent={
                        <span className="text-sm text-gray-400">
                          milk.market/shop/
                        </span>
                      }
                    />
                  </div>
                </div>
                {slugStatus === "saved" && (
                  <p className="mt-1 text-sm text-green-600">Shop URL saved!</p>
                )}
                {slugStatus === "error" && (
                  <p className="mt-1 text-sm text-red-600">{slugError}</p>
                )}
                {shopSlug && slugStatus !== "error" && (
                  <p className="mt-1 text-xs text-gray-400">
                    Your shop will also be available at {shopSlug}.milk.market
                  </p>
                )}
              </div>

              <div className="mb-6">
                <label className="mb-2 block text-base font-bold text-black">
                  Color Scheme
                </label>
                <div className="mb-3 flex flex-wrap gap-2">
                  {COLOR_PRESETS.map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => setColorScheme(preset.colors)}
                      className={`flex items-center gap-2 rounded-lg border-2 px-3 py-2 text-sm font-medium transition-all ${
                        JSON.stringify(colorScheme) ===
                        JSON.stringify(preset.colors)
                          ? "border-black shadow-neo"
                          : "border-gray-300 hover:border-black"
                      }`}
                    >
                      <div className="flex gap-1">
                        <div
                          className="h-4 w-4 rounded-full border"
                          style={{ backgroundColor: preset.colors.primary }}
                        />
                        <div
                          className="h-4 w-4 rounded-full border"
                          style={{ backgroundColor: preset.colors.secondary }}
                        />
                        <div
                          className="h-4 w-4 rounded-full border"
                          style={{ backgroundColor: preset.colors.accent }}
                        />
                      </div>
                      {preset.name}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                  {(
                    [
                      "primary",
                      "secondary",
                      "accent",
                      "background",
                      "text",
                    ] as const
                  ).map((key) => (
                    <div key={key}>
                      <label className="mb-1 block text-xs font-medium capitalize text-gray-500">
                        {key}
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={colorScheme[key]}
                          onChange={(e) =>
                            setColorScheme((prev) => ({
                              ...prev,
                              [key]: e.target.value,
                            }))
                          }
                          className="h-8 w-8 cursor-pointer rounded border-2 border-black"
                        />
                        <span className="text-xs text-gray-400">
                          {colorScheme[key]}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mb-6">
                <label className="mb-2 block text-base font-bold text-black">
                  Landing Page Style
                </label>
                <div className="flex flex-wrap gap-3">
                  {[
                    {
                      value: "hero" as const,
                      label: "Hero",
                      desc: "Large banner with shop info overlay",
                    },
                    {
                      value: "classic" as const,
                      label: "Classic",
                      desc: "Banner image with info below",
                    },
                    {
                      value: "minimal" as const,
                      label: "Minimal",
                      desc: "Clean, simple header",
                    },
                  ].map((style) => (
                    <button
                      key={style.value}
                      type="button"
                      onClick={() => setLandingPageStyle(style.value)}
                      className={`flex-1 rounded-lg border-2 p-4 text-left transition-all ${
                        landingPageStyle === style.value
                          ? "border-black shadow-neo"
                          : "border-gray-300 hover:border-black"
                      }`}
                    >
                      <span className="block text-sm font-bold text-black">
                        {style.label}
                      </span>
                      <span className="block text-xs text-gray-500">
                        {style.desc}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-6">
                <label className="mb-2 block text-base font-bold text-black">
                  Product Layout
                </label>
                <div className="flex flex-wrap gap-3">
                  {[
                    {
                      value: "grid" as const,
                      label: "Grid",
                      desc: "Products in a grid",
                    },
                    {
                      value: "list" as const,
                      label: "List",
                      desc: "Products in a list",
                    },
                    {
                      value: "featured" as const,
                      label: "Featured",
                      desc: "Hero product + grid",
                    },
                  ].map((layout) => (
                    <button
                      key={layout.value}
                      type="button"
                      onClick={() => setProductLayout(layout.value)}
                      className={`flex-1 rounded-lg border-2 p-4 text-left transition-all ${
                        productLayout === layout.value
                          ? "border-black shadow-neo"
                          : "border-gray-300 hover:border-black"
                      }`}
                    >
                      <span className="block text-sm font-bold text-black">
                        {layout.label}
                      </span>
                      <span className="block text-xs text-gray-500">
                        {layout.desc}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-6">
                <label className="mb-2 block text-base font-bold text-black">
                  Custom Domain
                </label>
                <p className="mb-2 text-sm text-gray-500">
                  Connect your own domain to your shop. Add a CNAME record
                  pointing to milk.market.
                </p>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <Input
                      classNames={{
                        inputWrapper:
                          "border-3 border-black rounded-lg bg-white shadow-none hover:bg-white data-[hover=true]:bg-white group-data-[focus=true]:border-4 group-data-[focus=true]:border-black",
                        input: "text-base",
                      }}
                      variant="bordered"
                      fullWidth={true}
                      placeholder="shop.yourdomain.com"
                      value={customDomain}
                      onChange={(e) => setCustomDomain(e.target.value)}
                    />
                  </div>
                  <Button
                    className={WHITEBUTTONCLASSNAMES}
                    type="button"
                    onPress={handleSaveCustomDomain}
                    isDisabled={!customDomain || !shopSlug}
                  >
                    {domainInfo ? "Update" : "Connect"}
                  </Button>
                </div>
                {!shopSlug && customDomain && (
                  <p className="mt-1 text-xs text-orange-600">
                    Set a shop URL slug first before connecting a domain.
                  </p>
                )}
                {domainInfo && (
                  <div className="mt-2 rounded-lg border-2 border-gray-200 bg-gray-50 p-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-block h-2 w-2 rounded-full ${
                          domainInfo.verified ? "bg-green-500" : "bg-yellow-500"
                        }`}
                      />
                      <span className="text-sm font-medium">
                        {domainInfo.domain} -{" "}
                        {domainInfo.verified
                          ? "Verified"
                          : "Pending verification"}
                      </span>
                    </div>
                    {!domainInfo.verified && (
                      <p className="mt-2 text-xs text-gray-500">
                        Add a CNAME record: <strong>{domainInfo.domain}</strong>{" "}
                        → <strong>milk.market</strong>
                      </p>
                    )}
                  </div>
                )}
              </div>

              {shopSlug && (
                <div className="rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-4">
                  <p className="text-sm font-medium text-gray-700">
                    Preview your storefront:
                  </p>
                  <a
                    href={`/shop/${shopSlug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-block text-sm font-bold text-primary-blue underline"
                  >
                    /shop/{shopSlug}
                  </a>
                </div>
              )}
            </div>
          </>
        )}

        <Button
          className={`w-full text-lg ${BLUEBUTTONCLASSNAMES}`}
          type="submit"
          size="lg"
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
