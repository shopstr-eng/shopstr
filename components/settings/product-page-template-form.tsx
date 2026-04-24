import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button } from "@heroui/react";
import { CheckCircleIcon } from "@heroicons/react/24/outline";
import {
  SignerContext,
  NostrContext,
} from "@/components/utility-components/nostr-context-provider";
import { ProductContext, ShopMapContext } from "@/utils/context/context";
import { createNostrShopEvent } from "@/utils/nostr/nostr-helper-functions";
import { sanitizeStorefrontConfigLinks } from "@/utils/storefront-links";
import { parseTags } from "@/utils/parsers/product-parser-functions";
import { BLUEBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";
import type { ProductData } from "@/utils/parsers/product-parser-functions";
import {
  ShopProfile,
  StorefrontColorScheme,
  StorefrontConfig,
  StorefrontSection,
} from "@/utils/types/types";
import ProductPageEditor from "@/components/settings/storefront/product-page-editor";
import MilkMarketSpinner from "@/components/utility-components/mm-spinner";

const DEFAULT_COLORS: StorefrontColorScheme = {
  primary: "#FFD23F",
  secondary: "#1E293B",
  accent: "#3B82F6",
  background: "#FFFFFF",
  text: "#000000",
};

const ProductPageTemplateForm = () => {
  const { signer, pubkey: userPubkey } = useContext(SignerContext);
  const { nostr } = useContext(NostrContext);
  const shopContext = useContext(ShopMapContext);
  const productContext = useContext(ProductContext);

  const [isFetching, setIsFetching] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [productPageDefaults, setProductPageDefaults] = useState<
    StorefrontSection[]
  >([]);

  // Tracks the created_at of the shop event we last hydrated local state from.
  // Used to detect concurrent updates that arrived after we loaded.
  const loadedCreatedAtRef = useRef<number>(0);
  const hasLoadedFromContextRef = useRef(false);
  const hasLoadedFromDbRef = useRef(false);

  const sellerProducts: ProductData[] = useMemo(() => {
    if (!userPubkey || !productContext.productEvents?.length) return [];
    return productContext.productEvents
      .filter((event: any) => event.pubkey === userPubkey)
      .map((event: any) => parseTags(event))
      .filter(
        (p: ProductData | undefined): p is ProductData => p !== undefined
      );
  }, [userPubkey, productContext.productEvents]);

  // Fast path: hydrate from DB cache before relay context arrives.
  useEffect(() => {
    if (!userPubkey) return;
    if (hasLoadedFromContextRef.current) return;
    if (hasLoadedFromDbRef.current) return;
    hasLoadedFromDbRef.current = true;
    fetch(`/api/storefront/lookup?pubkey=${encodeURIComponent(userPubkey)}`)
      .then((r) => r.json())
      .then((data) => {
        if (hasLoadedFromContextRef.current) return;
        const sf = data?.shopConfig?.storefront;
        if (sf?.productPageDefaults) {
          setProductPageDefaults(sf.productPageDefaults);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!hasLoadedFromContextRef.current) setIsFetching(false);
      });
  }, [userPubkey]);

  // Authoritative path: hydrate from relay context the first time it arrives.
  useEffect(() => {
    if (!userPubkey) return;
    if (hasLoadedFromContextRef.current) return;
    const shop: ShopProfile | undefined = shopContext.shopData.get(userPubkey);
    if (!shop) {
      if (shopContext.shopData.size > 0) setIsFetching(false);
      return;
    }
    hasLoadedFromContextRef.current = true;
    loadedCreatedAtRef.current = shop.created_at || 0;
    const sf = shop.content?.storefront;
    if (sf?.productPageDefaults) {
      setProductPageDefaults(sf.productPageDefaults);
    }
    setIsFetching(false);
  }, [shopContext.shopData, userPubkey]);

  // Preview context derived from latest shop content so the editor renders
  // with the seller's actual colors/fonts.
  const previewContext = useMemo(() => {
    const shop = userPubkey ? shopContext.shopData.get(userPubkey) : undefined;
    const sf = shop?.content?.storefront;
    const colors: StorefrontColorScheme = {
      ...DEFAULT_COLORS,
      ...(sf?.colorScheme || {}),
    };
    return {
      colors,
      shopName: shop?.content?.name || "Stall",
      fontHeading: sf?.fontHeading,
      fontBody: sf?.fontBody,
      customFontHeadingUrl: sf?.customFontHeadingUrl,
      customFontHeadingName: sf?.customFontHeadingName,
      customFontBodyUrl: sf?.customFontBodyUrl,
      customFontBodyName: sf?.customFontBodyName,
    };
  }, [userPubkey, shopContext.shopData]);

  const handleSave = useCallback(async () => {
    if (!userPubkey || !signer || !nostr) return;
    setError(null);
    setIsSaving(true);
    try {
      // Race protection: re-read the latest shop event from the relay context
      // at save time. The context is continuously updated by the relay
      // subscription, so it reflects the most recent published version
      // including any concurrent edits made elsewhere (e.g. storefront tab).
      const latest = shopContext.shopData.get(userPubkey);
      const baseContent: any = latest?.content || {};
      const baseStorefront: Partial<StorefrontConfig> =
        (baseContent.storefront as StorefrontConfig | undefined) || {};

      // Only mutate the productPageDefaults field; preserve every other field
      // exactly as it currently exists on the relay so we never overwrite a
      // concurrent change made from another form.
      const mergedStorefront: StorefrontConfig = sanitizeStorefrontConfigLinks({
        ...(baseStorefront as StorefrontConfig),
        productPageDefaults:
          productPageDefaults.length > 0 ? productPageDefaults : undefined,
      });

      const transformedData = {
        ...baseContent,
        storefront: mergedStorefront,
        merchants: baseContent.merchants?.length
          ? baseContent.merchants
          : [userPubkey],
      };

      await createNostrShopEvent(
        nostr,
        signer,
        JSON.stringify(transformedData)
      );

      shopContext.updateShopData({
        pubkey: userPubkey,
        content: transformedData,
        created_at: 0,
      });

      // Reset our high-water mark so subsequent saves use the value we just
      // published as the base.
      loadedCreatedAtRef.current = Math.floor(Date.now() / 1000);

      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 3000);
    } catch (e: any) {
      setError(e?.message || "Failed to save product page template.");
    } finally {
      setIsSaving(false);
    }
  }, [userPubkey, signer, nostr, productPageDefaults, shopContext]);

  if (isFetching) {
    return <MilkMarketSpinner />;
  }

  return (
    <div className="w-full">
      <div className="mb-4">
        <h2 className="text-xl font-bold text-black">Product Page Template</h2>
        <p className="mt-1 text-sm text-gray-500">
          Default sections to show on every product&apos;s detail page.
          Individual products can override these from the Customize Page button
          on each listing.
        </p>
      </div>

      <ProductPageEditor
        sections={productPageDefaults}
        onChange={setProductPageDefaults}
        sellerProducts={sellerProducts}
        shopPubkey={userPubkey || undefined}
        showSizeReadout
        preview={previewContext}
      />

      {error && (
        <div className="mt-4 rounded-md border-2 border-red-400 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-6 flex items-center gap-4">
        <Button
          className={BLUEBUTTONCLASSNAMES}
          onClick={handleSave}
          isDisabled={isSaving}
          isLoading={isSaving}
        >
          {isSaving ? "Saving..." : "Save Template"}
        </Button>
        {isSaved && (
          <span className="flex items-center gap-1 text-sm font-bold text-green-700">
            <CheckCircleIcon className="h-5 w-5" />
            Saved
          </span>
        )}
      </div>
    </div>
  );
};

export default ProductPageTemplateForm;
