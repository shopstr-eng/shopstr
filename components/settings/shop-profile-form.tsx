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
  Switch,
  Tabs,
  Tab,
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
import { StorefrontConfig, StorefrontColorScheme } from "@/utils/types/types";

interface ShopProfileFormProps {
  isOnboarding?: boolean;
}

const CURRENCY_OPTIONS = Object.keys(currencySelection);

const GOOGLE_FONTS = [
  { value: "", label: "Default" },
  { value: "Inter", label: "Inter" },
  { value: "Roboto", label: "Roboto" },
  { value: "Open Sans", label: "Open Sans" },
  { value: "Lato", label: "Lato" },
  { value: "Montserrat", label: "Montserrat" },
  { value: "Poppins", label: "Poppins" },
  { value: "Playfair Display", label: "Playfair Display" },
  { value: "Merriweather", label: "Merriweather" },
  { value: "Raleway", label: "Raleway" },
  { value: "Nunito", label: "Nunito" },
  { value: "Oswald", label: "Oswald" },
  { value: "Source Sans 3", label: "Source Sans 3" },
  { value: "PT Serif", label: "PT Serif" },
  { value: "Bitter", label: "Bitter" },
  { value: "Crimson Text", label: "Crimson Text" },
];

const DEFAULT_COLORS: StorefrontColorScheme = {
  primary: "#FFD23F",
  secondary: "#1E293B",
  accent: "#3B82F6",
  background: "#FFFFFF",
  text: "#000000",
};

const SLUG_RESERVED = [
  "www",
  "api",
  "app",
  "admin",
  "mail",
  "ftp",
  "shop",
  "marketplace",
  "settings",
  "orders",
  "cart",
  "listing",
  "auth",
  "onboarding",
  "wallet",
  "communities",
  "help",
  "support",
  "blog",
  "docs",
  "status",
];

function sanitizeSlug(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 63);
}

const ShopProfileForm = ({ isOnboarding = false }: ShopProfileFormProps) => {
  const router = useRouter();
  const { nostr } = useContext(NostrContext);
  const [isUploadingShopProfile, setIsUploadingShopProfile] = useState(false);
  const [isFetchingShop, setIsFetchingShop] = useState(false);
  const [freeShippingThreshold, setFreeShippingThreshold] =
    useState<string>("");
  const [freeShippingCurrency, setFreeShippingCurrency] =
    useState<string>("USD");

  const [storefront, setStorefront] = useState<StorefrontConfig>({});
  const [colors, setColors] = useState<StorefrontColorScheme>(DEFAULT_COLORS);
  const [shopSlug, setShopSlug] = useState("");
  const [slugInput, setSlugInput] = useState("");
  const [slugStatus, setSlugStatus] = useState<
    "idle" | "checking" | "saved" | "error" | "taken"
  >("idle");
  const [slugMessage, setSlugMessage] = useState("");
  const [customDomain, setCustomDomain] = useState("");
  const [customDomainStatus, setCustomDomainStatus] = useState<
    "idle" | "saved" | "error"
  >("idle");
  const [customDomainMessage, setCustomDomainMessage] = useState("");
  const [customDomainInstructions, setCustomDomainInstructions] =
    useState<any>(null);
  const [isSavingStorefront, setIsSavingStorefront] = useState(false);

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
      reset({
        name: shop.content.name,
        about: shop.content.about,
        picture: shop.content.ui.picture,
        banner: shop.content.ui.banner,
      });
      if (
        shop.content.freeShippingThreshold !== undefined &&
        shop.content.freeShippingThreshold > 0
      ) {
        setFreeShippingThreshold(String(shop.content.freeShippingThreshold));
      }
      if (shop.content.freeShippingCurrency) {
        setFreeShippingCurrency(shop.content.freeShippingCurrency);
      }
      if (shop.content.storefront) {
        const sf = shop.content.storefront;
        setStorefront(sf);
        if (sf.colorScheme) {
          setColors({ ...DEFAULT_COLORS, ...sf.colorScheme });
        }
        if (sf.shopSlug) {
          setShopSlug(sf.shopSlug);
          setSlugInput(sf.shopSlug);
        }
      }
    }
    setIsFetchingShop(false);

    if (userPubkey) {
      fetch(
        `/api/storefront/custom-domain?pubkey=${encodeURIComponent(userPubkey)}`
      )
        .then((r) => r.json())
        .then((data) => {
          if (data?.domain) {
            setCustomDomain(data.domain);
          }
        })
        .catch(() => {});
    }
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
    if (Object.keys(storefront).length > 0) {
      transformedData.storefront = storefront;
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

  const registerSlug = async () => {
    const s = sanitizeSlug(slugInput);
    if (!s || s.length < 2) {
      setSlugStatus("error");
      setSlugMessage("Slug must be at least 2 characters");
      return;
    }
    if (SLUG_RESERVED.includes(s)) {
      setSlugStatus("error");
      setSlugMessage("This name is reserved");
      return;
    }
    setSlugStatus("checking");
    setSlugMessage("Saving...");
    try {
      const res = await fetch("/api/storefront/register-slug", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pubkey: userPubkey, slug: s }),
      });
      const data = await res.json();
      if (res.ok) {
        setShopSlug(data.slug);
        setSlugInput(data.slug);
        setStorefront((prev) => ({ ...prev, shopSlug: data.slug }));
        setSlugStatus("saved");
        setSlugMessage(`✓ Your storefront is at /shop/${data.slug}`);
      } else if (res.status === 409) {
        setSlugStatus("taken");
        setSlugMessage("This name is already taken");
      } else {
        setSlugStatus("error");
        setSlugMessage(data.error || "Failed to save slug");
      }
    } catch {
      setSlugStatus("error");
      setSlugMessage("Failed to connect to server");
    }
  };

  const saveCustomDomain = async () => {
    if (!shopSlug) {
      setCustomDomainStatus("error");
      setCustomDomainMessage("Set up a shop URL first");
      return;
    }
    if (!customDomain || !customDomain.includes(".")) {
      setCustomDomainStatus("error");
      setCustomDomainMessage("Enter a valid domain");
      return;
    }
    try {
      const res = await fetch("/api/storefront/custom-domain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pubkey: userPubkey, domain: customDomain }),
      });
      const data = await res.json();
      if (res.ok) {
        setCustomDomainStatus("saved");
        setCustomDomainMessage(
          "Domain saved! Follow the DNS instructions below."
        );
        setCustomDomainInstructions(data.instructions);
      } else {
        setCustomDomainStatus("error");
        setCustomDomainMessage(data.error || "Failed to save domain");
      }
    } catch {
      setCustomDomainStatus("error");
      setCustomDomainMessage("Failed to connect to server");
    }
  };

  const saveStorefront = async (updates: Partial<StorefrontConfig>) => {
    const newSf = { ...storefront, ...updates };
    setStorefront(newSf);
    setIsSavingStorefront(true);

    const shopMap = shopContext.shopData;
    const shop = shopMap.has(userPubkey!)
      ? shopMap.get(userPubkey!)
      : undefined;

    const transformedData: any = {
      name: shop?.content?.name || "",
      about: shop?.content?.about || "",
      ui: shop?.content?.ui || {
        picture: "",
        banner: "",
        theme: "",
        darkMode: false,
      },
      merchants: [userPubkey!],
      storefront: newSf,
    };
    if (shop?.content?.freeShippingThreshold) {
      transformedData.freeShippingThreshold =
        shop.content.freeShippingThreshold;
      transformedData.freeShippingCurrency = shop.content.freeShippingCurrency;
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
    setIsSavingStorefront(false);
  };

  if (isFetchingShop) {
    return <ShopstrSpinner />;
  }

  return (
    <>
      <Tabs aria-label="Shop settings" className="mb-4 w-full">
        <Tab key="basic" title="Basic Info">
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
                    imgCallbackOnUpload={(imgUrl) =>
                      setValue("picture", imgUrl)
                    }
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
              }) => (
                <Input
                  className="pb-4 text-light-text dark:text-dark-text"
                  classNames={{
                    label: "text-light-text dark:text-dark-text text-lg",
                  }}
                  variant="bordered"
                  fullWidth={true}
                  label="Shop Name"
                  labelPlacement="outside"
                  isInvalid={!!error}
                  errorMessage={error?.message}
                  placeholder="Add your shop's name . . ."
                  onChange={onChange}
                  onBlur={onBlur}
                  value={value}
                />
              )}
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
              }) => (
                <Textarea
                  className="pb-4 text-light-text dark:text-dark-text"
                  classNames={{
                    label: "text-light-text dark:text-dark-text text-lg",
                  }}
                  variant="bordered"
                  fullWidth={true}
                  placeholder="Add something about your shop . . ."
                  isInvalid={!!error}
                  errorMessage={error?.message}
                  label="About"
                  labelPlacement="outside"
                  onChange={onChange}
                  onBlur={onBlur}
                  value={value}
                />
              )}
            />

            <div className="pb-4">
              <label className="mb-2 block text-lg text-light-text dark:text-dark-text">
                Free Shipping Threshold
              </label>
              <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">
                Set a minimum order amount to offer free shipping.
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
                      if (e.target.value)
                        setFreeShippingCurrency(e.target.value);
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
              {freeShippingThreshold &&
                parseFloat(freeShippingThreshold) > 0 && (
                  <p className="mt-2 text-sm text-green-600 dark:text-green-400">
                    Buyers will get free shipping on orders of{" "}
                    {parseFloat(freeShippingThreshold).toFixed(2)}{" "}
                    {freeShippingCurrency} or more.
                  </p>
                )}
            </div>

            <Button
              className={`mb-10 w-full ${SHOPSTRBUTTONCLASSNAMES}`}
              type="submit"
              isDisabled={isUploadingShopProfile}
              isLoading={isUploadingShopProfile}
            >
              Save Shop
            </Button>
          </form>
        </Tab>

        <Tab key="storefront" title="Storefront">
          <div className="space-y-8 py-4">
            <div
              className="rounded-lg border-2 border-black bg-light-fg p-4 dark:bg-dark-fg"
              style={{ boxShadow: "4px 4px 0 black" }}
            >
              <h3 className="mb-2 text-lg font-bold text-light-text dark:text-dark-text">
                Shop URL
              </h3>
              <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">
                Choose a unique URL for your storefront. This will be your
                shop&apos;s public address.
              </p>
              <div className="flex gap-2">
                <div className="flex items-center rounded-l-md border border-r-0 border-black bg-gray-100 px-3 py-2 text-sm dark:bg-gray-800">
                  shopstr.store/shop/
                </div>
                <Input
                  className="flex-1"
                  variant="bordered"
                  placeholder="your-shop-name"
                  value={slugInput}
                  onChange={(e) => {
                    setSlugInput(sanitizeSlug(e.target.value));
                    setSlugStatus("idle");
                    setSlugMessage("");
                  }}
                  classNames={{
                    inputWrapper: "rounded-l-none",
                  }}
                />
                <Button
                  className={`${SHOPSTRBUTTONCLASSNAMES}`}
                  onPress={registerSlug}
                  isDisabled={!slugInput || slugInput.length < 2}
                >
                  Save
                </Button>
              </div>
              {slugMessage && (
                <p
                  className={`mt-2 text-sm ${
                    slugStatus === "saved"
                      ? "text-green-600"
                      : slugStatus === "error" || slugStatus === "taken"
                        ? "text-red-600"
                        : "text-gray-500"
                  }`}
                >
                  {slugMessage}
                </p>
              )}
              {shopSlug && (
                <a
                  href={`/shop/${shopSlug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block text-sm text-blue-600 underline dark:text-blue-400"
                >
                  Preview your storefront →
                </a>
              )}
            </div>

            <div
              className="rounded-lg border-2 border-black bg-light-fg p-4 dark:bg-dark-fg"
              style={{ boxShadow: "4px 4px 0 black" }}
            >
              <h3 className="mb-2 text-lg font-bold text-light-text dark:text-dark-text">
                Landing Page Style
              </h3>
              <div className="grid grid-cols-3 gap-3">
                {(["hero", "classic", "minimal"] as const).map((style) => (
                  <button
                    key={style}
                    type="button"
                    className={`rounded-md border-2 p-3 text-center text-sm font-semibold capitalize transition-colors ${
                      (storefront.landingPageStyle || "hero") === style
                        ? "border-shopstr-purple bg-shopstr-purple text-white"
                        : "border-gray-200 hover:border-shopstr-purple-light"
                    }`}
                    onClick={() =>
                      setStorefront((prev) => ({
                        ...prev,
                        landingPageStyle: style,
                      }))
                    }
                  >
                    {style}
                  </button>
                ))}
              </div>
            </div>

            <div
              className="rounded-lg border-2 border-black bg-light-fg p-4 dark:bg-dark-fg"
              style={{ boxShadow: "4px 4px 0 black" }}
            >
              <h3 className="mb-2 text-lg font-bold text-light-text dark:text-dark-text">
                Product Layout
              </h3>
              <div className="grid grid-cols-3 gap-3">
                {(["grid", "list", "featured"] as const).map((layout) => (
                  <button
                    key={layout}
                    type="button"
                    className={`rounded-md border-2 p-3 text-center text-sm font-semibold capitalize transition-colors ${
                      (storefront.productLayout || "grid") === layout
                        ? "border-shopstr-purple bg-shopstr-purple text-white"
                        : "border-gray-200 hover:border-shopstr-purple-light"
                    }`}
                    onClick={() =>
                      setStorefront((prev) => ({
                        ...prev,
                        productLayout: layout,
                      }))
                    }
                  >
                    {layout}
                  </button>
                ))}
              </div>
            </div>

            <div
              className="rounded-lg border-2 border-black bg-light-fg p-4 dark:bg-dark-fg"
              style={{ boxShadow: "4px 4px 0 black" }}
            >
              <h3 className="mb-4 text-lg font-bold text-light-text dark:text-dark-text">
                Color Scheme
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {(
                  [
                    ["primary", "Primary Color"],
                    ["secondary", "Secondary / Background"],
                    ["accent", "Accent Color"],
                    ["background", "Page Background"],
                    ["text", "Text Color"],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key}>
                    <label className="mb-1 block text-sm font-medium text-light-text dark:text-dark-text">
                      {label}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={colors[key]}
                        onChange={(e) => {
                          const newColors = {
                            ...colors,
                            [key]: e.target.value,
                          };
                          setColors(newColors);
                          setStorefront((prev) => ({
                            ...prev,
                            colorScheme: newColors,
                          }));
                        }}
                        className="h-10 w-16 cursor-pointer rounded border border-gray-200"
                      />
                      <Input
                        variant="bordered"
                        value={colors[key]}
                        onChange={(e) => {
                          if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) {
                            const newColors = {
                              ...colors,
                              [key]: e.target.value,
                            };
                            setColors(newColors);
                            setStorefront((prev) => ({
                              ...prev,
                              colorScheme: newColors,
                            }));
                          }
                        }}
                        className="flex-1"
                        placeholder="#000000"
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  className="rounded border border-black px-3 py-1.5 text-xs font-bold"
                  onClick={() => {
                    setColors(DEFAULT_COLORS);
                    setStorefront((prev) => ({
                      ...prev,
                      colorScheme: DEFAULT_COLORS,
                    }));
                  }}
                >
                  Reset to Default
                </button>
              </div>
            </div>

            <div
              className="rounded-lg border-2 border-black bg-light-fg p-4 dark:bg-dark-fg"
              style={{ boxShadow: "4px 4px 0 black" }}
            >
              <h3 className="mb-4 text-lg font-bold text-light-text dark:text-dark-text">
                Typography
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium">
                    Heading Font
                  </label>
                  <Select
                    variant="bordered"
                    selectedKeys={[storefront.fontHeading || ""]}
                    onChange={(e) =>
                      setStorefront((prev) => ({
                        ...prev,
                        fontHeading: e.target.value,
                      }))
                    }
                    aria-label="Heading font"
                  >
                    {GOOGLE_FONTS.map((f) => (
                      <SelectItem key={f.value} value={f.value}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </Select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">
                    Body Font
                  </label>
                  <Select
                    variant="bordered"
                    selectedKeys={[storefront.fontBody || ""]}
                    onChange={(e) =>
                      setStorefront((prev) => ({
                        ...prev,
                        fontBody: e.target.value,
                      }))
                    }
                    aria-label="Body font"
                  >
                    {GOOGLE_FONTS.map((f) => (
                      <SelectItem key={f.value} value={f.value}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </Select>
                </div>
              </div>
            </div>

            <div
              className="rounded-lg border-2 border-black bg-light-fg p-4 dark:bg-dark-fg"
              style={{ boxShadow: "4px 4px 0 black" }}
            >
              <h3 className="mb-4 text-lg font-bold text-light-text dark:text-dark-text">
                Pages
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-light-text dark:text-dark-text">
                      Community Page
                    </p>
                    <p className="text-sm text-gray-500">
                      Show a community discussion page
                    </p>
                  </div>
                  <Switch
                    isSelected={!!storefront.showCommunityPage}
                    onValueChange={(v) =>
                      setStorefront((prev) => ({
                        ...prev,
                        showCommunityPage: v,
                      }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-light-text dark:text-dark-text">
                      Wallet Page
                    </p>
                    <p className="text-sm text-gray-500">
                      Show a wallet page for buyers
                    </p>
                  </div>
                  <Switch
                    isSelected={!!storefront.showWalletPage}
                    onValueChange={(v) =>
                      setStorefront((prev) => ({ ...prev, showWalletPage: v }))
                    }
                  />
                </div>
              </div>
            </div>

            <div
              className="rounded-lg border-2 border-black bg-light-fg p-4 dark:bg-dark-fg"
              style={{ boxShadow: "4px 4px 0 black" }}
            >
              <h3 className="mb-2 text-lg font-bold text-light-text dark:text-dark-text">
                Custom Domain
              </h3>
              <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">
                Use your own domain name for your storefront. Requires DNS
                configuration.
              </p>
              {!shopSlug && (
                <p className="mb-3 rounded bg-yellow-50 p-2 text-sm text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400">
                  Set up your shop URL first before configuring a custom domain.
                </p>
              )}
              <div className="flex gap-2">
                <Input
                  className="flex-1"
                  variant="bordered"
                  placeholder="shop.yourdomain.com"
                  value={customDomain}
                  onChange={(e) => {
                    setCustomDomain(e.target.value.toLowerCase().trim());
                    setCustomDomainStatus("idle");
                    setCustomDomainMessage("");
                    setCustomDomainInstructions(null);
                  }}
                  isDisabled={!shopSlug}
                />
                <Button
                  className={`${SHOPSTRBUTTONCLASSNAMES}`}
                  onPress={saveCustomDomain}
                  isDisabled={!shopSlug || !customDomain}
                >
                  Save
                </Button>
              </div>
              {customDomainMessage && (
                <p
                  className={`mt-2 text-sm ${
                    customDomainStatus === "saved"
                      ? "text-green-600"
                      : "text-red-600"
                  }`}
                >
                  {customDomainMessage}
                </p>
              )}
              {customDomainInstructions && (
                <div className="mt-4 rounded-md border border-blue-200 bg-blue-50 p-4 text-sm dark:border-blue-800 dark:bg-blue-900/20">
                  <p className="mb-2 font-semibold text-blue-800 dark:text-blue-200">
                    DNS Configuration Required
                  </p>
                  <p className="text-blue-700 dark:text-blue-300">
                    Add this DNS record at your domain registrar:
                  </p>
                  <div className="mt-2 rounded bg-white p-2 font-mono text-xs dark:bg-black/20">
                    <div>Type: {customDomainInstructions.type}</div>
                    <div>Host: {customDomainInstructions.host}</div>
                    <div>Value: {customDomainInstructions.value}</div>
                  </div>
                  <p className="mt-2 text-xs text-blue-600 dark:text-blue-400">
                    {customDomainInstructions.note}
                  </p>
                </div>
              )}
            </div>

            <Button
              className={`w-full ${SHOPSTRBUTTONCLASSNAMES}`}
              onPress={() => saveStorefront(storefront)}
              isDisabled={isSavingStorefront}
              isLoading={isSavingStorefront}
            >
              Save Storefront Settings
            </Button>
          </div>
        </Tab>
      </Tabs>
    </>
  );
};

export default ShopProfileForm;
