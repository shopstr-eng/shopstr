import { useEffect, useRef, useState, useContext, useCallback } from "react";
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
} from "@heroui/react";

import { ShopMapContext } from "@/utils/context/context";
import { SHOPSTRBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";
import {
  SignerContext,
  NostrContext,
} from "@/components/utility-components/nostr-context-provider";
import { createNostrShopEvent } from "@/utils/nostr/nostr-helper-functions";
import {
  buildSignedHttpRequestProofTemplate,
  buildStorefrontSlugCreateProof,
  buildStorefrontSlugDeleteProof,
  SIGNED_EVENT_HEADER,
} from "@/utils/nostr/request-auth";
import { FileUploaderButton } from "@/components/utility-components/file-uploader";
import ShopstrSpinner from "@/components/utility-components/shopstr-spinner";
import currencySelection from "@/public/currencySelection.json";
import {
  StorefrontConfig,
  StorefrontColorScheme,
  StorefrontSection,
  StorefrontSectionType,
  StorefrontPage,
  StorefrontFooter,
  StorefrontNavLink,
} from "@/utils/types/types";
import SectionEditor from "./storefront/section-editor";
import FooterEditor from "./storefront/footer-editor";
import PageEditor from "./storefront/page-editor";
import StorefrontPreviewModal from "./storefront/storefront-preview-modal";
import { sanitizeStorefrontConfigLinks } from "@/utils/storefront-links";

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
  primary: "#a438ba",
  secondary: "#f5f5f5",
  accent: "#a655f7",
  background: "#e8e8e8",
  text: "#212121",
};

const COLOR_PRESETS: { name: string; colors: StorefrontColorScheme }[] = [
  {
    name: "Default",
    colors: {
      primary: "#a438ba",
      secondary: "#f5f5f5",
      accent: "#a655f7",
      background: "#e8e8e8",
      text: "#212121",
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
      primary: "#fcd34d",
      secondary: "#4d4c4e",
      accent: "#fef08a",
      background: "#212121",
      text: "#e8e8e8",
    },
  },
];

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

  const [colors, setColors] = useState<StorefrontColorScheme>(DEFAULT_COLORS);
  const [shopSlug, setShopSlug] = useState("");
  const [slugInput, setSlugInput] = useState("");
  const [slugStatus, setSlugStatus] = useState<
    "idle" | "checking" | "saved" | "error" | "taken"
  >("idle");
  const [slugMessage, setSlugMessage] = useState("");
  const [siteHost, setSiteHost] = useState("shopstr.market");
  useEffect(() => {
    if (typeof window !== "undefined") {
      setSiteHost(window.location.hostname);
    }
  }, []);
  const [customDomain, setCustomDomain] = useState("");
  const [isSavingStorefront, setIsSavingStorefront] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("basic");

  const [productLayout, setProductLayout] = useState<
    "grid" | "list" | "featured"
  >("grid");
  const [landingPageStyle, setLandingPageStyle] = useState<
    "classic" | "hero" | "minimal"
  >("hero");
  const [fontHeading, setFontHeading] = useState("");
  const [fontBody, setFontBody] = useState("");
  const [sections, setSections] = useState<StorefrontSection[]>([]);
  const [pages, setPages] = useState<StorefrontPage[]>([]);
  const [footer, setFooter] = useState<StorefrontFooter>({
    showPoweredBy: true,
  });
  const [navLinks, setNavLinks] = useState<StorefrontNavLink[]>([]);
  const [showCommunityPage, setShowCommunityPage] = useState(false);
  const [showWalletPage, setShowWalletPage] = useState(false);
  const [contactEmail, setContactEmail] = useState("");
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

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
  const isSubmittingRef = useRef(false);

  // Tracks whether relay-context data has been applied so DB pre-load doesn't
  // override more authoritative data that arrived later.
  const contextLoadedRef = useRef(false);

  const applyShopConfig = useCallback(
    (config: any) => {
      if (!config) return;
      reset({
        name: config.name || "",
        about: config.about || "",
        picture: config.ui?.picture || "",
        banner: config.ui?.banner || "",
      });
      if (
        config.freeShippingThreshold !== undefined &&
        config.freeShippingThreshold > 0
      ) {
        setFreeShippingThreshold(String(config.freeShippingThreshold));
      }
      if (config.freeShippingCurrency) {
        setFreeShippingCurrency(config.freeShippingCurrency);
      }
      if (config.storefront) {
        const sf = config.storefront;
        if (sf.colorScheme) setColors({ ...DEFAULT_COLORS, ...sf.colorScheme });
        if (sf.shopSlug) {
          setShopSlug(sf.shopSlug);
          setSlugInput(sf.shopSlug);
        }
        if (sf.productLayout) setProductLayout(sf.productLayout);
        if (sf.landingPageStyle) setLandingPageStyle(sf.landingPageStyle);
        if (sf.fontHeading) setFontHeading(sf.fontHeading);
        if (sf.fontBody) setFontBody(sf.fontBody);
        if (sf.sections) setSections(sf.sections);
        if (sf.pages) setPages(sf.pages);
        if (sf.footer) setFooter(sf.footer);
        if (sf.navLinks) setNavLinks(sf.navLinks);
        if (sf.showCommunityPage) setShowCommunityPage(sf.showCommunityPage);
        if (sf.showWalletPage) setShowWalletPage(sf.showWalletPage);
        if (sf.contactEmail) setContactEmail(sf.contactEmail);
      }
    },
    [reset]
  );

  // ── Fast path: seed the form immediately from the DB on mount ──────────────
  useEffect(() => {
    if (!userPubkey) return;
    if (contextLoadedRef.current) return; // relay already loaded — skip DB fetch
    setIsFetchingShop(true);
    fetch(`/api/storefront/lookup?pubkey=${encodeURIComponent(userPubkey)}`)
      .then((r) => r.json())
      .then((data) => {
        if (contextLoadedRef.current) return; // relay beat us to it
        if (data?.shopConfig) applyShopConfig(data.shopConfig);
      })
      .catch((error) => {
        console.error("Failed to fetch storefront lookup data:", error);
      })
      .finally(() => {
        if (!contextLoadedRef.current) setIsFetchingShop(false);
      });

    fetch(
      `/api/storefront/custom-domain?pubkey=${encodeURIComponent(userPubkey)}`
    )
      .then((r) => r.json())
      .then((data) => {
        if (data?.domain) setCustomDomain(data.domain);
      })
      .catch((error) => {
        console.error("Failed to fetch storefront custom domain:", error);
      });
  }, [userPubkey, applyShopConfig]);

  // ── Slow path: override with authoritative relay-context data when ready ───
  useEffect(() => {
    const shopMap = shopContext.shopData;
    const shop = shopMap.has(userPubkey!)
      ? shopMap.get(userPubkey!)
      : undefined;
    if (!shop) return;
    contextLoadedRef.current = true;
    setIsFetchingShop(true);
    applyShopConfig(shop.content);
    setIsFetchingShop(false);
  }, [shopContext, userPubkey, applyShopConfig]);

  const onSubmit = async (data: { [x: string]: string }) => {
    if (isSubmittingRef.current) {
      return;
    }
    isSubmittingRef.current = true;
    setIsUploadingShopProfile(true);
    try {
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
      if (shopSlug) {
        const storefrontConfig: StorefrontConfig =
          sanitizeStorefrontConfigLinks({
            colorScheme: colors,
            productLayout,
            landingPageStyle,
            shopSlug,
            customDomain: customDomain || undefined,
            fontHeading: fontHeading || undefined,
            fontBody: fontBody || undefined,
            sections: sections.length > 0 ? sections : undefined,
            pages: pages.length > 0 ? pages : undefined,
            footer,
            navLinks: navLinks.length > 0 ? navLinks : undefined,
            showCommunityPage: showCommunityPage || undefined,
            showWalletPage: showWalletPage || undefined,
            contactEmail: contactEmail || undefined,
          });
        transformedData.storefront = storefrontConfig;
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
      if (isOnboarding) {
        router.push("/marketplace");
      }
    } finally {
      isSubmittingRef.current = false;
      setIsUploadingShopProfile(false);
    }
  };

  const registerSlug = async () => {
    if (!userPubkey || !signer) {
      setSlugStatus("error");
      setSlugMessage("You must be signed in to save your storefront");
      return;
    }

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
      const signedEvent = await signer.sign(
        buildSignedHttpRequestProofTemplate(
          buildStorefrontSlugCreateProof({
            pubkey: userPubkey,
            slug: s,
          })
        )
      );
      const res = await fetch("/api/storefront/register-slug", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [SIGNED_EVENT_HEADER]: JSON.stringify(signedEvent),
        },
        body: JSON.stringify({ pubkey: userPubkey, slug: s }),
      });
      const data = await res.json();
      if (res.ok) {
        setShopSlug(data.slug);
        setSlugInput(data.slug);
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

  const handleRemoveStorefront = async () => {
    if (!userPubkey || !signer) return;
    const confirmed = window.confirm(
      "Are you sure you want to remove your storefront? This will delete your shop URL, custom domain, and reset all storefront settings."
    );
    if (!confirmed) return;
    try {
      const signedEvent = await signer.sign(
        buildSignedHttpRequestProofTemplate(
          buildStorefrontSlugDeleteProof(userPubkey)
        )
      );
      await fetch("/api/storefront/register-slug", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          [SIGNED_EVENT_HEADER]: JSON.stringify(signedEvent),
        },
        body: JSON.stringify({ pubkey: userPubkey }),
      });
      setShopSlug("");
      setSlugInput("");
      setCustomDomain("");
      setColors(DEFAULT_COLORS);
      setProductLayout("grid");
      setLandingPageStyle("hero");
      setSections([]);
      setPages([]);
      setFooter({ showPoweredBy: true });
      setNavLinks([]);
      setShowCommunityPage(false);
      setShowWalletPage(false);
      setSlugStatus("idle");
      setSlugMessage("");

      const shopMap = shopContext.shopData;
      const shop = shopMap.has(userPubkey)
        ? shopMap.get(userPubkey)
        : undefined;
      if (shop) {
        const updatedContent = { ...shop.content };
        delete updatedContent.storefront;
        await createNostrShopEvent(
          nostr!,
          signer!,
          JSON.stringify(updatedContent)
        );
        shopContext.updateShopData({
          pubkey: userPubkey,
          content: updatedContent,
          created_at: 0,
        });
      }
    } catch (error) {
      console.error("Failed to remove storefront:", error);
    }
  };

  const buildStorefrontConfig = (): StorefrontConfig =>
    sanitizeStorefrontConfigLinks({
      colorScheme: colors,
      productLayout,
      landingPageStyle,
      shopSlug: shopSlug || undefined,
      customDomain: customDomain || undefined,
      fontHeading: fontHeading || undefined,
      fontBody: fontBody || undefined,
      sections: sections.length > 0 ? sections : undefined,
      pages: pages.length > 0 ? pages : undefined,
      footer,
      navLinks: navLinks.length > 0 ? navLinks : undefined,
      showCommunityPage: showCommunityPage || undefined,
      showWalletPage: showWalletPage || undefined,
      contactEmail: contactEmail || undefined,
    });

  const saveStorefront = async () => {
    const newSf = buildStorefrontConfig();
    setIsSavingStorefront(true);
    const shopMap = shopContext.shopData;
    const shop = shopMap.has(userPubkey!)
      ? shopMap.get(userPubkey!)
      : undefined;
    const formName = watch("name");
    const formAbout = watch("about");
    const formPicture = watch("picture");
    const formBanner = watch("banner");
    const transformedData: any = {
      name: formName || shop?.content?.name || "",
      about: formAbout || shop?.content?.about || "",
      ui: {
        picture: formPicture || shop?.content?.ui?.picture || "",
        banner: formBanner || shop?.content?.ui?.banner || "",
        theme: shop?.content?.ui?.theme || "",
        darkMode: shop?.content?.ui?.darkMode || false,
      },
      merchants: [userPubkey!],
      storefront: newSf,
    };
    if (freeShippingThreshold && parseFloat(freeShippingThreshold) > 0) {
      transformedData.freeShippingThreshold = parseFloat(freeShippingThreshold);
      transformedData.freeShippingCurrency = freeShippingCurrency;
    } else if (shop?.content?.freeShippingThreshold) {
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
      <div className="mb-6 flex w-full border-b-2 border-black dark:border-gray-600">
        <button
          type="button"
          className={`px-6 py-3 text-sm font-semibold transition-colors ${
            activeTab === "basic"
              ? "border-shopstr-purple text-shopstr-purple dark:border-shopstr-yellow dark:text-shopstr-yellow border-b-4"
              : "hover:text-light-text dark:hover:text-dark-text text-gray-500"
          }`}
          onClick={() => setActiveTab("basic")}
        >
          Basic Info
        </button>
        <button
          type="button"
          className={`px-6 py-3 text-sm font-semibold transition-colors ${
            activeTab === "storefront"
              ? "border-shopstr-purple text-shopstr-purple dark:border-shopstr-yellow dark:text-shopstr-yellow border-b-4"
              : "hover:text-light-text dark:hover:text-dark-text text-gray-500"
          }`}
          onClick={() => setActiveTab("storefront")}
        >
          Storefront
        </button>
      </div>

      {activeTab === "basic" && (
        <>
          <div className="bg-light-fg dark:bg-dark-fg mb-20 h-40 rounded-lg">
            <div className="bg-shopstr-purple-light dark:bg-dark-fg relative flex h-40 items-center justify-center rounded-lg">
              {watchBanner && (
                <Image
                  alt={"Shop banner image"}
                  src={watchBanner}
                  className="h-40 w-full rounded-lg object-cover object-fill"
                />
              )}
              <FileUploaderButton
                className={`bg-shopstr-purple absolute right-5 bottom-5 z-20 border-2 border-white shadow-md ${SHOPSTRBUTTONCLASSNAMES}`}
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
                    className={`absolute right-[-0.5rem] bottom-[-0.5rem] z-20 ${SHOPSTRBUTTONCLASSNAMES}`}
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
                  className="text-light-text dark:text-dark-text pb-4"
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
                  className="text-light-text dark:text-dark-text pb-4"
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
              <label className="text-light-text dark:text-dark-text mb-2 block text-lg">
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
                    onChange={(e: any) =>
                      setFreeShippingThreshold(e.target.value)
                    }
                  />
                </div>
                <div className="w-32">
                  <Select
                    variant="bordered"
                    selectedKeys={[freeShippingCurrency]}
                    onChange={(e: any) => {
                      if (e.target.value)
                        setFreeShippingCurrency(e.target.value);
                    }}
                    aria-label="Currency"
                    className="text-light-text dark:text-dark-text"
                  >
                    {CURRENCY_OPTIONS.map((currency) => (
                      <SelectItem key={currency}>{currency}</SelectItem>
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
        </>
      )}

      {activeTab === "storefront" && isOnboarding && (
        <div className="dark:bg-dark-fg rounded-lg border-3 border-black bg-gray-50 p-4">
          <p className="dark:text-dark-text text-sm text-gray-600">
            <span className="dark:text-dark-text font-bold text-black">
              Custom storefront & page settings
            </span>{" "}
            are available after onboarding in your shop settings.
          </p>
        </div>
      )}
      {activeTab === "storefront" && !isOnboarding && (
        <>
          <div className="space-y-6 py-2">
            {/* Shop URL */}
            <div className="pb-2">
              <p className="text-light-text dark:text-dark-text pb-1 text-lg font-semibold">
                Shop URL
              </p>
              <p className="pb-3 text-sm text-gray-500 dark:text-gray-400">
                Choose a unique URL for your storefront.
              </p>
              <div className="flex gap-2">
                <div className="bg-light-fg text-light-text dark:bg-dark-fg dark:text-dark-text flex items-center rounded-l-md border border-r-0 border-gray-300 px-3 py-2 text-sm dark:border-gray-600">
                  {siteHost}/shop/
                </div>
                <Input
                  className="flex-1"
                  variant="bordered"
                  placeholder="your-shop-name"
                  value={slugInput}
                  onChange={(e: any) => {
                    setSlugInput(sanitizeSlug(e.target.value));
                    setSlugStatus("idle");
                    setSlugMessage("");
                  }}
                  classNames={{ inputWrapper: "rounded-l-none" }}
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
                  className="text-shopstr-purple dark:text-shopstr-yellow mt-2 inline-block text-sm underline"
                >
                  {siteHost}/shop/{shopSlug} →
                </a>
              )}
            </div>

            <hr className="border-light-fg dark:border-dark-fg" />

            {/* Landing Page Style */}
            <div className="pb-2">
              <p className="text-light-text dark:text-dark-text pb-3 text-lg font-semibold">
                Landing Page Style
              </p>
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
                    className={`flex-1 rounded-md border-2 p-3 text-left text-sm transition-all ${
                      landingPageStyle === style.value
                        ? "border-shopstr-purple bg-shopstr-purple text-white"
                        : "text-light-text hover:border-shopstr-purple-light dark:text-dark-text dark:hover:border-shopstr-purple-light border-gray-200 dark:border-gray-600"
                    }`}
                    onClick={() => setLandingPageStyle(style.value)}
                  >
                    <span className="block font-semibold capitalize">
                      {style.label}
                    </span>
                    <span className="block text-xs opacity-70">
                      {style.desc}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <hr className="border-light-fg dark:border-dark-fg" />

            {/* Product Layout */}
            <div className="pb-2">
              <p className="text-light-text dark:text-dark-text pb-3 text-lg font-semibold">
                Product Layout
              </p>
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
                    className={`flex-1 rounded-md border-2 p-3 text-left text-sm transition-all ${
                      productLayout === layout.value
                        ? "border-shopstr-purple bg-shopstr-purple text-white"
                        : "text-light-text hover:border-shopstr-purple-light dark:text-dark-text dark:hover:border-shopstr-purple-light border-gray-200 dark:border-gray-600"
                    }`}
                    onClick={() => setProductLayout(layout.value)}
                  >
                    <span className="block font-semibold capitalize">
                      {layout.label}
                    </span>
                    <span className="block text-xs opacity-70">
                      {layout.desc}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <hr className="border-light-fg dark:border-dark-fg" />

            {/* Color Scheme */}
            <div className="pb-2">
              <p className="text-light-text dark:text-dark-text pb-3 text-lg font-semibold">
                Color Scheme
              </p>
              <div className="mb-4 flex flex-wrap gap-2">
                {COLOR_PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => setColors(preset.colors)}
                    className={`text-light-text dark:text-dark-text flex items-center gap-2 rounded-lg border-2 px-3 py-1.5 text-sm font-medium transition-all ${
                      JSON.stringify(colors) === JSON.stringify(preset.colors)
                        ? "border-shopstr-purple bg-shopstr-purple/10"
                        : "hover:border-shopstr-purple-light border-gray-200 dark:border-gray-600 dark:hover:border-gray-400"
                    }`}
                  >
                    <div className="flex gap-1">
                      <div
                        className="h-4 w-4 rounded-full border border-gray-300"
                        style={{ backgroundColor: preset.colors.primary }}
                      />
                      <div
                        className="h-4 w-4 rounded-full border border-gray-300"
                        style={{ backgroundColor: preset.colors.secondary }}
                      />
                      <div
                        className="h-4 w-4 rounded-full border border-gray-300"
                        style={{ backgroundColor: preset.colors.accent }}
                      />
                    </div>
                    {preset.name}
                  </button>
                ))}
              </div>
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
                    <label className="text-light-text dark:text-dark-text mb-1 block text-sm font-medium">
                      {label}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={colors[key]}
                        onChange={(e) =>
                          setColors((prev) => ({
                            ...prev,
                            [key]: e.target.value,
                          }))
                        }
                        className="h-10 w-16 cursor-pointer rounded border border-gray-200 dark:border-gray-600"
                      />
                      <Input
                        variant="bordered"
                        value={colors[key]}
                        onChange={(e: any) => {
                          if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) {
                            setColors((prev) => ({
                              ...prev,
                              [key]: e.target.value,
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
              <button
                type="button"
                className="hover:text-light-text dark:hover:text-dark-text mt-4 text-sm text-gray-500 underline dark:text-gray-400"
                onClick={() => setColors(DEFAULT_COLORS)}
              >
                Reset to defaults
              </button>
            </div>

            <hr className="border-light-fg dark:border-dark-fg" />

            {/* Typography */}
            <div className="pb-2">
              <p className="text-light-text dark:text-dark-text pb-3 text-lg font-semibold">
                Typography
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Select
                  className="text-light-text dark:text-dark-text"
                  classNames={{ label: "text-light-text dark:text-dark-text" }}
                  variant="bordered"
                  label="Heading Font"
                  labelPlacement="outside"
                  selectedKeys={[fontHeading]}
                  onChange={(e: any) => setFontHeading(e.target.value)}
                  aria-label="Heading font"
                >
                  {GOOGLE_FONTS.map((f) => (
                    <SelectItem key={f.value}>{f.label}</SelectItem>
                  ))}
                </Select>
                <Select
                  className="text-light-text dark:text-dark-text"
                  classNames={{ label: "text-light-text dark:text-dark-text" }}
                  variant="bordered"
                  label="Body Font"
                  labelPlacement="outside"
                  selectedKeys={[fontBody]}
                  onChange={(e: any) => setFontBody(e.target.value)}
                  aria-label="Body font"
                >
                  {GOOGLE_FONTS.map((f) => (
                    <SelectItem key={f.value}>{f.label}</SelectItem>
                  ))}
                </Select>
              </div>
            </div>

            <hr className="border-light-fg dark:border-dark-fg" />

            {/* Navigation Links */}
            <div className="pb-2">
              <p className="text-light-text dark:text-dark-text pb-1 text-lg font-semibold">
                Navigation Links
              </p>
              <p className="pb-3 text-sm text-gray-500 dark:text-gray-400">
                Define the top navigation links for your storefront. Leave empty
                to use default navigation.
              </p>
              <div className="space-y-2">
                {navLinks.map((link, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      variant="bordered"
                      size="sm"
                      value={link.label}
                      onChange={(e: any) => {
                        const updated = [...navLinks];
                        updated[idx] = { ...link, label: e.target.value };
                        setNavLinks(updated);
                      }}
                      placeholder="Label"
                      className="w-32"
                    />
                    <Input
                      variant="bordered"
                      size="sm"
                      value={link.href}
                      onChange={(e: any) => {
                        const updated = [...navLinks];
                        updated[idx] = { ...link, href: e.target.value };
                        setNavLinks(updated);
                      }}
                      placeholder="URL or page slug"
                      className="flex-1"
                    />
                    <label className="flex items-center gap-1 text-xs whitespace-nowrap text-gray-500 dark:text-gray-400">
                      <input
                        type="checkbox"
                        checked={link.isPage || false}
                        onChange={(e) => {
                          const updated = [...navLinks];
                          updated[idx] = { ...link, isPage: e.target.checked };
                          setNavLinks(updated);
                        }}
                      />
                      Page
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        setNavLinks(navLinks.filter((_, i) => i !== idx))
                      }
                      className="text-xs text-red-500"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() =>
                  setNavLinks([...navLinks, { label: "", href: "" }])
                }
                className="text-shopstr-purple dark:text-shopstr-yellow mt-2 text-sm hover:underline"
              >
                + Add Nav Link
              </button>
            </div>

            <hr className="border-light-fg dark:border-dark-fg" />

            {/* Homepage Sections */}
            <div className="pb-2">
              <p className="text-light-text dark:text-dark-text pb-1 text-lg font-semibold">
                Homepage Sections
              </p>
              <p className="pb-3 text-sm text-gray-500 dark:text-gray-400">
                Build your storefront homepage by adding and arranging content
                sections. If no sections are added, the landing page style above
                is used instead.
              </p>
              <div className="space-y-2">
                {sections.map((section, idx) => (
                  <SectionEditor
                    key={section.id}
                    section={section}
                    onChange={(updated) => {
                      const newSections = [...sections];
                      newSections[idx] = updated;
                      setSections(newSections);
                    }}
                    onRemove={() =>
                      setSections(sections.filter((_, i) => i !== idx))
                    }
                    onMoveUp={() => {
                      if (idx === 0) return;
                      const newSections = [...sections];
                      [newSections[idx - 1], newSections[idx]] = [
                        newSections[idx]!,
                        newSections[idx - 1]!,
                      ];
                      setSections(newSections);
                    }}
                    onMoveDown={() => {
                      if (idx === sections.length - 1) return;
                      const newSections = [...sections];
                      [newSections[idx], newSections[idx + 1]] = [
                        newSections[idx + 1]!,
                        newSections[idx]!,
                      ];
                      setSections(newSections);
                    }}
                    isFirst={idx === 0}
                    isLast={idx === sections.length - 1}
                  />
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {(
                  [
                    { type: "hero" as StorefrontSectionType, label: "Hero" },
                    { type: "about" as StorefrontSectionType, label: "About" },
                    {
                      type: "story" as StorefrontSectionType,
                      label: "Our Story",
                    },
                    {
                      type: "products" as StorefrontSectionType,
                      label: "Products",
                    },
                    {
                      type: "testimonials" as StorefrontSectionType,
                      label: "Testimonials",
                    },
                    { type: "faq" as StorefrontSectionType, label: "FAQ" },
                    {
                      type: "ingredients" as StorefrontSectionType,
                      label: "Ingredients",
                    },
                    {
                      type: "comparison" as StorefrontSectionType,
                      label: "Comparison",
                    },
                    { type: "text" as StorefrontSectionType, label: "Text" },
                    { type: "image" as StorefrontSectionType, label: "Image" },
                    {
                      type: "contact" as StorefrontSectionType,
                      label: "Contact",
                    },
                    {
                      type: "reviews" as StorefrontSectionType,
                      label: "Reviews",
                    },
                  ] as const
                ).map((st) => (
                  <button
                    key={st.type}
                    type="button"
                    onClick={() =>
                      setSections([
                        ...sections,
                        {
                          id: `section-${Date.now()}-${Math.random()
                            .toString(36)
                            .slice(2, 6)}`,
                          type: st.type,
                          enabled: true,
                        },
                      ])
                    }
                    className="hover:border-shopstr-purple hover:text-shopstr-purple dark:hover:border-shopstr-yellow dark:hover:text-shopstr-yellow rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-600 dark:border-gray-600 dark:text-gray-400"
                  >
                    + {st.label}
                  </button>
                ))}
              </div>
            </div>

            <hr className="border-light-fg dark:border-dark-fg" />

            {/* Custom Pages */}
            <div className="pb-2">
              <PageEditor pages={pages} onChange={setPages} />
            </div>

            <hr className="border-light-fg dark:border-dark-fg" />

            {/* Built-in Pages */}
            <div className="pb-2">
              <p className="text-light-text dark:text-dark-text pb-3 text-lg font-semibold">
                Built-in Pages
              </p>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-light-text dark:text-dark-text font-medium">
                      Community Page
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Show a community discussion page
                    </p>
                  </div>
                  <Switch
                    isSelected={showCommunityPage}
                    onValueChange={setShowCommunityPage}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-light-text dark:text-dark-text font-medium">
                      Wallet Page
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Show a Bitcoin wallet page for buyers
                    </p>
                  </div>
                  <Switch
                    isSelected={showWalletPage}
                    onValueChange={setShowWalletPage}
                  />
                </div>
              </div>
            </div>

            <hr className="border-light-fg dark:border-dark-fg" />

            {/* Contact Us */}
            <div className="pb-2">
              <p className="text-light-text dark:text-dark-text pb-1 text-lg font-semibold">
                Contact Us
              </p>
              <p className="pb-3 text-sm text-gray-500 dark:text-gray-400">
                A &quot;Contact&quot; link is shown on your storefront by
                default. Clicking it opens a Nostr DM inquiry with you directly
                within your storefront. If you prefer to use email instead,
                enter your address below.
              </p>
              <Input
                label="Contact Email"
                labelPlacement="outside"
                variant="bordered"
                type="email"
                placeholder="hello@yourshop.com"
                value={contactEmail}
                onChange={(e: any) => setContactEmail(e.target.value)}
                classNames={{
                  label: "text-light-text dark:text-dark-text font-medium pb-1",
                }}
              />
            </div>

            <hr className="border-light-fg dark:border-dark-fg" />

            {/* Footer */}
            <div className="pb-2">
              <p className="text-light-text dark:text-dark-text pb-1 text-lg font-semibold">
                Footer
              </p>
              <p className="pb-3 text-sm text-gray-500 dark:text-gray-400">
                Customize the footer at the bottom of your storefront.
              </p>
              <FooterEditor
                footer={footer}
                onChange={setFooter}
                shopName={watch("name")}
              />
            </div>

            <hr className="border-light-fg dark:border-dark-fg" />

            {/* Custom Domain */}
            <div className="pb-2">
              <p className="text-light-text dark:text-dark-text pb-1 text-lg font-semibold">
                Custom Domain
              </p>
              <p className="pb-3 text-sm text-gray-500 dark:text-gray-400">
                Want to use your own domain (e.g.,{" "}
                <code className="bg-light-fg dark:bg-dark-fg rounded px-1 text-xs">
                  shop.yourdomain.com
                </code>
                ) for your storefront? We can help set that up for you.
              </p>
              {customDomain && (
                <div className="mb-3 flex items-center gap-2 rounded-lg border border-green-300 bg-green-50 px-3 py-2 dark:border-green-700 dark:bg-green-950/30">
                  <span className="text-xs font-medium text-green-700 dark:text-green-400">
                    Active custom domain:
                  </span>
                  <code className="text-xs font-bold text-green-800 dark:text-green-300">
                    {customDomain}
                  </code>
                </div>
              )}
              <button
                type="button"
                onClick={() =>
                  router.push(
                    "/orders?pk=npub15dc33fyg3cpd9r58vlqge2hh8dy6hkkrjxkhluv2xpyfreqkmsesesyv6e&isInquiry=true"
                  )
                }
                className="dark:bg-dark-fg dark:text-dark-text dark:hover:bg-dark-bg inline-block rounded-lg border-3 border-black bg-white px-4 py-2 text-sm font-bold text-black hover:bg-gray-100 dark:border-gray-500"
              >
                {customDomain ? "Contact Us to Change Domain" : "Contact Us"}
              </button>
            </div>

            <hr className="border-light-fg dark:border-dark-fg" />

            {/* Preview + Save */}
            <div className="border-light-fg dark:border-dark-fg rounded-lg border-2 border-dashed p-4">
              <p className="text-light-text dark:text-dark-text mb-3 text-sm font-medium">
                Preview your storefront before saving to see how it will look to
                visitors.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsPreviewOpen(true)}
                  className={`${SHOPSTRBUTTONCLASSNAMES} rounded-lg px-4 py-2 text-sm font-bold`}
                >
                  Preview Storefront
                </button>
                {shopSlug && (
                  <a
                    href={`/shop/${shopSlug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-shopstr-purple dark:text-shopstr-yellow text-sm underline"
                  >
                    {siteHost}/shop/{shopSlug} →
                  </a>
                )}
              </div>
              <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
                Preview shows approximate appearance. Save to publish your
                changes to the live storefront.
              </p>
            </div>

            {/* Remove Storefront */}
            {shopSlug && (
              <div className="pt-2">
                <Button
                  className="border-2 border-red-500 bg-transparent font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                  onPress={handleRemoveStorefront}
                >
                  Remove Storefront
                </Button>
                <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                  This will delete your shop URL, custom domain, and reset all
                  storefront customization.
                </p>
              </div>
            )}

            <Button
              className={`w-full ${SHOPSTRBUTTONCLASSNAMES}`}
              onPress={saveStorefront}
              isDisabled={isSavingStorefront}
              isLoading={isSavingStorefront}
            >
              Save Storefront Settings
            </Button>
          </div>
        </>
      )}

      <StorefrontPreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        shopName={watch("name")}
        shopAbout={watch("about")}
        pictureUrl={watch("picture")}
        bannerUrl={watch("banner")}
        colors={colors}
        productLayout={productLayout}
        landingPageStyle={landingPageStyle}
        fontHeading={fontHeading}
        fontBody={fontBody}
        sections={sections}
        pages={pages}
        footer={footer}
        navLinks={navLinks}
        shopSlug={shopSlug}
      />
    </>
  );
};

export default ShopProfileForm;
