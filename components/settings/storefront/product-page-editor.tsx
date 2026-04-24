import { useMemo, useState } from "react";
import {
  StorefrontSection,
  StorefrontSectionType,
  StorefrontColorScheme,
} from "@/utils/types/types";
import SectionEditor from "./section-editor";
import SectionRenderer from "@/components/storefront/section-renderer";
import StorefrontPreviewFrame from "@/components/storefront/storefront-preview-frame";
import PreviewDeviceToggle, {
  DEVICE_WIDTHS,
  PreviewDevice,
} from "@/components/storefront/preview-device-toggle";
import { useDragReorder } from "@/utils/hooks/useDragReorder";
import type { ProductData } from "@/utils/parsers/product-parser-functions";

interface PreviewContext {
  colors: StorefrontColorScheme;
  sampleProduct?: ProductData;
  shopName?: string;
  shopPicture?: string;
  fontHeading?: string;
  fontBody?: string;
  customFontHeadingUrl?: string;
  customFontHeadingName?: string;
  customFontBodyUrl?: string;
  customFontBodyName?: string;
}

interface ProductPageEditorProps {
  sections: StorefrontSection[];
  onChange: (sections: StorefrontSection[]) => void;
  sellerProducts?: ProductData[];
  shopPubkey?: string;
  preview?: PreviewContext;
  showSizeReadout?: boolean;
}

const PRODUCT_SECTION_TYPES: {
  type: StorefrontSectionType;
  label: string;
}[] = [
  { type: "product_description", label: "Description" },
  { type: "product_specifications", label: "Specifications" },
  { type: "product_shipping_returns", label: "Shipping & Returns" },
  { type: "product_gallery", label: "Gallery" },
  { type: "reviews", label: "Customer Reviews" },
  { type: "related_products", label: "Related Products" },
  { type: "faq", label: "FAQ" },
  { type: "testimonials", label: "Testimonials" },
  { type: "ingredients", label: "Ingredients" },
  { type: "story", label: "Story" },
  { type: "text", label: "Text Block" },
  { type: "image", label: "Image" },
];

const SIZE_WARN = 32 * 1024;
const SIZE_BLOCK = 64 * 1024;

const PLACEHOLDER_PRODUCT: ProductData = {
  id: "preview-placeholder",
  pubkey: "",
  createdAt: 0,
  title: "Sample Product",
  summary: "This is a sample product used to preview your template.",
  images: [],
  currency: "USD",
  totalCost: 0,
  shippingType: "Free",
  shippingCost: 0,
  categories: ["sample"],
  location: "Anywhere",
  status: "active",
  quantity: 0,
  d: "preview-d",
  sizes: [],
  weights: [],
  volumes: [],
} as unknown as ProductData;

export default function ProductPageEditor({
  sections,
  onChange,
  sellerProducts = [],
  shopPubkey,
  preview,
  showSizeReadout,
}: ProductPageEditorProps) {
  const [view, setView] = useState<"edit" | "preview">("edit");
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>("desktop");

  const addSection = (type: StorefrontSectionType) => {
    onChange([
      ...sections,
      { id: `section-${Date.now()}`, type, enabled: true },
    ]);
  };

  const serializedSize = useMemo(() => {
    try {
      return new TextEncoder().encode(JSON.stringify(sections)).length;
    } catch {
      return JSON.stringify(sections).length;
    }
  }, [sections]);
  const sizeKb = (serializedSize / 1024).toFixed(1);
  const sizeWarn = serializedSize > SIZE_WARN && serializedSize <= SIZE_BLOCK;
  const sizeBlock = serializedSize > SIZE_BLOCK;

  const sampleProduct =
    preview?.sampleProduct || sellerProducts[0] || PLACEHOLDER_PRODUCT;

  const dnd = useDragReorder(sections, onChange);

  return (
    <div className="space-y-4">
      {preview && (
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
      )}

      {view === "edit" ? (
        <>
          <div className="rounded-lg border-2 border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
            <strong className="text-black">Buy Box</strong> (price, image, add
            to cart) is always pinned at the top. The sections below appear
            underneath it.
          </div>

          <div className="space-y-2">
            {sections.map((section, idx) => {
              const drag = dnd.getItemProps(idx);
              return (
                <div
                  key={section.id}
                  {...drag.rootProps}
                  className={`transition-all ${
                    drag.isDragging ? "opacity-40" : ""
                  } ${
                    drag.isDragOver
                      ? "rounded-lg ring-2 ring-blue-400 ring-offset-1"
                      : ""
                  }`}
                >
                  <SectionEditor
                    section={section}
                    onChange={(updated) => {
                      const next = [...sections];
                      next[idx] = updated;
                      onChange(next);
                    }}
                    onRemove={() =>
                      onChange(sections.filter((_, i) => i !== idx))
                    }
                    onMoveUp={() => {
                      if (idx === 0) return;
                      const next = [...sections];
                      [next[idx - 1], next[idx]] = [next[idx]!, next[idx - 1]!];
                      onChange(next);
                    }}
                    onMoveDown={() => {
                      if (idx === sections.length - 1) return;
                      const next = [...sections];
                      [next[idx], next[idx + 1]] = [next[idx + 1]!, next[idx]!];
                      onChange(next);
                    }}
                    isFirst={idx === 0}
                    isLast={idx === sections.length - 1}
                    sellerProducts={sellerProducts}
                    shopPubkey={shopPubkey}
                    dragHandleProps={drag.handleProps}
                  />
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-2">
            {PRODUCT_SECTION_TYPES.map((st) => (
              <button
                key={st.type}
                type="button"
                onClick={() => addSection(st.type)}
                className="rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-600 hover:border-black hover:text-black"
              >
                + {st.label}
              </button>
            ))}
          </div>

          {showSizeReadout && (
            <div
              className={`rounded-lg border-2 p-3 text-xs ${
                sizeBlock
                  ? "border-red-400 bg-red-50 text-red-800"
                  : sizeWarn
                    ? "border-yellow-400 bg-yellow-50 text-yellow-900"
                    : "border-gray-200 bg-gray-50 text-gray-600"
              }`}
            >
              Template size: {sizeKb} KB
              {sizeWarn &&
                " — large templates may be rejected by some Nostr relays."}
              {sizeBlock && " — exceeds 64 KB limit. Reduce content."}
            </div>
          )}
        </>
      ) : (
        <div className="rounded-lg border-2 border-gray-200 bg-white p-2">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-xs text-gray-500">
              Live preview using your draft sections. The buy box appears above
              this section on the actual product page.
            </p>
            <PreviewDeviceToggle
              value={previewDevice}
              onChange={setPreviewDevice}
            />
          </div>
          {sections.length === 0 ? (
            <div className="rounded bg-gray-50 p-6 text-center text-sm text-gray-500">
              No sections to preview. Add sections in the Edit tab.
            </div>
          ) : (
            <div className="overflow-hidden rounded border border-gray-200">
              <StorefrontPreviewFrame
                colors={preview!.colors}
                fontHeading={preview?.fontHeading}
                fontBody={preview?.fontBody}
                customFontHeadingUrl={preview?.customFontHeadingUrl}
                customFontHeadingName={preview?.customFontHeadingName}
                customFontBodyUrl={preview?.customFontBodyUrl}
                customFontBodyName={preview?.customFontBodyName}
                maxWidth={DEVICE_WIDTHS[previewDevice]}
              >
                {sections.map((s) => (
                  <SectionRenderer
                    key={s.id}
                    section={s}
                    colors={preview!.colors}
                    shopName={preview?.shopName || "Stall"}
                    shopPicture={preview?.shopPicture || ""}
                    shopPubkey={shopPubkey || ""}
                    products={sellerProducts}
                    currentProduct={sampleProduct}
                  />
                ))}
              </StorefrontPreviewFrame>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
