import { useEffect, useState, useContext, useMemo, useRef } from "react";
import { useRouter } from "next/router";
import { useForm, Controller } from "react-hook-form";
import {
  Button,
  Input,
  Image,
  Select,
  SelectItem,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  DropdownSection,
} from "@nextui-org/react";

import {
  ShopMapContext,
  ProfileMapContext,
  ProductContext,
} from "@/utils/context/context";
import { parseTags } from "@/utils/parsers/product-parser-functions";
import type { ProductData } from "@/utils/parsers/product-parser-functions";
import {
  WHITEBUTTONCLASSNAMES,
  BLUEBUTTONCLASSNAMES,
} from "@/utils/STATIC-VARIABLES";
import {
  SignerContext,
  NostrContext,
} from "@/components/utility-components/nostr-context-provider";
import { createNostrShopEvent } from "@/utils/nostr/nostr-helper-functions";
import { createAuthEventTemplate } from "@/utils/stripe/verify-nostr-auth";
import { FileUploaderButton } from "@/components/utility-components/file-uploader";
import MilkMarketSpinner from "@/components/utility-components/mm-spinner";
import currencySelection from "@/public/currencySelection.json";
import {
  StorefrontConfig,
  StorefrontColorScheme,
  StorefrontSection,
  StorefrontSectionType,
  StorefrontPage,
  StorefrontFooter,
  StorefrontNavLink,
  StorefrontEmailPopup,
} from "@/utils/types/types";
import SectionEditor from "./storefront/section-editor";
import FooterEditor from "./storefront/footer-editor";
import PageEditor from "./storefront/page-editor";
import StorefrontPreviewModal from "./storefront/storefront-preview-modal";
import StorefrontPreviewPanel from "./storefront/storefront-preview-panel";

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

const GOOGLE_FONT_OPTIONS = [
  "Inter",
  "Roboto",
  "Open Sans",
  "Lato",
  "Montserrat",
  "Poppins",
  "Playfair Display",
  "Merriweather",
  "Raleway",
  "Nunito",
  "Oswald",
  "Source Sans 3",
  "PT Serif",
  "Bitter",
  "Crimson Text",
];

const ShopProfileForm = ({ isOnboarding = false }: ShopProfileFormProps) => {
  const router = useRouter();
  const { nostr } = useContext(NostrContext);
  const [isUploadingShopProfile, setIsUploadingShopProfile] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isFetchingShop, setIsFetchingShop] = useState(false);
  const [notificationEmail, setNotificationEmail] = useState("");
  const [freeShippingThreshold, setFreeShippingThreshold] =
    useState<string>("");
  const [freeShippingCurrency, setFreeShippingCurrency] =
    useState<string>("USD");
  const [paymentMethodDiscounts, setPaymentMethodDiscounts] = useState<{
    [method: string]: string;
  }>({});
  const [hasStripeAccount, setHasStripeAccount] = useState(false);

  const [storefrontAuthenticated, setStorefrontAuthenticated] = useState(false);
  const [storefrontPasswordModal, setStorefrontPasswordModal] = useState(false);
  const [storefrontPasswordInput, setStorefrontPasswordInput] = useState("");
  const [storefrontPasswordError, setStorefrontPasswordError] = useState("");
  const [passwordStorageKey, setPasswordStorageKey] = useState("");

  useEffect(() => {
    if (isOnboarding) return;
    const fetchPasswordStorageKey = async () => {
      try {
        const response = await fetch("/api/validate-password-auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        const data = await response.json();
        if (data.value) {
          setPasswordStorageKey(data.value);
          const storedAuth = localStorage.getItem(data.value);
          if (storedAuth === "true") {
            setStorefrontAuthenticated(true);
          }
        }
      } catch (error) {
        console.error("Failed to fetch password storage key:", error);
      }
    };
    fetchPasswordStorageKey();
  }, [isOnboarding]);

  const handleStorefrontPasswordSubmit = async () => {
    try {
      const response = await fetch("/api/validate-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: storefrontPasswordInput.trim() }),
      });
      const data = await response.json();
      if (data.valid) {
        setStorefrontAuthenticated(true);
        if (passwordStorageKey) {
          localStorage.setItem(passwordStorageKey, "true");
        }
        setStorefrontPasswordModal(false);
        setStorefrontPasswordInput("");
        setStorefrontPasswordError("");
      } else {
        setStorefrontPasswordError("Incorrect password. Please try again.");
      }
    } catch {
      setStorefrontPasswordError("An error occurred. Please try again.");
    }
  };

  const [shopSlug, setShopSlug] = useState("");
  const [slugStatus, setSlugStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [slugError, setSlugError] = useState("");
  const [colorScheme, setColorScheme] =
    useState<StorefrontColorScheme>(DEFAULT_COLORS);
  const [isCustomColorScheme, setIsCustomColorScheme] = useState(false);
  const [productLayout, setProductLayout] = useState<
    "grid" | "list" | "featured"
  >("grid");
  const [landingPageStyle, setLandingPageStyle] = useState<
    "classic" | "hero" | "minimal"
  >("hero");
  const [fontHeading, setFontHeading] = useState("");
  const [fontBody, setFontBody] = useState("");
  const [sections, setSections] = useState<StorefrontSection[]>([]);
  const [newSectionId, setNewSectionId] = useState<string | null>(null);
  const [pages, setPages] = useState<StorefrontPage[]>([]);
  const [footer, setFooter] = useState<StorefrontFooter>({
    showPoweredBy: true,
  });
  const [navLinks, setNavLinks] = useState<StorefrontNavLink[]>([]);
  const [showCommunityPage, setShowCommunityPage] = useState(false);
  const [showWalletPage, setShowWalletPage] = useState(false);
  const [emailPopup, setEmailPopup] = useState<StorefrontEmailPopup>({
    enabled: false,
    discountPercentage: 10,
  });
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isMobilePreviewOpen, setIsMobilePreviewOpen] = useState(false);
  const [isMobilePreviewClosing, setIsMobilePreviewClosing] = useState(false);

  const { signer, pubkey: userPubkey } = useContext(SignerContext);

  const shopContext = useContext(ShopMapContext);
  const profileContext = useContext(ProfileMapContext);
  const productContext = useContext(ProductContext);
  const hasLoadedShopRef = useRef(false);

  const sellerProducts = useMemo(() => {
    if (!userPubkey || !productContext.productEvents?.length) return [];
    return productContext.productEvents
      .filter((event: any) => event.pubkey === userPubkey)
      .map((event: any) => parseTags(event))
      .filter(
        (p: ProductData | undefined): p is ProductData => p !== undefined
      );
  }, [userPubkey, productContext.productEvents]);

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
    if (hasLoadedShopRef.current) return;
    const shopMap = shopContext.shopData;
    const shop = shopMap.has(userPubkey!)
      ? shopMap.get(userPubkey!)
      : undefined;
    if (!shop) {
      if (shopMap.size > 0) {
        setIsFetchingShop(false);
      }
      return;
    }
    hasLoadedShopRef.current = true;
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
      if (sf.colorScheme) {
        const loaded = { ...DEFAULT_COLORS, ...sf.colorScheme };
        setColorScheme(loaded);
        const matchesPreset = COLOR_PRESETS.some(
          (p) => JSON.stringify(p.colors) === JSON.stringify(loaded)
        );
        if (!matchesPreset) setIsCustomColorScheme(true);
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
      if (sf.emailPopup) setEmailPopup({ ...emailPopup, ...sf.emailPopup });
    }
    setIsFetchingShop(false);
  }, [shopContext, userPubkey, reset]);

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

  useEffect(() => {
    if (userPubkey && signer) {
      (async () => {
        try {
          const template = createAuthEventTemplate(userPubkey);
          const signedEvent = await signer.sign(template);
          const res = await fetch("/api/stripe/connect/account-status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pubkey: userPubkey, signedEvent }),
          });
          if (res.ok) {
            const data = await res.json();
            setHasStripeAccount(!!data.chargesEnabled);
          }
        } catch {}
      })();
    }
  }, [userPubkey, signer]);

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

  const handleRemoveStorefront = async () => {
    if (!userPubkey) return;
    try {
      await fetch("/api/storefront/register-slug", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pubkey: userPubkey }),
      });

      setShopSlug("");
      setColorScheme(DEFAULT_COLORS);
      setProductLayout("grid");
      setLandingPageStyle("hero");
      setSlugStatus("idle");
      setSlugError("");

      const shopMap = shopContext.shopData;
      const shop = shopMap.has(userPubkey)
        ? shopMap.get(userPubkey)
        : undefined;
      if (shop) {
        const updatedContent = { ...shop.content };
        delete updatedContent.storefront;
        const contentStr = JSON.stringify(updatedContent);
        await createNostrShopEvent(nostr!, signer!, contentStr);
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

  const [shopSlugRequired, setShopSlugRequired] = useState(false);

  const handleLandingPageStyleChange = (
    style: "hero" | "classic" | "minimal"
  ) => {
    setLandingPageStyle(style);
    setSections((prev) => {
      const hasHeroSection = prev.some((s) => s.type === "hero");
      if (style === "hero") {
        if (!hasHeroSection) {
          return [
            {
              id: `section-${Date.now()}-${Math.random()
                .toString(36)
                .slice(2, 6)}`,
              type: "hero" as StorefrontSectionType,
              enabled: true,
            },
            ...prev,
          ];
        }
        return prev;
      } else {
        return prev.filter((s) => s.type !== "hero");
      }
    });
  };

  const handleProductLayoutChange = (layout: "grid" | "list" | "featured") => {
    setProductLayout(layout);
    setSections((prev) => {
      const hasProductSection = prev.some((s) => s.type === "products");
      if (hasProductSection) {
        return prev.map((s) =>
          s.type === "products" ? { ...s, productLayout: layout } : s
        );
      }
      return prev;
    });
  };

  const onSubmit = async (data: { [x: string]: string }) => {
    if (!shopSlug || shopSlug.trim() === "") {
      setShopSlugRequired(true);
      return;
    }
    setShopSlugRequired(false);
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
    if (shopSlug) {
      const storefrontConfig: StorefrontConfig = {
        colorScheme,
        productLayout,
        landingPageStyle,
        shopSlug,
        fontHeading: fontHeading || undefined,
        fontBody: fontBody || undefined,
        sections: sections.length > 0 ? sections : undefined,
        pages: pages.length > 0 ? pages : undefined,
        footer,
        navLinks: navLinks.length > 0 ? navLinks : undefined,
        showCommunityPage: showCommunityPage || undefined,
        showWalletPage: showWalletPage || undefined,
        emailPopup: emailPopup.enabled ? emailPopup : undefined,
      };
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
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);

    if (isOnboarding) {
      router.push("/onboarding/stripe-connect");
    }
  };

  if (isFetchingShop) {
    return <MilkMarketSpinner />;
  }

  return (
    <>
      <div className="mb-8 xl:max-w-[600px]">
        <div className="relative flex h-48 items-center justify-center overflow-hidden rounded-xl border-3 border-black bg-primary-blue">
          {watchBanner && (
            <img
              alt={"Shop Banner Image"}
              src={watchBanner}
              className="absolute inset-0 h-full w-full object-cover"
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
        <div className="space-y-6 xl:max-w-[600px]">
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
                      input: "text-base !text-black",
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
                input: "text-base !text-black",
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

          <div>
            <label className="mb-2 block text-base font-bold text-black">
              Free Shipping Threshold
            </label>
            <p className="mb-3 text-sm text-gray-500">
              Set a minimum order amount to offer free shipping. When a buyer's
              order total from your shop reaches this amount, shipping costs
              will be waived.
            </p>
            <div className="flex gap-3">
              <div className="flex-1">
                <Input
                  classNames={{
                    inputWrapper:
                      "border-3 border-black rounded-lg bg-white shadow-none hover:bg-white data-[hover=true]:bg-white group-data-[focus=true]:border-4 group-data-[focus=true]:border-black",
                    input: "text-base !text-black",
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

          {(() => {
            const fiatMethods = userPubkey
              ? Object.keys(
                  profileContext.profileData.get(userPubkey)?.content
                    ?.fiat_options || {}
                ).map((key) => ({
                  key,
                  label:
                    (
                      {
                        cash: "Cash",
                        venmo: "Venmo",
                        zelle: "Zelle",
                        cashapp: "Cash App",
                        applepay: "Apple Pay",
                        googlepay: "Google Pay",
                        paypal: "PayPal",
                      } as Record<string, string>
                    )[key] || key,
                }))
              : [];
            const availableMethods = [
              { key: "bitcoin", label: "Bitcoin (Lightning / Cashu / NWC)" },
              ...(hasStripeAccount
                ? [{ key: "stripe", label: "Card (Stripe)" }]
                : []),
              ...fiatMethods,
            ];
            if (availableMethods.length <= 1) return null;
            return (
              <div>
                <label className="mb-2 block text-base font-bold text-black">
                  Payment Method Discounts
                </label>
                <p className="mb-3 text-sm text-gray-500">
                  Offer flat percentage discounts for specific payment methods.
                  Buyers will see the discounted price on each payment button at
                  checkout.
                </p>
                <div className="space-y-3">
                  {availableMethods.map((method) => (
                    <div key={method.key} className="flex items-center gap-3">
                      <span className="w-56 text-sm font-medium text-black">
                        {method.label}
                      </span>
                      <div className="flex-1">
                        <Input
                          classNames={{
                            inputWrapper:
                              "border-3 border-black rounded-lg bg-white shadow-none hover:bg-white data-[hover=true]:bg-white group-data-[focus=true]:border-4 group-data-[focus=true]:border-black",
                            input: "text-base !text-black",
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
            );
          })()}

          {isOnboarding && (
            <div className="rounded-lg border-3 border-black bg-gray-50 p-4">
              <p className="text-sm text-gray-600">
                <span className="font-bold text-black">
                  Custom storefront & page settings
                </span>{" "}
                are available after onboarding in your shop settings.
              </p>
            </div>
          )}
        </div>

        {!isOnboarding && (
          <>
            <div className="border-t-4 border-black pt-6">
              <div className="flex items-start gap-6 xl:gap-0">
                <div className="w-full xl:h-[calc(100vh-6rem)] xl:w-[45%] xl:overflow-y-auto xl:pr-6">
                  <h2 className="mb-4 text-xl font-bold text-black">
                    Storefront Settings
                  </h2>
                  <p className="mb-6 text-sm text-gray-500">
                    Customize your standalone shop page. Buyers can visit your
                    storefront directly for a branded shopping experience.
                  </p>

                  {!storefrontAuthenticated ? (
                    <div className="flex flex-col items-center rounded-lg border-4 border-dashed border-gray-300 bg-gray-50 py-12">
                      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border-3 border-black bg-white">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={2}
                          stroke="currentColor"
                          className="h-8 w-8 text-black"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
                          />
                        </svg>
                      </div>
                      <h3 className="mb-2 text-lg font-bold text-black">
                        Listing Password Required
                      </h3>
                      <p className="mb-6 max-w-sm text-center text-sm text-gray-500">
                        Enter your listing password to access storefront
                        customization settings.
                      </p>
                      <Button
                        className={BLUEBUTTONCLASSNAMES}
                        type="button"
                        onPress={() => setStorefrontPasswordModal(true)}
                      >
                        Enter Password
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="mb-6">
                        <label className="mb-2 block text-base font-bold text-black">
                          Shop URL Slug
                        </label>
                        <div className="flex gap-3">
                          <div className="flex-1">
                            <Input
                              classNames={{
                                inputWrapper: `border-3 ${
                                  shopSlugRequired
                                    ? "border-red-500"
                                    : "border-black"
                                } rounded-lg bg-white shadow-none hover:bg-white data-[hover=true]:bg-white group-data-[focus=true]:border-4 group-data-[focus=true]:border-black`,
                                input: "text-base !text-black",
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
                                setShopSlugRequired(false);
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
                          <p className="mt-1 text-sm text-green-600">
                            Shop URL saved!
                          </p>
                        )}
                        {slugStatus === "error" && (
                          <p className="mt-1 text-sm text-red-600">
                            {slugError}
                          </p>
                        )}
                        {shopSlugRequired && (
                          <p className="mt-1 text-sm text-red-600">
                            A shop URL slug is required before saving.
                          </p>
                        )}
                        {shopSlug && slugStatus !== "error" && (
                          <p className="mt-1 text-xs text-gray-400">
                            Your shop will also be available at {shopSlug}
                            .milk.market
                          </p>
                        )}
                      </div>

                      <div className="mb-6">
                        <label className="mb-2 block text-base font-bold text-black">
                          Color Scheme
                        </label>
                        <div className="mb-3 flex flex-wrap gap-2">
                          {COLOR_PRESETS.map((preset) => {
                            const isActive =
                              !isCustomColorScheme &&
                              JSON.stringify(colorScheme) ===
                                JSON.stringify(preset.colors);
                            return (
                              <button
                                key={preset.name}
                                type="button"
                                onClick={() => {
                                  setColorScheme(preset.colors);
                                  setIsCustomColorScheme(false);
                                }}
                                className={`flex items-center gap-2 rounded-lg border-2 px-3 py-2 text-sm font-medium transition-all ${
                                  isActive
                                    ? "border-black shadow-neo"
                                    : "border-gray-300 hover:border-black"
                                }`}
                              >
                                <div className="flex gap-1">
                                  <div
                                    className="h-4 w-4 rounded-full border"
                                    style={{
                                      backgroundColor: preset.colors.primary,
                                    }}
                                  />
                                  <div
                                    className="h-4 w-4 rounded-full border"
                                    style={{
                                      backgroundColor: preset.colors.secondary,
                                    }}
                                  />
                                  <div
                                    className="h-4 w-4 rounded-full border"
                                    style={{
                                      backgroundColor: preset.colors.accent,
                                    }}
                                  />
                                </div>
                                {preset.name}
                              </button>
                            );
                          })}
                          <button
                            type="button"
                            onClick={() => setIsCustomColorScheme(true)}
                            className={`flex items-center gap-2 rounded-lg border-2 px-3 py-2 text-sm font-medium transition-all ${
                              isCustomColorScheme
                                ? "border-black shadow-neo"
                                : "border-gray-300 hover:border-black"
                            }`}
                          >
                            <div className="flex gap-1">
                              <div
                                className="h-4 w-4 rounded-full border"
                                style={{ backgroundColor: colorScheme.primary }}
                              />
                              <div
                                className="h-4 w-4 rounded-full border"
                                style={{
                                  backgroundColor: colorScheme.secondary,
                                }}
                              />
                              <div
                                className="h-4 w-4 rounded-full border"
                                style={{ backgroundColor: colorScheme.accent }}
                              />
                            </div>
                            Custom
                          </button>
                        </div>
                        {isCustomColorScheme && (
                          <div className="grid grid-cols-2 gap-3 rounded-lg border-2 border-gray-200 bg-gray-50 p-4 sm:grid-cols-5">
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
                        )}
                      </div>

                      <div className="mb-6">
                        <label className="mb-2 block text-base font-bold text-black">
                          Landing Page Style
                        </label>
                        <div className="grid grid-cols-3 gap-3">
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
                              onClick={() =>
                                handleLandingPageStyleChange(style.value)
                              }
                              className={`rounded-lg border-2 p-2 text-center transition-all ${
                                landingPageStyle === style.value
                                  ? "border-black shadow-neo"
                                  : "border-gray-300 hover:border-black"
                              }`}
                            >
                              <div className="mb-2 flex justify-center">
                                <LandingPagePreviewSvg variant={style.value} />
                              </div>
                              <span className="block text-sm font-bold text-black">
                                {style.label}
                              </span>
                              <span className="block text-[10px] leading-tight text-gray-500">
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
                        <div className="grid grid-cols-3 gap-3">
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
                              onClick={() =>
                                handleProductLayoutChange(layout.value)
                              }
                              className={`rounded-lg border-2 p-2 text-center transition-all ${
                                productLayout === layout.value
                                  ? "border-black shadow-neo"
                                  : "border-gray-300 hover:border-black"
                              }`}
                            >
                              <div className="mb-2 flex justify-center">
                                <ProductLayoutPreviewSvg
                                  variant={layout.value}
                                />
                              </div>
                              <span className="block text-sm font-bold text-black">
                                {layout.label}
                              </span>
                              <span className="block text-[10px] leading-tight text-gray-500">
                                {layout.desc}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="mb-6">
                        <label className="mb-2 block text-base font-bold text-black">
                          Fonts
                        </label>
                        <p className="mb-3 text-sm text-gray-500">
                          Choose Google Fonts for your storefront headings and
                          body text.
                        </p>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <Select
                            label="Heading Font"
                            classNames={{
                              trigger:
                                "border-3 border-black rounded-lg bg-white shadow-none hover:bg-white data-[hover=true]:bg-white",
                              value: "text-base !text-black",
                              popoverContent:
                                "border-2 border-black rounded-lg bg-white",
                              listbox: "!text-black",
                              label: "text-black",
                            }}
                            variant="bordered"
                            selectedKeys={fontHeading ? [fontHeading] : []}
                            onChange={(e) => setFontHeading(e.target.value)}
                          >
                            {GOOGLE_FONT_OPTIONS.map((f) => (
                              <SelectItem
                                key={f}
                                value={f}
                                className="text-black"
                              >
                                {f}
                              </SelectItem>
                            ))}
                          </Select>
                          <Select
                            label="Body Font"
                            classNames={{
                              trigger:
                                "border-3 border-black rounded-lg bg-white shadow-none hover:bg-white data-[hover=true]:bg-white",
                              value: "text-base !text-black",
                              popoverContent:
                                "border-2 border-black rounded-lg bg-white",
                              listbox: "!text-black",
                              label: "text-black",
                            }}
                            variant="bordered"
                            selectedKeys={fontBody ? [fontBody] : []}
                            onChange={(e) => setFontBody(e.target.value)}
                          >
                            {GOOGLE_FONT_OPTIONS.map((f) => (
                              <SelectItem
                                key={f}
                                value={f}
                                className="text-black"
                              >
                                {f}
                              </SelectItem>
                            ))}
                          </Select>
                        </div>
                      </div>

                      <div className="mb-6">
                        <PageEditor
                          pages={pages}
                          onChange={setPages}
                          navLinks={navLinks}
                          onNavLinksChange={setNavLinks}
                          sellerProducts={sellerProducts}
                        />
                      </div>

                      <div className="mb-6">
                        <label className="mb-2 flex items-center gap-3 text-base font-bold text-black">
                          <input
                            type="checkbox"
                            checked={showCommunityPage}
                            onChange={(e) =>
                              setShowCommunityPage(e.target.checked)
                            }
                            className="h-4 w-4 rounded border-gray-300"
                          />
                          Show Community Page
                        </label>
                        <p className="ml-7 text-sm text-gray-500">
                          Enable a community page on your storefront that
                          displays your community feed. A &quot;Community&quot;
                          link will be added to your storefront navigation bar.
                        </p>
                      </div>

                      <div className="mb-6">
                        <label className="mb-2 flex items-center gap-3 text-base font-bold text-black">
                          <input
                            type="checkbox"
                            checked={showWalletPage}
                            onChange={(e) =>
                              setShowWalletPage(e.target.checked)
                            }
                            className="h-4 w-4 rounded border-gray-300"
                          />
                          Show Bitcoin Wallet Page
                        </label>
                        <p className="ml-7 text-sm text-gray-500">
                          Enable a Bitcoin wallet page on your storefront for
                          Cashu ecash payments. A &quot;Wallet&quot; link will
                          be added to your storefront navigation bar.
                        </p>
                      </div>

                      <div className="mb-6 rounded-lg border-2 border-gray-200 p-4">
                        <label className="mb-2 flex items-center gap-3 text-base font-bold text-black">
                          <input
                            type="checkbox"
                            checked={emailPopup.enabled}
                            onChange={(e) =>
                              setEmailPopup({
                                ...emailPopup,
                                enabled: e.target.checked,
                              })
                            }
                            className="h-4 w-4 rounded border-gray-300"
                          />
                          Email Capture Popup
                        </label>
                        <p className="mb-3 ml-7 text-sm text-gray-500">
                          Show a popup to new visitors offering a discount code
                          in exchange for their email address (and optionally
                          phone number). The discount code is auto-generated and
                          emailed to the buyer.
                        </p>

                        {emailPopup.enabled && (
                          <div className="ml-7 space-y-4 border-t border-gray-100 pt-4">
                            <div>
                              <label className="mb-1 block text-sm font-semibold text-black">
                                Discount Percentage
                              </label>
                              <div className="flex items-center gap-2">
                                <Input
                                  type="number"
                                  min={1}
                                  max={100}
                                  classNames={{
                                    inputWrapper:
                                      "border-3 border-black rounded-lg bg-white shadow-none hover:bg-white data-[hover=true]:bg-white group-data-[focus=true]:border-4 group-data-[focus=true]:border-black w-24",
                                    input: "text-base !text-black",
                                  }}
                                  variant="bordered"
                                  value={String(emailPopup.discountPercentage)}
                                  onChange={(e) =>
                                    setEmailPopup({
                                      ...emailPopup,
                                      discountPercentage: Math.min(
                                        100,
                                        Math.max(
                                          1,
                                          parseInt(e.target.value) || 1
                                        )
                                      ),
                                    })
                                  }
                                />
                                <span className="text-sm font-medium text-gray-600">
                                  % off
                                </span>
                              </div>
                            </div>

                            <div>
                              <label className="mb-1 block text-sm font-semibold text-black">
                                Headline (optional)
                              </label>
                              <Input
                                classNames={{
                                  inputWrapper:
                                    "border-3 border-black rounded-lg bg-white shadow-none hover:bg-white data-[hover=true]:bg-white group-data-[focus=true]:border-4 group-data-[focus=true]:border-black",
                                  input: "text-base !text-black",
                                }}
                                variant="bordered"
                                fullWidth
                                placeholder={`Get ${emailPopup.discountPercentage}% Off Your First Order`}
                                value={emailPopup.headline || ""}
                                onChange={(e) =>
                                  setEmailPopup({
                                    ...emailPopup,
                                    headline: e.target.value || undefined,
                                  })
                                }
                              />
                            </div>

                            <div>
                              <label className="mb-1 block text-sm font-semibold text-black">
                                Subtext (optional)
                              </label>
                              <Input
                                classNames={{
                                  inputWrapper:
                                    "border-3 border-black rounded-lg bg-white shadow-none hover:bg-white data-[hover=true]:bg-white group-data-[focus=true]:border-4 group-data-[focus=true]:border-black",
                                  input: "text-base !text-black",
                                }}
                                variant="bordered"
                                fullWidth
                                placeholder="Sign up to receive an exclusive discount code."
                                value={emailPopup.subtext || ""}
                                onChange={(e) =>
                                  setEmailPopup({
                                    ...emailPopup,
                                    subtext: e.target.value || undefined,
                                  })
                                }
                              />
                            </div>

                            <div>
                              <label className="mb-1 block text-sm font-semibold text-black">
                                Button Text (optional)
                              </label>
                              <Input
                                classNames={{
                                  inputWrapper:
                                    "border-3 border-black rounded-lg bg-white shadow-none hover:bg-white data-[hover=true]:bg-white group-data-[focus=true]:border-4 group-data-[focus=true]:border-black",
                                  input: "text-base !text-black",
                                }}
                                variant="bordered"
                                fullWidth
                                placeholder="Get My Discount"
                                value={emailPopup.buttonText || ""}
                                onChange={(e) =>
                                  setEmailPopup({
                                    ...emailPopup,
                                    buttonText: e.target.value || undefined,
                                  })
                                }
                              />
                            </div>

                            <div>
                              <label className="mb-1 block text-sm font-semibold text-black">
                                Success Message (optional)
                              </label>
                              <Input
                                classNames={{
                                  inputWrapper:
                                    "border-3 border-black rounded-lg bg-white shadow-none hover:bg-white data-[hover=true]:bg-white group-data-[focus=true]:border-4 group-data-[focus=true]:border-black",
                                  input: "text-base !text-black",
                                }}
                                variant="bordered"
                                fullWidth
                                placeholder="Check your email for your discount code!"
                                value={emailPopup.successMessage || ""}
                                onChange={(e) =>
                                  setEmailPopup({
                                    ...emailPopup,
                                    successMessage: e.target.value || undefined,
                                  })
                                }
                              />
                            </div>

                            <div className="flex flex-col gap-2">
                              <label className="flex items-center gap-3 text-sm font-semibold text-black">
                                <input
                                  type="checkbox"
                                  checked={emailPopup.collectPhone || false}
                                  onChange={(e) =>
                                    setEmailPopup({
                                      ...emailPopup,
                                      collectPhone: e.target.checked,
                                      requirePhone: e.target.checked
                                        ? emailPopup.requirePhone
                                        : false,
                                    })
                                  }
                                  className="h-4 w-4 rounded border-gray-300"
                                />
                                Collect phone number
                              </label>
                              {emailPopup.collectPhone && (
                                <label className="ml-7 flex items-center gap-3 text-sm text-gray-600">
                                  <input
                                    type="checkbox"
                                    checked={emailPopup.requirePhone || false}
                                    onChange={(e) =>
                                      setEmailPopup({
                                        ...emailPopup,
                                        requirePhone: e.target.checked,
                                      })
                                    }
                                    className="h-4 w-4 rounded border-gray-300"
                                  />
                                  Make phone number required
                                </label>
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="mb-6">
                        <label className="mb-2 block text-base font-bold text-black">
                          Homepage Sections
                        </label>
                        <p className="mb-3 text-sm text-gray-500">
                          Build your storefront homepage by adding and arranging
                          content sections. If no sections are added, the
                          landing page style above is used instead.
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
                                setSections(
                                  sections.filter((_, i) => i !== idx)
                                )
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
                              sellerProducts={sellerProducts}
                              isNew={newSectionId === section.id}
                              onFlashDone={() => setNewSectionId(null)}
                            />
                          ))}
                        </div>
                        <div className="mt-3">
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
                            Add Section
                          </p>
                          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                            {(
                              [
                                {
                                  type: "hero" as StorefrontSectionType,
                                  label: "Hero",
                                  icon: "🖼",
                                  desc: "Full-width banner with call-to-action",
                                },
                                {
                                  type: "about" as StorefrontSectionType,
                                  label: "About",
                                  icon: "👋",
                                  desc: "Tell your farm's story with an image",
                                },
                                {
                                  type: "story" as StorefrontSectionType,
                                  label: "Our Story",
                                  icon: "📖",
                                  desc: "Timeline of your journey",
                                },
                                {
                                  type: "products" as StorefrontSectionType,
                                  label: "Products",
                                  icon: "🛒",
                                  desc: "Display your product catalog",
                                },
                                {
                                  type: "testimonials" as StorefrontSectionType,
                                  label: "Testimonials",
                                  icon: "⭐",
                                  desc: "Customer quotes and ratings",
                                },
                                {
                                  type: "faq" as StorefrontSectionType,
                                  label: "FAQ",
                                  icon: "❓",
                                  desc: "Common questions and answers",
                                },
                                {
                                  type: "ingredients" as StorefrontSectionType,
                                  label: "Ingredients",
                                  icon: "🌿",
                                  desc: "Highlight what goes into your products",
                                },
                                {
                                  type: "comparison" as StorefrontSectionType,
                                  label: "Comparison",
                                  icon: "⚖️",
                                  desc: "Compare your products vs alternatives",
                                },
                                {
                                  type: "text" as StorefrontSectionType,
                                  label: "Text",
                                  icon: "📝",
                                  desc: "Free-form text content block",
                                },
                                {
                                  type: "image" as StorefrontSectionType,
                                  label: "Image",
                                  icon: "📷",
                                  desc: "Full or contained image with caption",
                                },
                                {
                                  type: "contact" as StorefrontSectionType,
                                  label: "Contact",
                                  icon: "📬",
                                  desc: "Email, phone, and address info",
                                },
                                {
                                  type: "reviews" as StorefrontSectionType,
                                  label: "Reviews",
                                  icon: "💬",
                                  desc: "Show customer reviews from Nostr",
                                },
                              ] as const
                            ).map((st) => (
                              <button
                                key={st.type}
                                type="button"
                                onClick={() => {
                                  const sectionId = `section-${Date.now()}-${Math.random()
                                    .toString(36)
                                    .slice(2, 6)}`;
                                  const newSection: StorefrontSection = {
                                    id: sectionId,
                                    type: st.type,
                                    enabled: true,
                                  };
                                  if (st.type === "products") {
                                    newSection.productLayout = productLayout;
                                  }
                                  setNewSectionId(sectionId);
                                  if (st.type === "hero") {
                                    setSections([newSection, ...sections]);
                                  } else {
                                    setSections([...sections, newSection]);
                                  }
                                }}
                                className="group flex flex-col items-center rounded-lg border-2 border-gray-200 bg-white p-3 text-center transition-all hover:border-black hover:shadow-sm"
                              >
                                <div className="mb-2">
                                  <SectionPreviewSvg type={st.type} />
                                </div>
                                <span className="block text-sm font-bold text-black">
                                  {st.label}
                                </span>
                                <span className="block text-[10px] leading-tight text-gray-400 group-hover:text-gray-600">
                                  {st.desc}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="mb-6">
                        <label className="mb-2 block text-base font-bold text-black">
                          Footer
                        </label>
                        <p className="mb-3 text-sm text-gray-500">
                          Customize the footer at the bottom of your storefront.
                        </p>
                        <FooterEditor
                          footer={footer}
                          onChange={setFooter}
                          shopName={watch("name")}
                        />
                      </div>

                      <div className="mb-6">
                        <label className="mb-2 block text-base font-bold text-black">
                          Custom Domain
                        </label>
                        <p className="mb-2 text-sm text-gray-500">
                          Want to use your own domain (e.g.,
                          shop.yourdomain.com) for your storefront? We can help
                          set that up for you.
                        </p>
                        <a
                          href="mailto:support@milk.market?subject=Custom%20Domain%20Request&body=Hi%2C%20I%27d%20like%20to%20set%20up%20a%20custom%20domain%20for%20my%20storefront.%0A%0AShop%20URL%3A%20milk.market%2Fshop%2F%0ADomain%3A%20"
                          className="inline-block rounded-lg border-3 border-black bg-white px-4 py-2 text-sm font-bold text-black hover:bg-gray-100"
                        >
                          Contact Us
                        </a>
                      </div>

                      <div className="hidden rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-4 xl:block">
                        <div className="flex items-center gap-3">
                          {shopSlug && (
                            <a
                              href={`/shop/${shopSlug}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm font-bold text-primary-blue underline"
                            >
                              Open live storefront (/shop/{shopSlug})
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => setIsPreviewOpen(true)}
                            className="text-xs text-gray-400 underline hover:text-gray-600"
                          >
                            Open full-screen preview
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {storefrontAuthenticated && (
                  <div className="sticky top-4 hidden h-[calc(100vh-6rem)] xl:block xl:w-[55%]">
                    <div className="h-full overflow-hidden rounded-lg border-2 border-gray-200">
                      <StorefrontPreviewPanel
                        shopName={watch("name")}
                        shopAbout={watch("about")}
                        pictureUrl={watch("picture")}
                        bannerUrl={watch("banner")}
                        colors={colorScheme}
                        productLayout={productLayout}
                        landingPageStyle={landingPageStyle}
                        fontHeading={fontHeading}
                        fontBody={fontBody}
                        sections={sections}
                        pages={pages}
                        footer={footer}
                        navLinks={navLinks}
                        shopSlug={shopSlug}
                        compact
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {storefrontAuthenticated && !isMobilePreviewOpen && (
              <button
                type="button"
                onClick={() => setIsMobilePreviewOpen(true)}
                className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full border-3 border-black bg-black px-5 py-3 font-bold text-white shadow-lg transition-transform hover:scale-105 xl:hidden"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="h-5 w-5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
                  />
                </svg>
                Preview Shop
              </button>
            )}

            {(isMobilePreviewOpen || isMobilePreviewClosing) && (
              <div
                className="fixed inset-0 z-[9998] flex flex-col bg-white xl:hidden"
                style={{
                  animation: isMobilePreviewClosing
                    ? "slideOutDown 0.3s ease-in forwards"
                    : "slideInUp 0.3s ease-out",
                }}
                onAnimationEnd={() => {
                  if (isMobilePreviewClosing) {
                    setIsMobilePreviewClosing(false);
                    setIsMobilePreviewOpen(false);
                  }
                }}
              >
                <div className="flex items-center justify-between border-b-2 border-black bg-white px-4 py-3">
                  <h3 className="text-base font-bold text-black">
                    Storefront Preview
                  </h3>
                  <button
                    type="button"
                    onClick={() => setIsMobilePreviewClosing(true)}
                    className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-black text-black transition-colors hover:bg-gray-100"
                  >
                    ✕
                  </button>
                </div>
                <div className="flex-1 overflow-hidden">
                  <StorefrontPreviewPanel
                    shopName={watch("name")}
                    shopAbout={watch("about")}
                    pictureUrl={watch("picture")}
                    bannerUrl={watch("banner")}
                    colors={colorScheme}
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
                </div>
                <style>{`
                  @keyframes slideInUp {
                    from { transform: translateY(100%); }
                    to { transform: translateY(0); }
                  }
                  @keyframes slideOutDown {
                    from { transform: translateY(0); }
                    to { transform: translateY(100%); }
                  }
                `}</style>
              </div>
            )}
          </>
        )}

        <div className="xl:max-w-[600px]">
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
            {isSaved ? "✅ Saved!" : "Save Shop"}
          </Button>

          {shopSlug && (
            <div className="mt-6 border-t-2 border-dashed border-gray-300 pt-4">
              <Dropdown
                placement="top-start"
                classNames={{
                  content:
                    "bg-white border-4 border-black rounded-md shadow-neo",
                }}
              >
                <DropdownTrigger>
                  <Button
                    className="border-3 border-red-500 bg-white font-bold text-red-500 hover:bg-red-50"
                    type="button"
                  >
                    Remove Storefront
                  </Button>
                </DropdownTrigger>
                <DropdownMenu
                  variant="flat"
                  aria-label="Confirm Remove"
                  classNames={{ base: "text-black" }}
                >
                  <DropdownSection
                    title="Are you sure you want to delete your shop?"
                    showDivider={true}
                    classNames={{ heading: "text-black font-semibold" }}
                  >
                    <DropdownItem
                      key="confirm-remove"
                      className="font-bold text-red-500 data-[hover=true]:bg-red-50"
                      color="danger"
                      onClick={handleRemoveStorefront}
                    >
                      Yes, Remove Storefront
                    </DropdownItem>
                  </DropdownSection>
                </DropdownMenu>
              </Dropdown>
              <p className="mt-1 text-xs text-gray-400">
                This will delete your shop URL, custom domain, and reset all
                storefront customization.
              </p>
            </div>
          )}
        </div>
      </form>

      <StorefrontPreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        shopName={watch("name")}
        shopAbout={watch("about")}
        pictureUrl={watch("picture")}
        bannerUrl={watch("banner")}
        colors={colorScheme}
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

      <Modal
        backdrop="blur"
        isOpen={storefrontPasswordModal}
        onClose={() => {
          setStorefrontPasswordModal(false);
          setStorefrontPasswordInput("");
          setStorefrontPasswordError("");
        }}
        classNames={{
          body: "py-6 bg-white",
          backdrop: "bg-black/50 backdrop-opacity-60",
          header: "border-b-4 border-black bg-white rounded-t-lg",
          footer: "border-t-4 border-black bg-white rounded-b-lg",
          closeButton: "hover:bg-gray-100 active:bg-gray-200",
          base: "light border-4 border-black shadow-neo rounded-lg",
        }}
        scrollBehavior="outside"
        size="md"
        isDismissable={true}
      >
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1 text-black">
            <h3 className="text-xl font-bold">Enter Listing Password</h3>
          </ModalHeader>
          <ModalBody>
            <Input
              classNames={{
                input: "text-black font-medium",
                inputWrapper:
                  "border-2 border-black shadow-none bg-white rounded-md",
                label: "text-black",
              }}
              autoFocus
              variant="bordered"
              label="Password"
              labelPlacement="inside"
              type="password"
              value={storefrontPasswordInput}
              onChange={(e) => setStorefrontPasswordInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleStorefrontPasswordSubmit();
                }
              }}
              isInvalid={!!storefrontPasswordError}
              errorMessage={storefrontPasswordError}
            />
            {storefrontPasswordError && (
              <div className="mt-2 text-sm font-bold text-red-500">
                {storefrontPasswordError}
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <Button
              className="font-bold text-black hover:underline"
              variant="light"
              onClick={() => {
                setStorefrontPasswordModal(false);
                setStorefrontPasswordInput("");
                setStorefrontPasswordError("");
              }}
            >
              Cancel
            </Button>
            <Button
              className={BLUEBUTTONCLASSNAMES}
              onClick={handleStorefrontPasswordSubmit}
              isDisabled={!storefrontPasswordInput.trim()}
            >
              Submit
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
};

function SectionPreviewSvg({ type }: { type: string }) {
  const w = 100;
  const h = 56;
  switch (type) {
    case "hero":
      return (
        <svg
          width={w}
          height={h}
          viewBox={`0 0 ${w} ${h}`}
          fill="none"
          className="rounded"
        >
          <rect width={w} height={h} rx="3" fill="#94A3B8" />
          <rect x="8" y="10" width="42" height="5" rx="1.5" fill="#fff" />
          <rect x="8" y="18" width="30" height="3" rx="1" fill="#CBD5E1" />
          <rect x="8" y="24" width="20" height="6" rx="2" fill="#3B82F6" />
          <rect
            x="8"
            y="38"
            width="18"
            height="12"
            rx="2"
            fill="rgba(255,255,255,0.3)"
          />
          <rect
            x="30"
            y="38"
            width="18"
            height="12"
            rx="2"
            fill="rgba(255,255,255,0.3)"
          />
          <rect
            x="52"
            y="38"
            width="18"
            height="12"
            rx="2"
            fill="rgba(255,255,255,0.3)"
          />
        </svg>
      );
    case "about":
      return (
        <svg
          width={w}
          height={h}
          viewBox={`0 0 ${w} ${h}`}
          fill="none"
          className="rounded"
        >
          <rect width={w} height={h} rx="3" fill="#F8FAFC" />
          <rect x="6" y="6" width="36" height="5" rx="1.5" fill="#334155" />
          <rect x="6" y="14" width="44" height="3" rx="1" fill="#94A3B8" />
          <rect x="6" y="19" width="40" height="3" rx="1" fill="#94A3B8" />
          <rect x="6" y="24" width="38" height="3" rx="1" fill="#94A3B8" />
          <rect x="6" y="29" width="30" height="3" rx="1" fill="#94A3B8" />
          <rect x="56" y="6" width="38" height="30" rx="3" fill="#CBD5E1" />
        </svg>
      );
    case "story":
      return (
        <svg
          width={w}
          height={h}
          viewBox={`0 0 ${w} ${h}`}
          fill="none"
          className="rounded"
        >
          <rect width={w} height={h} rx="3" fill="#F8FAFC" />
          <rect x="6" y="5" width="30" height="4" rx="1.5" fill="#334155" />
          <line
            x1="16"
            y1="14"
            x2="16"
            y2="50"
            stroke="#CBD5E1"
            strokeWidth="2"
          />
          <circle cx="16" cy="18" r="3" fill="#3B82F6" />
          <rect x="24" y="16" width="30" height="3" rx="1" fill="#334155" />
          <rect x="24" y="21" width="50" height="2" rx="1" fill="#94A3B8" />
          <circle cx="16" cy="32" r="3" fill="#3B82F6" />
          <rect x="24" y="30" width="30" height="3" rx="1" fill="#334155" />
          <rect x="24" y="35" width="50" height="2" rx="1" fill="#94A3B8" />
          <circle cx="16" cy="46" r="3" fill="#3B82F6" />
          <rect x="24" y="44" width="30" height="3" rx="1" fill="#334155" />
          <rect x="24" y="49" width="50" height="2" rx="1" fill="#94A3B8" />
        </svg>
      );
    case "products":
      return (
        <svg
          width={w}
          height={h}
          viewBox={`0 0 ${w} ${h}`}
          fill="none"
          className="rounded"
        >
          <rect width={w} height={h} rx="3" fill="#F8FAFC" />
          <rect x="6" y="5" width="30" height="4" rx="1.5" fill="#334155" />
          <rect x="6" y="14" width="26" height="18" rx="2" fill="#CBD5E1" />
          <rect x="8" y="34" width="22" height="3" rx="1" fill="#334155" />
          <rect x="8" y="39" width="14" height="2" rx="1" fill="#3B82F6" />
          <rect x="37" y="14" width="26" height="18" rx="2" fill="#CBD5E1" />
          <rect x="39" y="34" width="22" height="3" rx="1" fill="#334155" />
          <rect x="39" y="39" width="14" height="2" rx="1" fill="#3B82F6" />
          <rect x="68" y="14" width="26" height="18" rx="2" fill="#CBD5E1" />
          <rect x="70" y="34" width="22" height="3" rx="1" fill="#334155" />
          <rect x="70" y="39" width="14" height="2" rx="1" fill="#3B82F6" />
        </svg>
      );
    case "testimonials":
      return (
        <svg
          width={w}
          height={h}
          viewBox={`0 0 ${w} ${h}`}
          fill="none"
          className="rounded"
        >
          <rect width={w} height={h} rx="3" fill="#F8FAFC" />
          <rect x="6" y="5" width="40" height="4" rx="1.5" fill="#334155" />
          <rect x="8" y="14" width="38" height="34" rx="3" fill="#E2E8F0" />
          <text x="12" y="22" fontSize="8" fill="#94A3B8">
            &ldquo;
          </text>
          <rect x="12" y="24" width="30" height="2" rx="1" fill="#94A3B8" />
          <rect x="12" y="28" width="26" height="2" rx="1" fill="#94A3B8" />
          <rect x="12" y="34" width="18" height="2" rx="1" fill="#334155" />
          <rect x="12" y="38" width="30" height="3" rx="1" fill="#F59E0B" />
          <rect x="52" y="14" width="38" height="34" rx="3" fill="#E2E8F0" />
          <text x="56" y="22" fontSize="8" fill="#94A3B8">
            &ldquo;
          </text>
          <rect x="56" y="24" width="30" height="2" rx="1" fill="#94A3B8" />
          <rect x="56" y="28" width="26" height="2" rx="1" fill="#94A3B8" />
          <rect x="56" y="34" width="18" height="2" rx="1" fill="#334155" />
          <rect x="56" y="38" width="30" height="3" rx="1" fill="#F59E0B" />
        </svg>
      );
    case "faq":
      return (
        <svg
          width={w}
          height={h}
          viewBox={`0 0 ${w} ${h}`}
          fill="none"
          className="rounded"
        >
          <rect width={w} height={h} rx="3" fill="#F8FAFC" />
          <rect x="6" y="5" width="20" height="4" rx="1.5" fill="#334155" />
          <rect x="6" y="13" width="88" height="10" rx="2" fill="#E2E8F0" />
          <rect x="10" y="16" width="50" height="3" rx="1" fill="#334155" />
          <rect x="82" y="16" width="8" height="3" rx="1" fill="#94A3B8" />
          <rect x="6" y="26" width="88" height="10" rx="2" fill="#E2E8F0" />
          <rect x="10" y="29" width="45" height="3" rx="1" fill="#334155" />
          <rect x="82" y="29" width="8" height="3" rx="1" fill="#94A3B8" />
          <rect x="6" y="39" width="88" height="10" rx="2" fill="#E2E8F0" />
          <rect x="10" y="42" width="55" height="3" rx="1" fill="#334155" />
          <rect x="82" y="42" width="8" height="3" rx="1" fill="#94A3B8" />
        </svg>
      );
    case "ingredients":
      return (
        <svg
          width={w}
          height={h}
          viewBox={`0 0 ${w} ${h}`}
          fill="none"
          className="rounded"
        >
          <rect width={w} height={h} rx="3" fill="#F8FAFC" />
          <rect x="6" y="5" width="35" height="4" rx="1.5" fill="#334155" />
          <circle cx="18" cy="24" r="8" fill="#D1FAE5" />
          <rect x="10" y="34" width="16" height="3" rx="1" fill="#334155" />
          <rect x="10" y="39" width="16" height="2" rx="1" fill="#94A3B8" />
          <circle cx="50" cy="24" r="8" fill="#DBEAFE" />
          <rect x="42" y="34" width="16" height="3" rx="1" fill="#334155" />
          <rect x="42" y="39" width="16" height="2" rx="1" fill="#94A3B8" />
          <circle cx="82" cy="24" r="8" fill="#FEF3C7" />
          <rect x="74" y="34" width="16" height="3" rx="1" fill="#334155" />
          <rect x="74" y="39" width="16" height="2" rx="1" fill="#94A3B8" />
        </svg>
      );
    case "comparison":
      return (
        <svg
          width={w}
          height={h}
          viewBox={`0 0 ${w} ${h}`}
          fill="none"
          className="rounded"
        >
          <rect width={w} height={h} rx="3" fill="#F8FAFC" />
          <rect x="6" y="5" width="35" height="4" rx="1.5" fill="#334155" />
          <rect x="6" y="13" width="88" height="1" fill="#E2E8F0" />
          <rect x="6" y="17" width="24" height="3" rx="1" fill="#94A3B8" />
          <rect x="38" y="17" width="24" height="3" rx="1" fill="#334155" />
          <rect x="70" y="17" width="24" height="3" rx="1" fill="#334155" />
          <rect x="6" y="23" width="88" height="1" fill="#E2E8F0" />
          <rect x="6" y="27" width="24" height="3" rx="1" fill="#94A3B8" />
          <circle cx="50" cy="28" r="3" fill="#22C55E" />
          <circle cx="82" cy="28" r="3" fill="#EF4444" />
          <rect x="6" y="33" width="88" height="1" fill="#E2E8F0" />
          <rect x="6" y="37" width="24" height="3" rx="1" fill="#94A3B8" />
          <circle cx="50" cy="38" r="3" fill="#22C55E" />
          <circle cx="82" cy="38" r="3" fill="#22C55E" />
          <rect x="6" y="43" width="88" height="1" fill="#E2E8F0" />
          <rect x="6" y="47" width="24" height="3" rx="1" fill="#94A3B8" />
          <circle cx="50" cy="48" r="3" fill="#22C55E" />
          <circle cx="82" cy="48" r="3" fill="#EF4444" />
        </svg>
      );
    case "text":
      return (
        <svg
          width={w}
          height={h}
          viewBox={`0 0 ${w} ${h}`}
          fill="none"
          className="rounded"
        >
          <rect width={w} height={h} rx="3" fill="#F8FAFC" />
          <rect x="14" y="8" width="72" height="5" rx="1.5" fill="#334155" />
          <rect x="10" y="18" width="80" height="3" rx="1" fill="#94A3B8" />
          <rect x="10" y="24" width="80" height="3" rx="1" fill="#94A3B8" />
          <rect x="10" y="30" width="75" height="3" rx="1" fill="#94A3B8" />
          <rect x="10" y="36" width="80" height="3" rx="1" fill="#94A3B8" />
          <rect x="10" y="42" width="60" height="3" rx="1" fill="#94A3B8" />
        </svg>
      );
    case "image":
      return (
        <svg
          width={w}
          height={h}
          viewBox={`0 0 ${w} ${h}`}
          fill="none"
          className="rounded"
        >
          <rect width={w} height={h} rx="3" fill="#F8FAFC" />
          <rect x="10" y="4" width="80" height="40" rx="3" fill="#CBD5E1" />
          <circle cx="26" cy="18" r="6" fill="#94A3B8" />
          <polygon points="30,38 50,20 70,38" fill="#94A3B8" />
          <polygon points="60,38 72,26 84,38" fill="#B0BEC5" />
          <rect x="20" y="48" width="60" height="3" rx="1" fill="#94A3B8" />
        </svg>
      );
    case "contact":
      return (
        <svg
          width={w}
          height={h}
          viewBox={`0 0 ${w} ${h}`}
          fill="none"
          className="rounded"
        >
          <rect width={w} height={h} rx="3" fill="#F8FAFC" />
          <rect x="6" y="5" width="30" height="4" rx="1.5" fill="#334155" />
          <rect x="6" y="14" width="40" height="8" rx="2" fill="#E2E8F0" />
          <rect x="10" y="17" width="20" height="2" rx="1" fill="#94A3B8" />
          <rect x="6" y="26" width="40" height="8" rx="2" fill="#E2E8F0" />
          <rect x="10" y="29" width="24" height="2" rx="1" fill="#94A3B8" />
          <rect x="6" y="38" width="40" height="14" rx="2" fill="#E2E8F0" />
          <rect x="10" y="41" width="32" height="2" rx="1" fill="#94A3B8" />
          <rect x="10" y="45" width="28" height="2" rx="1" fill="#94A3B8" />
          <rect x="56" y="14" width="38" height="38" rx="3" fill="#CBD5E1" />
        </svg>
      );
    case "reviews":
      return (
        <svg
          width={w}
          height={h}
          viewBox={`0 0 ${w} ${h}`}
          fill="none"
          className="rounded"
        >
          <rect width={w} height={h} rx="3" fill="#F8FAFC" />
          <rect x="6" y="5" width="30" height="4" rx="1.5" fill="#334155" />
          <rect x="6" y="13" width="88" height="18" rx="3" fill="#E2E8F0" />
          <rect x="10" y="16" width="30" height="3" rx="1" fill="#F59E0B" />
          <rect x="10" y="21" width="60" height="2" rx="1" fill="#94A3B8" />
          <rect x="10" y="25" width="20" height="2" rx="1" fill="#334155" />
          <rect x="6" y="34" width="88" height="18" rx="3" fill="#E2E8F0" />
          <rect x="10" y="37" width="30" height="3" rx="1" fill="#F59E0B" />
          <rect x="10" y="42" width="55" height="2" rx="1" fill="#94A3B8" />
          <rect x="10" y="46" width="20" height="2" rx="1" fill="#334155" />
        </svg>
      );
    default:
      return null;
  }
}

function LandingPagePreviewSvg({
  variant,
}: {
  variant: "hero" | "classic" | "minimal";
}) {
  const w = 120;
  const h = 80;
  if (variant === "hero") {
    return (
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        fill="none"
        className="rounded"
      >
        <rect width={w} height={h} rx="4" fill="#E2E8F0" />
        <rect x="0" y="0" width={w} height="50" rx="4" fill="#94A3B8" />
        <rect x="10" y="12" width="50" height="6" rx="2" fill="#fff" />
        <rect x="10" y="22" width="35" height="4" rx="1" fill="#CBD5E1" />
        <rect x="10" y="30" width="24" height="8" rx="2" fill="#3B82F6" />
        <rect x="8" y="56" width="24" height="18" rx="2" fill="#CBD5E1" />
        <rect x="36" y="56" width="24" height="18" rx="2" fill="#CBD5E1" />
        <rect x="64" y="56" width="24" height="18" rx="2" fill="#CBD5E1" />
        <rect x="92" y="56" width="24" height="18" rx="2" fill="#CBD5E1" />
      </svg>
    );
  }
  if (variant === "classic") {
    return (
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        fill="none"
        className="rounded"
      >
        <rect width={w} height={h} rx="4" fill="#E2E8F0" />
        <rect x="0" y="0" width={w} height="32" rx="4" fill="#94A3B8" />
        <rect x="10" y="38" width="50" height="6" rx="2" fill="#334155" />
        <rect x="10" y="48" width="70" height="4" rx="1" fill="#94A3B8" />
        <rect x="8" y="58" width="24" height="16" rx="2" fill="#CBD5E1" />
        <rect x="36" y="58" width="24" height="16" rx="2" fill="#CBD5E1" />
        <rect x="64" y="58" width="24" height="16" rx="2" fill="#CBD5E1" />
        <rect x="92" y="58" width="24" height="16" rx="2" fill="#CBD5E1" />
      </svg>
    );
  }
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      fill="none"
      className="rounded"
    >
      <rect width={w} height={h} rx="4" fill="#F8FAFC" />
      <rect x="10" y="8" width="40" height="6" rx="2" fill="#334155" />
      <rect x="10" y="18" width="60" height="4" rx="1" fill="#94A3B8" />
      <rect x="10" y="26" width="100" height="1" fill="#E2E8F0" />
      <rect x="8" y="32" width="24" height="18" rx="2" fill="#CBD5E1" />
      <rect x="36" y="32" width="24" height="18" rx="2" fill="#CBD5E1" />
      <rect x="64" y="32" width="24" height="18" rx="2" fill="#CBD5E1" />
      <rect x="92" y="32" width="24" height="18" rx="2" fill="#CBD5E1" />
      <rect x="8" y="54" width="24" height="18" rx="2" fill="#CBD5E1" />
      <rect x="36" y="54" width="24" height="18" rx="2" fill="#CBD5E1" />
      <rect x="64" y="54" width="24" height="18" rx="2" fill="#CBD5E1" />
      <rect x="92" y="54" width="24" height="18" rx="2" fill="#CBD5E1" />
    </svg>
  );
}

function ProductLayoutPreviewSvg({
  variant,
}: {
  variant: "grid" | "list" | "featured";
}) {
  const w = 120;
  const h = 80;
  if (variant === "grid") {
    return (
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        fill="none"
        className="rounded"
      >
        <rect width={w} height={h} rx="4" fill="#F8FAFC" />
        <rect x="6" y="6" width="34" height="28" rx="3" fill="#CBD5E1" />
        <rect x="10" y="36" width="26" height="3" rx="1" fill="#334155" />
        <rect x="44" y="6" width="34" height="28" rx="3" fill="#CBD5E1" />
        <rect x="48" y="36" width="26" height="3" rx="1" fill="#334155" />
        <rect x="82" y="6" width="34" height="28" rx="3" fill="#CBD5E1" />
        <rect x="86" y="36" width="26" height="3" rx="1" fill="#334155" />
        <rect x="6" y="44" width="34" height="28" rx="3" fill="#CBD5E1" />
        <rect x="10" y="74" width="26" height="3" rx="1" fill="#334155" />
        <rect x="44" y="44" width="34" height="28" rx="3" fill="#CBD5E1" />
        <rect x="48" y="74" width="26" height="3" rx="1" fill="#334155" />
        <rect x="82" y="44" width="34" height="28" rx="3" fill="#CBD5E1" />
        <rect x="86" y="74" width="26" height="3" rx="1" fill="#334155" />
      </svg>
    );
  }
  if (variant === "list") {
    return (
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        fill="none"
        className="rounded"
      >
        <rect width={w} height={h} rx="4" fill="#F8FAFC" />
        <rect x="6" y="6" width="22" height="18" rx="3" fill="#CBD5E1" />
        <rect x="32" y="8" width="50" height="4" rx="1" fill="#334155" />
        <rect x="32" y="14" width="70" height="3" rx="1" fill="#94A3B8" />
        <rect x="32" y="19" width="20" height="3" rx="1" fill="#3B82F6" />
        <rect x="6" y="28" width="22" height="18" rx="3" fill="#CBD5E1" />
        <rect x="32" y="30" width="50" height="4" rx="1" fill="#334155" />
        <rect x="32" y="36" width="70" height="3" rx="1" fill="#94A3B8" />
        <rect x="32" y="41" width="20" height="3" rx="1" fill="#3B82F6" />
        <rect x="6" y="50" width="22" height="18" rx="3" fill="#CBD5E1" />
        <rect x="32" y="52" width="50" height="4" rx="1" fill="#334155" />
        <rect x="32" y="58" width="70" height="3" rx="1" fill="#94A3B8" />
        <rect x="32" y="63" width="20" height="3" rx="1" fill="#3B82F6" />
      </svg>
    );
  }
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      fill="none"
      className="rounded"
    >
      <rect width={w} height={h} rx="4" fill="#F8FAFC" />
      <rect x="4" y="4" width="55" height="36" rx="3" fill="#CBD5E1" />
      <rect x="63" y="6" width="20" height="3" rx="1" fill="#3B82F6" />
      <rect x="63" y="12" width="50" height="5" rx="1" fill="#334155" />
      <rect x="63" y="20" width="50" height="3" rx="1" fill="#94A3B8" />
      <rect x="63" y="25" width="45" height="3" rx="1" fill="#94A3B8" />
      <rect x="63" y="32" width="24" height="4" rx="1" fill="#3B82F6" />
      <rect x="4" y="44" width="34" height="28" rx="3" fill="#CBD5E1" />
      <rect x="8" y="74" width="26" height="3" rx="1" fill="#334155" />
      <rect x="42" y="44" width="34" height="28" rx="3" fill="#CBD5E1" />
      <rect x="46" y="74" width="26" height="3" rx="1" fill="#334155" />
      <rect x="80" y="44" width="34" height="28" rx="3" fill="#CBD5E1" />
      <rect x="84" y="74" width="26" height="3" rx="1" fill="#334155" />
    </svg>
  );
}

export default ShopProfileForm;
