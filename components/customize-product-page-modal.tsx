import { useContext, useEffect, useMemo, useState } from "react";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Input,
} from "@heroui/react";
import {
  BLUEBUTTONCLASSNAMES,
  WHITEBUTTONCLASSNAMES,
} from "@/utils/STATIC-VARIABLES";
import {
  NostrEvent,
  StorefrontProductPageConfig,
  StorefrontSection,
  StorefrontColorScheme,
  StorefrontConfig,
} from "@/utils/types/types";
import parseTags, {
  ProductData,
} from "@/utils/parsers/product-parser-functions";
import ProductPageEditor from "./settings/storefront/product-page-editor";
import SectionRenderer from "./storefront/section-renderer";
import StorefrontPreviewFrame from "./storefront/storefront-preview-frame";
import PreviewDeviceToggle, {
  DEVICE_WIDTHS,
  PreviewDevice,
} from "./storefront/preview-device-toggle";
import { ProductContext, ShopMapContext } from "@/utils/context/context";
import {
  NostrContext,
  SignerContext,
} from "@/components/utility-components/nostr-context-provider";
import { republishProductWithPageConfig } from "@/utils/nostr/nostr-helper-functions";
import FailureModal from "./utility-components/failure-modal";
import SuccessModal from "./utility-components/success-modal";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  productData: ProductData;
  rawEvent: NostrEvent;
  sellerProducts?: ProductData[];
}

const COLOR_FIELDS: { key: keyof StorefrontColorScheme; label: string }[] = [
  { key: "primary", label: "Primary" },
  { key: "secondary", label: "Secondary" },
  { key: "accent", label: "Accent" },
  { key: "background", label: "Background" },
  { key: "text", label: "Text" },
];

const DEFAULT_COLORS: StorefrontColorScheme = {
  primary: "#FFD23F",
  secondary: "#1E293B",
  accent: "#3B82F6",
  background: "#FFFFFF",
  text: "#000000",
};

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const URL_RE = /^(https?:\/\/|data:image\/|\/)[^\s]+$/i;
const SIZE_WARN = 32 * 1024;
const SIZE_BLOCK = 64 * 1024;

export default function CustomizeProductPageModal({
  isOpen,
  onClose,
  productData,
  rawEvent,
  sellerProducts = [],
}: Props) {
  const { signer } = useContext(SignerContext);
  const { nostr } = useContext(NostrContext);
  const productContext = useContext(ProductContext);
  const shopMapContext = useContext(ShopMapContext);

  const shopStorefront: StorefrontConfig | undefined =
    shopMapContext.shopData.get(productData.pubkey)?.content?.storefront;
  const shopDefaults: StorefrontSection[] =
    shopStorefront?.productPageDefaults || [];

  const [sections, setSections] = useState<StorefrontSection[]>([]);
  const [themeOverrides, setThemeOverrides] = useState<
    Partial<StorefrontColorScheme>
  >({});
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const [ogImage, setOgImage] = useState("");
  const [usingShopDefaults, setUsingShopDefaults] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [view, setView] = useState<"edit" | "preview">("edit");
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>("desktop");
  const [pristineKey, setPristineKey] = useState("");
  const [bulkSelectedIds, setBulkSelectedIds] = useState<Set<string>>(
    new Set()
  );
  const [bulkSearch, setBulkSearch] = useState("");
  const [bulkProgress, setBulkProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);

  const latestRawEvent: NostrEvent = useMemo(() => {
    const events = productContext?.productEvents || [];
    const candidates = events
      .filter(
        (e: NostrEvent) =>
          e.pubkey === rawEvent.pubkey &&
          e.tags.some((t) => t[0] === "d" && t[1] === productData.d)
      )
      .sort((a: NostrEvent, b: NostrEvent) => b.created_at - a.created_at);
    return candidates[0] || rawEvent;
  }, [productContext?.productEvents, rawEvent, productData.d]);

  const isStale = latestRawEvent.id !== rawEvent.id;

  useEffect(() => {
    if (!isOpen) return;
    const cfg = productData.pageConfig;
    if (cfg && cfg.sections && cfg.sections.length > 0) {
      setSections(cfg.sections);
      setUsingShopDefaults(false);
    } else {
      setSections([]);
      setUsingShopDefaults(true);
    }
    setThemeOverrides(cfg?.themeOverrides || {});
    setMetaTitle(cfg?.metaTitle || "");
    setMetaDescription(cfg?.metaDescription || "");
    setOgImage(cfg?.ogImage || "");
    setView("edit");
    setBulkOpen(false);
    setBulkSelectedIds(new Set());
    setBulkSearch("");
    setBulkProgress(null);
    setPristineKey(JSON.stringify(cfg || null));
  }, [isOpen, productData]);

  const buildConfig = (): StorefrontProductPageConfig | null => {
    const cfg: StorefrontProductPageConfig = {};
    if (!usingShopDefaults) cfg.sections = sections;
    if (Object.keys(themeOverrides).length > 0) {
      cfg.themeOverrides = themeOverrides;
    }
    if (metaTitle.trim()) cfg.metaTitle = metaTitle.trim();
    if (metaDescription.trim()) cfg.metaDescription = metaDescription.trim();
    if (ogImage.trim()) cfg.ogImage = ogImage.trim();
    if (
      !cfg.sections &&
      !cfg.themeOverrides &&
      !cfg.metaTitle &&
      !cfg.metaDescription &&
      !cfg.ogImage
    )
      return null;
    return cfg;
  };

  const draftCfg = buildConfig();
  const serializedSize = useMemo(() => {
    if (!draftCfg) return 0;
    try {
      return new TextEncoder().encode(JSON.stringify(draftCfg)).length;
    } catch {
      return JSON.stringify(draftCfg).length;
    }
  }, [draftCfg]);

  const validate = (): string | null => {
    for (const [key, val] of Object.entries(themeOverrides)) {
      if (val && !HEX_RE.test(val)) {
        return `Color "${key}" must be a valid hex value (e.g. #1A2B3C).`;
      }
    }
    if (ogImage.trim() && !URL_RE.test(ogImage.trim())) {
      return "OG image must be a valid URL.";
    }
    if (metaTitle.length > 200) {
      return "Meta title is too long (200 char max).";
    }
    if (metaDescription.length > 500) {
      return "Meta description is too long (500 char max).";
    }
    if (!usingShopDefaults) {
      for (const [i, s] of sections.entries()) {
        if (s.type === "product_gallery" && s.galleryImages) {
          for (const url of s.galleryImages) {
            if (url && !URL_RE.test(url)) {
              return `Section ${i + 1} (Gallery) has an invalid image URL: "${url.slice(0, 60)}".`;
            }
          }
        }
        if (s.type === "image" && s.image && !URL_RE.test(s.image)) {
          return `Section ${i + 1} (Image) has an invalid image URL.`;
        }
        if (s.type === "product_specifications" && s.specifications) {
          for (const spec of s.specifications) {
            if (!spec.label.trim() || !spec.value.trim()) {
              return `Section ${i + 1} (Specifications) has an empty label or value.`;
            }
          }
        }
      }
    }
    if (serializedSize > SIZE_BLOCK) {
      return `Customization is too large (${(serializedSize / 1024).toFixed(
        1
      )} KB). Maximum is ${SIZE_BLOCK / 1024} KB. Reduce gallery images, spec entries, or text length.`;
    }
    return null;
  };

  const isDirty = useMemo(() => {
    return JSON.stringify(buildConfig()) !== pristineKey;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    sections,
    themeOverrides,
    metaTitle,
    metaDescription,
    ogImage,
    usingShopDefaults,
    pristineKey,
  ]);

  const handleClose = () => {
    if (saving || bulkProgress) return;
    if (
      isDirty &&
      !window.confirm("You have unsaved changes. Close without saving?")
    ) {
      return;
    }
    onClose();
  };

  const handleSave = async () => {
    if (!signer || !nostr) {
      setErrorMsg("You need to be logged in to save.");
      return;
    }
    const validationErr = validate();
    if (validationErr) {
      setErrorMsg(validationErr);
      return;
    }
    if (
      isStale &&
      !window.confirm(
        "This product has been updated elsewhere since you opened the editor. Saving will overwrite those changes. Continue?"
      )
    ) {
      return;
    }
    setSaving(true);
    try {
      const cfg = buildConfig();
      const baseEvent = latestRawEvent;
      const signedEvent = await republishProductWithPageConfig(
        baseEvent,
        cfg,
        signer,
        nostr
      );
      if (signedEvent) {
        productContext.addNewlyCreatedProductEvent(signedEvent);
      }
      setShowSuccess(true);
      setPristineKey(JSON.stringify(cfg || null));
      onClose();
    } catch (err) {
      console.error(err);
      setErrorMsg(
        err instanceof Error ? err.message : "Failed to save customization."
      );
    } finally {
      setSaving(false);
    }
  };

  const otherSellerProducts = useMemo(() => {
    return (sellerProducts || []).filter((p) => p.id !== productData.id);
  }, [sellerProducts, productData.id]);

  const findRawEventForProduct = (p: ProductData): NostrEvent | undefined => {
    const events: NostrEvent[] = productContext?.productEvents || [];
    const candidates = events
      .filter(
        (e) =>
          e.pubkey === p.pubkey &&
          e.tags.some((t) => t[0] === "d" && t[1] === p.d)
      )
      .sort((a, b) => b.created_at - a.created_at);
    return candidates[0];
  };

  const handleBulkApply = async () => {
    if (!signer || !nostr) {
      setErrorMsg("You need to be logged in to save.");
      return;
    }
    const validationErr = validate();
    if (validationErr) {
      setErrorMsg(validationErr);
      return;
    }
    const targets = otherSellerProducts.filter((p) =>
      bulkSelectedIds.has(p.id)
    );
    if (targets.length === 0) return;
    if (
      !window.confirm(
        `Apply this template to ${targets.length} other product${
          targets.length === 1 ? "" : "s"
        }? Each will be republished and any per-product customization on them will be overwritten.`
      )
    )
      return;
    setBulkProgress({ done: 0, total: targets.length + 1 });
    const cfg = buildConfig();
    try {
      const ownSigned = await republishProductWithPageConfig(
        latestRawEvent,
        cfg,
        signer,
        nostr
      );
      if (ownSigned) productContext.addNewlyCreatedProductEvent(ownSigned);
      setBulkProgress({ done: 1, total: targets.length + 1 });
      let i = 1;
      for (const target of targets) {
        const raw = findRawEventForProduct(target);
        if (!raw) {
          i += 1;
          setBulkProgress({ done: i, total: targets.length + 1 });
          continue;
        }
        try {
          const signed = await republishProductWithPageConfig(
            raw,
            cfg,
            signer,
            nostr
          );
          if (signed) productContext.addNewlyCreatedProductEvent(signed);
        } catch (innerErr) {
          console.error(`Bulk apply failed for ${target.title}`, innerErr);
        }
        i += 1;
        setBulkProgress({ done: i, total: targets.length + 1 });
      }
      setPristineKey(JSON.stringify(cfg || null));
      setShowSuccess(true);
      onClose();
    } catch (err) {
      console.error(err);
      setErrorMsg(err instanceof Error ? err.message : "Bulk apply failed.");
    } finally {
      setBulkProgress(null);
    }
  };

  const handleRevertToShopDefaults = async () => {
    if (
      !window.confirm(
        "Remove all per-product customization and inherit shop defaults? This will republish the product."
      )
    )
      return;
    setUsingShopDefaults(true);
    setSections([]);
    setThemeOverrides({});
    if (!signer || !nostr) {
      setErrorMsg("You need to be logged in to save.");
      return;
    }
    setSaving(true);
    try {
      const signedEvent = await republishProductWithPageConfig(
        latestRawEvent,
        null,
        signer,
        nostr
      );
      if (signedEvent) {
        productContext.addNewlyCreatedProductEvent(signedEvent);
      }
      setShowSuccess(true);
      setPristineKey(JSON.stringify(null));
      onClose();
    } catch (err) {
      console.error(err);
      setErrorMsg(err instanceof Error ? err.message : "Failed to revert.");
    } finally {
      setSaving(false);
    }
  };

  const handleStartFromDefaults = () => {
    setUsingShopDefaults(false);
    setSections(
      shopDefaults.map((s) => ({
        ...s,
        id: `${s.id}-${Date.now()}`,
      }))
    );
  };

  const handleStartFromScratch = () => {
    setUsingShopDefaults(false);
    setSections([]);
  };

  const previewColors: StorefrontColorScheme = useMemo(() => {
    const base = { ...DEFAULT_COLORS, ...(shopStorefront?.colorScheme || {}) };
    return { ...base, ...themeOverrides };
  }, [shopStorefront, themeOverrides]);

  const previewSections: StorefrontSection[] = usingShopDefaults
    ? shopDefaults
    : sections;

  const previewProductsList: ProductData[] =
    sellerProducts.length > 0
      ? sellerProducts
      : (productContext?.productEvents || [])
          .filter(
            (e: NostrEvent) => e.kind !== 1 && e.pubkey === productData.pubkey
          )
          .map((e: NostrEvent) => parseTags(e))
          .filter((p): p is ProductData => !!p);

  const shopName =
    shopMapContext.shopData.get(productData.pubkey)?.content?.name || "Stall";
  const shopPicture =
    shopMapContext.shopData.get(productData.pubkey)?.content?.ui?.picture || "";

  const sizeKb = (serializedSize / 1024).toFixed(1);
  const sizeWarn = serializedSize > SIZE_WARN && serializedSize <= SIZE_BLOCK;
  const sizeBlock = serializedSize > SIZE_BLOCK;

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        size="4xl"
        scrollBehavior="inside"
        classNames={{
          body: "py-6 bg-white",
          backdrop: "bg-black/50 backdrop-opacity-60",
          header: "border-b-4 border-black bg-white rounded-t-lg",
          footer: "border-t-4 border-black bg-white rounded-b-lg",
          base: "border-4 border-black shadow-neo rounded-lg",
        }}
      >
        <ModalContent>
          <ModalHeader className="flex flex-col text-black">
            <div className="flex w-full items-center justify-between">
              <span className="text-xl font-bold">Customize Product Page</span>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setView("edit")}
                  className={`rounded border px-3 py-1 text-xs font-medium ${
                    view === "edit"
                      ? "border-black bg-black text-white"
                      : "border-gray-300 text-gray-700"
                  }`}
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setView("preview")}
                  className={`rounded border px-3 py-1 text-xs font-medium ${
                    view === "preview"
                      ? "border-black bg-black text-white"
                      : "border-gray-300 text-gray-700"
                  }`}
                >
                  Preview
                </button>
              </div>
            </div>
            <span className="text-sm font-normal text-gray-500">
              {productData.title}
            </span>
            {isStale && (
              <span className="mt-1 rounded bg-yellow-100 px-2 py-1 text-xs text-yellow-900">
                Heads up: this product has a newer version on Nostr. Saving will
                rebase onto the latest version.
              </span>
            )}
          </ModalHeader>
          <ModalBody className="text-black">
            {view === "edit" ? (
              <div className="space-y-6">
                <div className="rounded-lg border-2 border-gray-200 bg-gray-50 p-3">
                  <p className="text-sm font-semibold text-black">
                    Sections (overrides shop default)
                  </p>
                  {usingShopDefaults ? (
                    <div className="mt-2 space-y-2">
                      <p className="text-xs text-gray-600">
                        This product currently uses your shop&apos;s default
                        product page template ({shopDefaults.length} section
                        {shopDefaults.length === 1 ? "" : "s"}).
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={handleStartFromDefaults}
                          className="rounded border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:border-black hover:text-black"
                        >
                          Start from defaults
                        </button>
                        <button
                          type="button"
                          onClick={handleStartFromScratch}
                          className="rounded border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:border-black hover:text-black"
                        >
                          Start from scratch
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 space-y-3">
                      <ProductPageEditor
                        sections={sections}
                        onChange={setSections}
                        sellerProducts={sellerProducts}
                        shopPubkey={productData.pubkey}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setUsingShopDefaults(true);
                          setSections([]);
                        }}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Use shop defaults instead (don&apos;t save yet)
                      </button>
                    </div>
                  )}
                </div>

                <div className="rounded-lg border-2 border-gray-200 bg-gray-50 p-3">
                  <p className="text-sm font-semibold text-black">
                    Theme overrides (optional)
                  </p>
                  <p className="mt-1 text-xs text-gray-600">
                    Leave any field blank to inherit from your shop theme. Use
                    hex like #1A2B3C.
                  </p>
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
                    {COLOR_FIELDS.map((cf) => {
                      const val = themeOverrides[cf.key];
                      const invalid = !!val && !HEX_RE.test(val);
                      return (
                        <div key={cf.key} className="flex flex-col gap-1">
                          <label className="text-xs font-bold text-gray-700">
                            {cf.label}
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={val || "#000000"}
                              onChange={(e) =>
                                setThemeOverrides((prev) => ({
                                  ...prev,
                                  [cf.key]: e.target.value,
                                }))
                              }
                              className="h-8 w-10 cursor-pointer rounded border border-gray-300"
                            />
                            <input
                              type="text"
                              value={val || ""}
                              placeholder="(inherit)"
                              onChange={(e) => {
                                const nextVal = e.target.value;
                                setThemeOverrides((prev) => {
                                  const next = { ...prev };
                                  if (nextVal.trim() === "") {
                                    delete next[cf.key];
                                  } else {
                                    next[cf.key] = nextVal;
                                  }
                                  return next;
                                });
                              }}
                              className={`flex-1 rounded border px-2 py-1 text-sm ${
                                invalid
                                  ? "border-red-500 bg-red-50"
                                  : "border-gray-300"
                              }`}
                            />
                            {val !== undefined && (
                              <button
                                type="button"
                                onClick={() =>
                                  setThemeOverrides((prev) => {
                                    const next = { ...prev };
                                    delete next[cf.key];
                                    return next;
                                  })
                                }
                                className="text-xs text-red-500"
                                title="Clear override"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                          {invalid && (
                            <span className="text-xs text-red-600">
                              Invalid hex
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-lg border-2 border-gray-200 bg-gray-50 p-3">
                  <p className="text-sm font-semibold text-black">
                    SEO & social sharing (optional)
                  </p>
                  <p className="mt-1 text-xs text-gray-600">
                    Control how this listing appears in search results and when
                    shared on social media. Leave blank to use the product
                    title, summary, and first image.
                  </p>
                  <div className="mt-3 space-y-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-bold text-gray-700">
                        Meta title{" "}
                        <span className="font-normal text-gray-400">
                          ({metaTitle.length}/200)
                        </span>
                      </label>
                      <input
                        type="text"
                        value={metaTitle}
                        maxLength={250}
                        placeholder={productData.title}
                        onChange={(e) => setMetaTitle(e.target.value)}
                        className="rounded border border-gray-300 px-2 py-1 text-sm"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-bold text-gray-700">
                        Meta description{" "}
                        <span className="font-normal text-gray-400">
                          ({metaDescription.length}/500)
                        </span>
                      </label>
                      <textarea
                        value={metaDescription}
                        maxLength={600}
                        rows={2}
                        placeholder={
                          productData.summary ||
                          "Short summary for search results and previews"
                        }
                        onChange={(e) => setMetaDescription(e.target.value)}
                        className="rounded border border-gray-300 px-2 py-1 text-sm"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-bold text-gray-700">
                        Social share image URL
                      </label>
                      <input
                        type="text"
                        value={ogImage}
                        placeholder={
                          productData.images?.[0] ||
                          "https://example.com/image.jpg"
                        }
                        onChange={(e) => setOgImage(e.target.value)}
                        className={`rounded border px-2 py-1 text-sm ${
                          ogImage && !URL_RE.test(ogImage.trim())
                            ? "border-red-500 bg-red-50"
                            : "border-gray-300"
                        }`}
                      />
                      {ogImage && !URL_RE.test(ogImage.trim()) && (
                        <span className="text-xs text-red-600">
                          Invalid URL
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {otherSellerProducts.length > 0 && (
                  <div className="rounded-lg border-2 border-gray-200 bg-gray-50 p-3">
                    <button
                      type="button"
                      onClick={() => setBulkOpen((v) => !v)}
                      className="flex w-full items-center justify-between text-left text-sm font-bold text-gray-700"
                    >
                      <span>
                        Apply this template to other products
                        {bulkSelectedIds.size > 0 &&
                          ` (${bulkSelectedIds.size} selected)`}
                      </span>
                      <span className="text-xs text-gray-500">
                        {bulkOpen ? "Hide" : "Show"}
                      </span>
                    </button>
                    {bulkOpen && (
                      <div className="mt-3 space-y-2">
                        <p className="text-xs text-gray-600">
                          Selected products will be republished with the same
                          sections, theme overrides, and SEO settings shown
                          above. Each product&apos;s existing per-product
                          customization will be overwritten.
                        </p>
                        <Input
                          size="sm"
                          variant="bordered"
                          placeholder="Search your products…"
                          value={bulkSearch}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            setBulkSearch(e.target.value)
                          }
                        />
                        <div className="flex items-center justify-between text-xs">
                          <button
                            type="button"
                            className="text-blue-600 hover:underline"
                            onClick={() => {
                              const filtered = otherSellerProducts.filter(
                                (p) =>
                                  !bulkSearch ||
                                  p.title
                                    ?.toLowerCase()
                                    .includes(bulkSearch.toLowerCase())
                              );
                              const next = new Set(bulkSelectedIds);
                              const allSelected = filtered.every((p) =>
                                next.has(p.id)
                              );
                              filtered.forEach((p) => {
                                if (allSelected) next.delete(p.id);
                                else next.add(p.id);
                              });
                              setBulkSelectedIds(next);
                            }}
                          >
                            Toggle all visible
                          </button>
                          <span className="text-gray-500">
                            {otherSellerProducts.length} other product
                            {otherSellerProducts.length === 1 ? "" : "s"}
                          </span>
                        </div>
                        <div className="max-h-48 overflow-y-auto rounded border border-gray-200 bg-white">
                          {otherSellerProducts
                            .filter(
                              (p) =>
                                !bulkSearch ||
                                p.title
                                  ?.toLowerCase()
                                  .includes(bulkSearch.toLowerCase())
                            )
                            .map((p) => {
                              const checked = bulkSelectedIds.has(p.id);
                              return (
                                <label
                                  key={p.id}
                                  className="flex cursor-pointer items-center gap-2 border-b border-gray-100 px-2 py-1.5 text-xs last:border-b-0 hover:bg-gray-50"
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => {
                                      const next = new Set(bulkSelectedIds);
                                      if (checked) next.delete(p.id);
                                      else next.add(p.id);
                                      setBulkSelectedIds(next);
                                    }}
                                  />
                                  <span className="truncate">
                                    {p.title || "(untitled)"}
                                  </span>
                                </label>
                              );
                            })}
                        </div>
                        <Button
                          size="sm"
                          className={BLUEBUTTONCLASSNAMES}
                          isDisabled={
                            bulkSelectedIds.size === 0 ||
                            saving ||
                            !!bulkProgress ||
                            sizeBlock
                          }
                          onPress={handleBulkApply}
                        >
                          {bulkProgress
                            ? `Applying ${bulkProgress.done}/${bulkProgress.total}…`
                            : `Save & apply to ${bulkSelectedIds.size} other${
                                bulkSelectedIds.size === 1 ? "" : "s"
                              }`}
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                <div
                  className={`rounded-lg border-2 p-3 text-xs ${
                    sizeBlock
                      ? "border-red-400 bg-red-50 text-red-800"
                      : sizeWarn
                        ? "border-yellow-400 bg-yellow-50 text-yellow-900"
                        : "border-gray-200 bg-gray-50 text-gray-600"
                  }`}
                >
                  Customization size: {sizeKb} KB
                  {sizeWarn &&
                    " — large customizations may be rejected by some Nostr relays."}
                  {sizeBlock &&
                    " — exceeds 64 KB limit. Reduce content before saving."}
                </div>
              </div>
            ) : (
              <div className="rounded-lg border-2 border-gray-200 bg-white p-2">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-xs text-gray-500">
                    Live preview using your draft sections and theme. The buy
                    box appears above this section on the actual product page.
                  </p>
                  <PreviewDeviceToggle
                    value={previewDevice}
                    onChange={setPreviewDevice}
                  />
                </div>
                {previewSections.length === 0 ? (
                  <div className="rounded bg-gray-50 p-6 text-center text-sm text-gray-500">
                    No sections to preview. Add sections in the Edit tab.
                  </div>
                ) : (
                  <div className="overflow-hidden rounded border border-gray-200">
                    <StorefrontPreviewFrame
                      colors={previewColors}
                      fontHeading={shopStorefront?.fontHeading}
                      fontBody={shopStorefront?.fontBody}
                      customFontHeadingUrl={
                        shopStorefront?.customFontHeadingUrl
                      }
                      customFontHeadingName={
                        shopStorefront?.customFontHeadingName
                      }
                      customFontBodyUrl={shopStorefront?.customFontBodyUrl}
                      customFontBodyName={shopStorefront?.customFontBodyName}
                      maxWidth={DEVICE_WIDTHS[previewDevice]}
                    >
                      {previewSections.map((s) => (
                        <SectionRenderer
                          key={s.id}
                          section={s}
                          colors={previewColors}
                          shopName={shopName}
                          shopPicture={shopPicture}
                          shopPubkey={productData.pubkey}
                          products={previewProductsList}
                          currentProduct={productData}
                        />
                      ))}
                    </StorefrontPreviewFrame>
                  </div>
                )}
              </div>
            )}
          </ModalBody>
          <ModalFooter className="flex-wrap gap-2">
            {!usingShopDefaults &&
              productData.pageConfig &&
              ((productData.pageConfig.sections &&
                productData.pageConfig.sections.length > 0) ||
                (productData.pageConfig.themeOverrides &&
                  Object.keys(productData.pageConfig.themeOverrides).length >
                    0)) && (
                <Button
                  className="mr-auto rounded border border-red-300 bg-white px-3 text-red-600 hover:bg-red-50"
                  onPress={handleRevertToShopDefaults}
                  isDisabled={saving}
                >
                  Revert to shop defaults
                </Button>
              )}
            <Button
              className={WHITEBUTTONCLASSNAMES}
              onPress={handleClose}
              isDisabled={saving || !!bulkProgress}
            >
              Cancel
            </Button>
            <Button
              className={BLUEBUTTONCLASSNAMES}
              onPress={handleSave}
              isLoading={saving}
              isDisabled={saving || sizeBlock}
            >
              Save & Republish
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
      <SuccessModal
        bodyText="Product page customization saved!"
        isOpen={showSuccess}
        onClose={() => setShowSuccess(false)}
      />
      <FailureModal
        bodyText={errorMsg || ""}
        isOpen={!!errorMsg}
        onClose={() => setErrorMsg(null)}
      />
    </>
  );
}
