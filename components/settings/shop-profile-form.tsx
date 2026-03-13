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
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
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
  const [isFetchingShop, setIsFetchingShop] = useState(false);
  const [notificationEmail, setNotificationEmail] = useState("");
  const [freeShippingThreshold, setFreeShippingThreshold] =
    useState<string>("");
  const [freeShippingCurrency, setFreeShippingCurrency] =
    useState<string>("USD");
  const [paymentMethodDiscounts, setPaymentMethodDiscounts] = useState<{
    [method: string]: string;
  }>({});

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
  const [productLayout, setProductLayout] = useState<
    "grid" | "list" | "featured"
  >("grid");
  const [landingPageStyle, setLandingPageStyle] = useState<
    "classic" | "hero" | "minimal"
  >("hero");
  const [customDomain, setCustomDomain] = useState("");
  const [domainError, setDomainError] = useState("");
  const [domainInfo, setDomainInfo] = useState<{
    domain: string;
    verified: boolean;
  } | null>(null);
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
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

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
        if (sf.fontHeading) setFontHeading(sf.fontHeading);
        if (sf.fontBody) setFontBody(sf.fontBody);
        if (sf.sections) setSections(sf.sections);
        if (sf.pages) setPages(sf.pages);
        if (sf.footer) setFooter(sf.footer);
        if (sf.navLinks) setNavLinks(sf.navLinks);
        if (sf.showCommunityPage) setShowCommunityPage(sf.showCommunityPage);
        if (sf.showWalletPage) setShowWalletPage(sf.showWalletPage);
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

  const handleRemoveStorefront = async () => {
    if (!userPubkey) return;
    const confirmed = window.confirm(
      "Are you sure you want to remove your storefront? This will delete your shop URL, custom domain, and reset all storefront settings."
    );
    if (!confirmed) return;

    try {
      await fetch("/api/storefront/register-slug", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pubkey: userPubkey }),
      });

      setShopSlug("");
      setCustomDomain("");
      setDomainInfo(null);
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

  const handleRemoveCustomDomain = async () => {
    if (!userPubkey) return;
    try {
      await fetch("/api/storefront/custom-domain", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pubkey: userPubkey }),
      });
      setCustomDomain("");
      setDomainInfo(null);
    } catch {}
  };

  const handleSaveCustomDomain = async () => {
    if (!customDomain || !userPubkey) return;
    setDomainError("");
    try {
      const res = await fetch("/api/storefront/custom-domain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pubkey: userPubkey, domain: customDomain }),
      });
      const data = await res.json();
      if (res.ok) {
        setDomainInfo({ domain: data.domain, verified: data.verified });
      } else {
        setDomainError(data.error || "Failed to connect domain");
      }
    } catch {
      setDomainError("Failed to connect domain");
    }
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
    if (shopSlug) {
      const storefrontConfig: StorefrontConfig = {
        colorScheme,
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
                      <p className="mt-1 text-sm text-green-600">
                        Shop URL saved!
                      </p>
                    )}
                    {slugStatus === "error" && (
                      <p className="mt-1 text-sm text-red-600">{slugError}</p>
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
                              style={{
                                backgroundColor: preset.colors.secondary,
                              }}
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
                      Fonts
                    </label>
                    <p className="mb-3 text-sm text-gray-500">
                      Choose Google Fonts for your storefront headings and body
                      text.
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
                          <SelectItem key={f} value={f} className="text-black">
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
                          <SelectItem key={f} value={f} className="text-black">
                            {f}
                          </SelectItem>
                        ))}
                      </Select>
                    </div>
                  </div>

                  <div className="mb-6">
                    <label className="mb-2 block text-base font-bold text-black">
                      Navigation Links
                    </label>
                    <p className="mb-3 text-sm text-gray-500">
                      Define the top navigation bar links for your storefront.
                      Leave empty to hide the nav bar.
                    </p>
                    <div className="space-y-2">
                      {navLinks.map((link, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <Input
                            classNames={{
                              inputWrapper:
                                "border-2 border-gray-300 rounded-lg bg-white shadow-none",
                            }}
                            variant="bordered"
                            value={link.label}
                            onChange={(e) => {
                              const updated = [...navLinks];
                              updated[idx] = {
                                ...updated[idx],
                                label: e.target.value,
                              };
                              setNavLinks(updated);
                            }}
                            placeholder="Label"
                            className="w-32"
                          />
                          <Input
                            classNames={{
                              inputWrapper:
                                "border-2 border-gray-300 rounded-lg bg-white shadow-none",
                            }}
                            variant="bordered"
                            value={link.href}
                            onChange={(e) => {
                              const updated = [...navLinks];
                              updated[idx] = {
                                ...updated[idx],
                                href: e.target.value,
                              };
                              setNavLinks(updated);
                            }}
                            placeholder="URL or page slug"
                            className="flex-1"
                          />
                          <label className="flex items-center gap-1 whitespace-nowrap text-xs text-gray-500">
                            <input
                              type="checkbox"
                              checked={link.isPage || false}
                              onChange={(e) => {
                                const updated = [...navLinks];
                                updated[idx] = {
                                  ...updated[idx],
                                  isPage: e.target.checked,
                                };
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
                      className="mt-2 text-sm font-bold text-blue-600 hover:underline"
                    >
                      + Add Nav Link
                    </button>
                  </div>

                  <div className="mb-6">
                    <label className="mb-2 flex items-center gap-3 text-base font-bold text-black">
                      <input
                        type="checkbox"
                        checked={showCommunityPage}
                        onChange={(e) => setShowCommunityPage(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      Show Community Page
                    </label>
                    <p className="ml-7 text-sm text-gray-500">
                      Enable a community page on your storefront that displays
                      your community feed. A &quot;Community&quot; link will be
                      added to your storefront navigation bar.
                    </p>
                  </div>

                  <div className="mb-6">
                    <label className="mb-2 flex items-center gap-3 text-base font-bold text-black">
                      <input
                        type="checkbox"
                        checked={showWalletPage}
                        onChange={(e) => setShowWalletPage(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      Show Bitcoin Wallet Page
                    </label>
                    <p className="ml-7 text-sm text-gray-500">
                      Enable a Bitcoin wallet page on your storefront for Cashu
                      ecash payments. A &quot;Wallet&quot; link will be added to
                      your storefront navigation bar.
                    </p>
                  </div>

                  <div className="mb-6">
                    <label className="mb-2 block text-base font-bold text-black">
                      Homepage Sections
                    </label>
                    <p className="mb-3 text-sm text-gray-500">
                      Build your storefront homepage by adding and arranging
                      content sections. If no sections are added, the landing
                      page style above is used instead.
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
                              newSections[idx],
                              newSections[idx - 1],
                            ];
                            setSections(newSections);
                          }}
                          onMoveDown={() => {
                            if (idx === sections.length - 1) return;
                            const newSections = [...sections];
                            [newSections[idx], newSections[idx + 1]] = [
                              newSections[idx + 1],
                              newSections[idx],
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
                          {
                            type: "hero" as StorefrontSectionType,
                            label: "Hero",
                          },
                          {
                            type: "about" as StorefrontSectionType,
                            label: "About",
                          },
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
                          {
                            type: "faq" as StorefrontSectionType,
                            label: "FAQ",
                          },
                          {
                            type: "ingredients" as StorefrontSectionType,
                            label: "Ingredients",
                          },
                          {
                            type: "comparison" as StorefrontSectionType,
                            label: "Comparison",
                          },
                          {
                            type: "text" as StorefrontSectionType,
                            label: "Text",
                          },
                          {
                            type: "image" as StorefrontSectionType,
                            label: "Image",
                          },
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
                          className="rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-600 hover:border-black hover:text-black"
                        >
                          + {st.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="mb-6">
                    <PageEditor pages={pages} onChange={setPages} />
                  </div>

                  <div className="mb-6">
                    <label className="mb-2 block text-base font-bold text-black">
                      Footer
                    </label>
                    <p className="mb-3 text-sm text-gray-500">
                      Customize the footer at the bottom of your storefront.
                    </p>
                    <FooterEditor footer={footer} onChange={setFooter} />
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
                      {domainInfo && (
                        <Button
                          className="border-3 border-red-500 bg-white font-bold text-red-500 hover:bg-red-50"
                          type="button"
                          onPress={handleRemoveCustomDomain}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                    {domainError && (
                      <p className="mt-1 text-sm text-red-600">{domainError}</p>
                    )}
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
                              domainInfo.verified
                                ? "bg-green-500"
                                : "bg-yellow-500"
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
                            Add a CNAME record:{" "}
                            <strong>{domainInfo.domain}</strong> →{" "}
                            <strong>milk.market</strong>
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-4">
                    <div className="flex items-center gap-3">
                      <Button
                        className="border-3 border-black bg-black font-bold text-white hover:bg-gray-800"
                        type="button"
                        onPress={() => setIsPreviewOpen(true)}
                      >
                        Preview Page
                      </Button>
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
                    </div>
                    <p className="mt-2 text-xs text-gray-400">
                      Preview shows your current unsaved settings with
                      placeholder products. Use it to tweak your design before
                      saving.
                    </p>
                  </div>

                  {shopSlug && (
                    <div className="mt-6 border-t-2 border-dashed border-gray-300 pt-4">
                      <Button
                        className="border-3 border-red-500 bg-white font-bold text-red-500 hover:bg-red-50"
                        type="button"
                        onPress={handleRemoveStorefront}
                      >
                        Remove Storefront
                      </Button>
                      <p className="mt-1 text-xs text-gray-400">
                        This will delete your shop URL, custom domain, and reset
                        all storefront customization.
                      </p>
                    </div>
                  )}
                </>
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

export default ShopProfileForm;
