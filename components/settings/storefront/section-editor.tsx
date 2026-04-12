import { useState, useRef, useEffect, useContext } from "react";
import { Input, Textarea, Select, SelectItem } from "@heroui/react";
import {
  StorefrontSection,
  StorefrontSectionType,
  StorefrontFaqItem,
  StorefrontTestimonial,
  StorefrontIngredientItem,
  StorefrontComparisonColumn,
  StorefrontTimelineItem,
} from "@/utils/types/types";
import { FileUploaderButton } from "@/components/utility-components/file-uploader";
import { ProductData } from "@/utils/parsers/product-parser-functions";
import { ReviewsContext } from "@/utils/context/context";

interface SectionEditorProps {
  section: StorefrontSection;
  onChange: (updated: StorefrontSection) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
  sellerProducts?: ProductData[];
  shopPubkey?: string;
  isNew?: boolean;
  onFlashDone?: () => void;
}

const SECTION_LABELS: Record<StorefrontSectionType, string> = {
  hero: "Hero",
  about: "About",
  story: "Our Story",
  products: "Products",
  testimonials: "Testimonials",
  faq: "FAQ",
  ingredients: "Ingredients / Sourcing",
  comparison: "Comparison",
  text: "Text Block",
  image: "Image",
  contact: "Contact",
  reviews: "Customer Reviews",
};

const inputWrapperClass =
  "border-3 border-black rounded-lg bg-white shadow-none hover:bg-white data-[hover=true]:bg-white";

const selectClassNames = {
  trigger:
    "border-3 border-black rounded-lg bg-white shadow-none hover:bg-white data-[hover=true]:bg-white",
  value: "text-base !text-black",
  popoverContent: "border-2 border-black rounded-lg bg-white",
  listbox: "!text-black",
  label: "text-black",
};

export default function SectionEditor({
  section,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
  sellerProducts = [],
  shopPubkey,
  isNew,
  onFlashDone,
}: SectionEditorProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isFlashing, setIsFlashing] = useState(false);
  const dragItemRef = useRef<number | null>(null);
  const dragOverItemRef = useRef<number | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isNew) {
      setIsFlashing(true);
      cardRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      const timer = setTimeout(() => {
        setIsFlashing(false);
        onFlashDone?.();
      }, 1500);
      return () => clearTimeout(timer);
    } else {
      setIsFlashing(false);
      return undefined;
    }
  }, [isNew]);

  const update = (fields: Partial<StorefrontSection>) => {
    onChange({ ...section, ...fields });
  };

  return (
    <div
      ref={cardRef}
      className={`rounded-lg border-2 bg-white duration-500 transition-all ${
        isFlashing
          ? "border-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.4)]"
          : "border-gray-200"
      }`}
    >
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={onMoveUp}
              disabled={isFirst}
              className="text-xs text-gray-400 hover:text-black disabled:opacity-30"
            >
              ▲
            </button>
            <button
              type="button"
              onClick={onMoveDown}
              disabled={isLast}
              className="text-xs text-gray-400 hover:text-black disabled:opacity-30"
            >
              ▼
            </button>
          </div>
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-2 text-sm font-bold text-black"
          >
            <span className="text-xs">{isExpanded ? "▾" : "▸"}</span>
            {SECTION_LABELS[section.type] || section.type}
            {section.heading && (
              <span className="font-normal text-gray-400">
                — {section.heading}
              </span>
            )}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-xs text-gray-500">
            <input
              type="checkbox"
              checked={section.enabled !== false}
              onChange={(e) => update({ enabled: e.target.checked })}
            />
            Visible
          </label>
          <button
            type="button"
            onClick={onRemove}
            className="text-xs text-red-500 hover:text-red-700"
          >
            Remove
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="space-y-4 border-t border-gray-100 px-4 py-4">
          <Input
            label="Heading"
            classNames={{ inputWrapper: inputWrapperClass }}
            variant="bordered"
            value={section.heading || ""}
            onChange={(e) => update({ heading: e.target.value })}
          />

          {["hero", "products"].includes(section.type) && (
            <Input
              label="Subheading"
              classNames={{ inputWrapper: inputWrapperClass }}
              variant="bordered"
              value={section.subheading || ""}
              onChange={(e) => update({ subheading: e.target.value })}
            />
          )}

          {["about", "story", "text", "ingredients", "contact"].includes(
            section.type
          ) && (
            <Textarea
              label="Body Text"
              classNames={{ inputWrapper: inputWrapperClass }}
              variant="bordered"
              minRows={3}
              value={section.body || ""}
              onChange={(e) => update({ body: e.target.value })}
            />
          )}

          {["hero", "about", "image"].includes(section.type) && (
            <div className="flex items-center gap-3">
              <Input
                label="Image URL"
                classNames={{ inputWrapper: inputWrapperClass }}
                variant="bordered"
                value={section.image || ""}
                onChange={(e) => update({ image: e.target.value })}
                className="flex-1"
              />
              <FileUploaderButton
                className="mt-5 rounded-lg border-2 border-black bg-white px-3 py-2 text-sm font-bold text-black"
                imgCallbackOnUpload={(url) => update({ image: url })}
              >
                Upload
              </FileUploaderButton>
            </div>
          )}

          {section.type === "about" && (
            <Select
              label="Image Position"
              classNames={selectClassNames}
              variant="bordered"
              selectedKeys={[section.imagePosition || "right"]}
              onChange={(e) =>
                update({ imagePosition: e.target.value as "left" | "right" })
              }
            >
              <SelectItem key="left" value="left" className="text-black">
                Left
              </SelectItem>
              <SelectItem key="right" value="right" className="text-black">
                Right
              </SelectItem>
            </Select>
          )}

          {section.type === "hero" && (
            <>
              <Input
                label="Button Text"
                classNames={{ inputWrapper: inputWrapperClass }}
                variant="bordered"
                value={section.ctaText || ""}
                onChange={(e) => update({ ctaText: e.target.value })}
              />
              <Input
                label="Button Link"
                classNames={{ inputWrapper: inputWrapperClass }}
                variant="bordered"
                value={section.ctaLink || ""}
                onChange={(e) => update({ ctaLink: e.target.value })}
                placeholder="#products"
              />
              <div>
                <label className="mb-1 block text-xs text-gray-500">
                  Overlay Opacity:{" "}
                  {Math.round((section.overlayOpacity ?? 0.6) * 100)}%
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={Math.round((section.overlayOpacity ?? 0.6) * 100)}
                  onChange={(e) =>
                    update({ overlayOpacity: parseInt(e.target.value) / 100 })
                  }
                  className="w-full"
                />
              </div>
            </>
          )}

          {section.type === "image" && (
            <>
              <Input
                label="Caption"
                classNames={{ inputWrapper: inputWrapperClass }}
                variant="bordered"
                value={section.caption || ""}
                onChange={(e) => update({ caption: e.target.value })}
              />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={section.fullWidth || false}
                  onChange={(e) => update({ fullWidth: e.target.checked })}
                />
                Full width
              </label>
            </>
          )}

          {section.type === "products" && (
            <>
              <Select
                label="Product Layout"
                classNames={selectClassNames}
                variant="bordered"
                selectedKeys={[section.productLayout || "grid"]}
                onChange={(e) =>
                  update({
                    productLayout: e.target.value as
                      | "grid"
                      | "list"
                      | "featured",
                  })
                }
              >
                <SelectItem key="grid" value="grid" className="text-black">
                  Grid
                </SelectItem>
                <SelectItem key="list" value="list" className="text-black">
                  List
                </SelectItem>
                <SelectItem
                  key="featured"
                  value="featured"
                  className="text-black"
                >
                  Featured
                </SelectItem>
              </Select>
              <Input
                label="Product Limit (optional)"
                classNames={{ inputWrapper: inputWrapperClass }}
                variant="bordered"
                type="number"
                min="1"
                value={section.productLimit ? String(section.productLimit) : ""}
                onChange={(e) =>
                  update({
                    productLimit: e.target.value
                      ? parseInt(e.target.value)
                      : undefined,
                  })
                }
                placeholder="Show all"
              />

              {section.productLayout === "featured" &&
                sellerProducts.length > 0 && (
                  <div>
                    <label className="mb-1 block text-sm font-bold text-black">
                      Hero Product
                    </label>
                    <p className="mb-2 text-xs text-gray-500">
                      Select the product to feature prominently at the top.
                    </p>
                    <Select
                      classNames={selectClassNames}
                      variant="bordered"
                      selectedKeys={
                        section.heroProductId ? [section.heroProductId] : []
                      }
                      onChange={(e) =>
                        update({ heroProductId: e.target.value || undefined })
                      }
                      placeholder="First product (default)"
                    >
                      {sellerProducts.map((p) => (
                        <SelectItem
                          key={p.id}
                          value={p.id}
                          className="text-black"
                        >
                          {p.title} {p.price ? `($${p.price})` : ""}
                        </SelectItem>
                      ))}
                    </Select>
                  </div>
                )}

              {sellerProducts.length > 0 && (
                <div>
                  <label className="mb-1 block text-sm font-bold text-black">
                    Product Order
                  </label>
                  <p className="mb-2 text-xs text-gray-500">
                    Drag to reorder how products appear. Leave empty for default
                    order.
                  </p>
                  <ProductOrderList
                    sellerProducts={sellerProducts}
                    productIds={section.productIds || []}
                    heroProductId={section.heroProductId}
                    layout={section.productLayout || "grid"}
                    onChange={(ids) =>
                      update({ productIds: ids.length > 0 ? ids : undefined })
                    }
                    dragItemRef={dragItemRef}
                    dragOverItemRef={dragOverItemRef}
                  />
                </div>
              )}
            </>
          )}

          {section.type === "contact" && (
            <>
              <Input
                label="Email"
                classNames={{ inputWrapper: inputWrapperClass }}
                variant="bordered"
                value={section.email || ""}
                onChange={(e) => update({ email: e.target.value })}
              />
              <Input
                label="Phone"
                classNames={{ inputWrapper: inputWrapperClass }}
                variant="bordered"
                value={section.phone || ""}
                onChange={(e) => update({ phone: e.target.value })}
              />
              <Textarea
                label="Address"
                classNames={{ inputWrapper: inputWrapperClass }}
                variant="bordered"
                minRows={2}
                value={section.address || ""}
                onChange={(e) => update({ address: e.target.value })}
              />
            </>
          )}

          {section.type === "reviews" && shopPubkey && (
            <ReviewOrderList
              shopPubkey={shopPubkey}
              reviewOrder={section.reviewOrder || []}
              onChange={(reviewOrder) =>
                update({
                  reviewOrder: reviewOrder.length > 0 ? reviewOrder : undefined,
                })
              }
              dragItemRef={dragItemRef}
              dragOverItemRef={dragOverItemRef}
            />
          )}

          {section.type === "faq" && (
            <FaqEditor
              items={section.items || []}
              onChange={(items) => update({ items })}
            />
          )}

          {section.type === "testimonials" && (
            <TestimonialEditor
              testimonials={section.testimonials || []}
              onChange={(testimonials) => update({ testimonials })}
            />
          )}

          {section.type === "ingredients" && (
            <IngredientEditor
              items={section.ingredientItems || []}
              onChange={(ingredientItems) => update({ ingredientItems })}
            />
          )}

          {section.type === "story" && (
            <TimelineEditor
              items={section.timelineItems || []}
              onChange={(timelineItems) => update({ timelineItems })}
            />
          )}

          {section.type === "comparison" && (
            <ComparisonEditor
              features={section.comparisonFeatures || []}
              columns={section.comparisonColumns || []}
              onFeaturesChange={(comparisonFeatures) =>
                update({ comparisonFeatures })
              }
              onColumnsChange={(comparisonColumns) =>
                update({ comparisonColumns })
              }
            />
          )}
        </div>
      )}
    </div>
  );
}

function FaqEditor({
  items,
  onChange,
}: {
  items: StorefrontFaqItem[];
  onChange: (items: StorefrontFaqItem[]) => void;
}) {
  const add = () => onChange([...items, { question: "", answer: "" }]);
  const remove = (idx: number) => onChange(items.filter((_, i) => i !== idx));
  const edit = (idx: number, field: keyof StorefrontFaqItem, value: string) => {
    const updated = [...items];
    updated[idx] = { ...updated[idx]!, [field]: value };
    onChange(updated);
  };

  return (
    <div className="space-y-3">
      <label className="block text-sm font-bold text-gray-700">FAQ Items</label>
      {items.map((item, idx) => (
        <div key={idx} className="rounded border border-gray-200 p-3">
          <div className="flex items-start justify-between">
            <div className="flex-1 space-y-2">
              <Input
                label="Question"
                size="sm"
                classNames={{ inputWrapper: inputWrapperClass }}
                variant="bordered"
                value={item.question}
                onChange={(e) => edit(idx, "question", e.target.value)}
              />
              <Textarea
                label="Answer"
                size="sm"
                classNames={{ inputWrapper: inputWrapperClass }}
                variant="bordered"
                minRows={2}
                value={item.answer}
                onChange={(e) => edit(idx, "answer", e.target.value)}
              />
            </div>
            <button
              type="button"
              onClick={() => remove(idx)}
              className="ml-2 text-xs text-red-500"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="text-sm font-bold text-blue-600 hover:underline"
      >
        + Add FAQ Item
      </button>
    </div>
  );
}

function TestimonialEditor({
  testimonials,
  onChange,
}: {
  testimonials: StorefrontTestimonial[];
  onChange: (testimonials: StorefrontTestimonial[]) => void;
}) {
  const add = () => onChange([...testimonials, { quote: "", author: "" }]);
  const remove = (idx: number) =>
    onChange(testimonials.filter((_, i) => i !== idx));
  const edit = (idx: number, fields: Partial<StorefrontTestimonial>) => {
    const updated = [...testimonials];
    updated[idx] = { ...updated[idx]!, ...fields };
    onChange(updated);
  };

  return (
    <div className="space-y-3">
      <label className="block text-sm font-bold text-gray-700">
        Testimonials
      </label>
      {testimonials.map((t, idx) => (
        <div key={idx} className="rounded border border-gray-200 p-3">
          <div className="flex items-start justify-between">
            <div className="flex-1 space-y-2">
              <Textarea
                label="Quote"
                size="sm"
                classNames={{ inputWrapper: inputWrapperClass }}
                variant="bordered"
                minRows={2}
                value={t.quote}
                onChange={(e) => edit(idx, { quote: e.target.value })}
              />
              <div className="flex gap-2">
                <Input
                  label="Author"
                  size="sm"
                  classNames={{ inputWrapper: inputWrapperClass }}
                  variant="bordered"
                  value={t.author}
                  onChange={(e) => edit(idx, { author: e.target.value })}
                  className="flex-1"
                />
                <Input
                  label="Rating (1-5)"
                  size="sm"
                  classNames={{ inputWrapper: inputWrapperClass }}
                  variant="bordered"
                  type="number"
                  min="1"
                  max="5"
                  value={t.rating ? String(t.rating) : ""}
                  onChange={(e) =>
                    edit(idx, {
                      rating: e.target.value
                        ? parseInt(e.target.value)
                        : undefined,
                    })
                  }
                  className="w-24"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() => remove(idx)}
              className="ml-2 text-xs text-red-500"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="text-sm font-bold text-blue-600 hover:underline"
      >
        + Add Testimonial
      </button>
    </div>
  );
}

function IngredientEditor({
  items,
  onChange,
}: {
  items: StorefrontIngredientItem[];
  onChange: (items: StorefrontIngredientItem[]) => void;
}) {
  const add = () => onChange([...items, { name: "" }]);
  const remove = (idx: number) => onChange(items.filter((_, i) => i !== idx));
  const edit = (idx: number, fields: Partial<StorefrontIngredientItem>) => {
    const updated = [...items];
    updated[idx] = { ...updated[idx]!, ...fields };
    onChange(updated);
  };

  return (
    <div className="space-y-3">
      <label className="block text-sm font-bold text-gray-700">
        Ingredient Items
      </label>
      {items.map((item, idx) => (
        <div
          key={idx}
          className="flex items-center gap-2 rounded border border-gray-200 p-2"
        >
          <Input
            label="Name"
            size="sm"
            classNames={{ inputWrapper: inputWrapperClass }}
            variant="bordered"
            value={item.name}
            onChange={(e) => edit(idx, { name: e.target.value })}
            className="flex-1"
          />
          <Input
            label="Description"
            size="sm"
            classNames={{ inputWrapper: inputWrapperClass }}
            variant="bordered"
            value={item.description || ""}
            onChange={(e) => edit(idx, { description: e.target.value })}
            className="flex-1"
          />
          <button
            type="button"
            onClick={() => remove(idx)}
            className="text-xs text-red-500"
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="text-sm font-bold text-blue-600 hover:underline"
      >
        + Add Item
      </button>
    </div>
  );
}

function TimelineEditor({
  items,
  onChange,
}: {
  items: StorefrontTimelineItem[];
  onChange: (items: StorefrontTimelineItem[]) => void;
}) {
  const add = () => onChange([...items, { heading: "", body: "" }]);
  const remove = (idx: number) => onChange(items.filter((_, i) => i !== idx));
  const edit = (idx: number, fields: Partial<StorefrontTimelineItem>) => {
    const updated = [...items];
    updated[idx] = { ...updated[idx]!, ...fields };
    onChange(updated);
  };

  return (
    <div className="space-y-3">
      <label className="block text-sm font-bold text-gray-700">
        Timeline Items
      </label>
      {items.map((item, idx) => (
        <div key={idx} className="rounded border border-gray-200 p-3">
          <div className="flex items-start justify-between">
            <div className="flex-1 space-y-2">
              <Input
                label="Year / Label"
                size="sm"
                classNames={{ inputWrapper: inputWrapperClass }}
                variant="bordered"
                value={item.year || ""}
                onChange={(e) => edit(idx, { year: e.target.value })}
              />
              <Input
                label="Heading"
                size="sm"
                classNames={{ inputWrapper: inputWrapperClass }}
                variant="bordered"
                value={item.heading}
                onChange={(e) => edit(idx, { heading: e.target.value })}
              />
              <Textarea
                label="Body"
                size="sm"
                classNames={{ inputWrapper: inputWrapperClass }}
                variant="bordered"
                minRows={2}
                value={item.body}
                onChange={(e) => edit(idx, { body: e.target.value })}
              />
            </div>
            <button
              type="button"
              onClick={() => remove(idx)}
              className="ml-2 text-xs text-red-500"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="text-sm font-bold text-blue-600 hover:underline"
      >
        + Add Timeline Entry
      </button>
    </div>
  );
}

function ComparisonEditor({
  features,
  columns,
  onFeaturesChange,
  onColumnsChange,
}: {
  features: string[];
  columns: StorefrontComparisonColumn[];
  onFeaturesChange: (features: string[]) => void;
  onColumnsChange: (columns: StorefrontComparisonColumn[]) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <label className="mb-2 block text-sm font-bold text-gray-700">
          Features (Rows)
        </label>
        {features.map((f, idx) => (
          <div key={idx} className="mb-2 flex items-center gap-2">
            <Input
              size="sm"
              classNames={{ inputWrapper: inputWrapperClass }}
              variant="bordered"
              value={f}
              onChange={(e) => {
                const updated = [...features];
                updated[idx] = e.target.value;
                onFeaturesChange(updated);
              }}
              className="flex-1"
            />
            <button
              type="button"
              onClick={() =>
                onFeaturesChange(features.filter((_, i) => i !== idx))
              }
              className="text-xs text-red-500"
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onFeaturesChange([...features, ""])}
          className="text-sm font-bold text-blue-600 hover:underline"
        >
          + Add Feature
        </button>
      </div>
      <div>
        <label className="mb-2 block text-sm font-bold text-gray-700">
          Columns
        </label>
        {columns.map((col, colIdx) => (
          <div key={colIdx} className="mb-3 rounded border border-gray-200 p-3">
            <div className="mb-2 flex items-center justify-between">
              <Input
                label="Column Heading"
                size="sm"
                classNames={{ inputWrapper: inputWrapperClass }}
                variant="bordered"
                value={col.heading}
                onChange={(e) => {
                  const updated = [...columns];
                  updated[colIdx] = {
                    ...updated[colIdx]!,
                    heading: e.target.value,
                  };
                  onColumnsChange(updated);
                }}
                className="flex-1"
              />
              <button
                type="button"
                onClick={() =>
                  onColumnsChange(columns.filter((_, i) => i !== colIdx))
                }
                className="ml-2 text-xs text-red-500"
              >
                ✕
              </button>
            </div>
            {features.map((f, rowIdx) => (
              <Input
                key={rowIdx}
                label={f || `Row ${rowIdx + 1}`}
                size="sm"
                classNames={{ inputWrapper: inputWrapperClass }}
                variant="bordered"
                value={col.values[rowIdx] || ""}
                onChange={(e) => {
                  const updated = [...columns];
                  const vals = [...(updated[colIdx]!.values || [])];
                  vals[rowIdx] = e.target.value;
                  updated[colIdx] = { ...updated[colIdx]!, values: vals };
                  onColumnsChange(updated);
                }}
                className="mb-1"
              />
            ))}
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            onColumnsChange([...columns, { heading: "", values: [] }])
          }
          className="text-sm font-bold text-blue-600 hover:underline"
        >
          + Add Column
        </button>
      </div>
    </div>
  );
}

function ProductOrderList({
  sellerProducts,
  productIds,
  heroProductId,
  layout,
  onChange,
  dragItemRef,
  dragOverItemRef,
}: {
  sellerProducts: ProductData[];
  productIds: string[];
  heroProductId?: string;
  layout: "grid" | "list" | "featured";
  onChange: (ids: string[]) => void;
  dragItemRef: React.MutableRefObject<number | null>;
  dragOverItemRef: React.MutableRefObject<number | null>;
}) {
  const orderedProducts = (() => {
    if (productIds.length === 0) return sellerProducts;
    const idMap = new Map(sellerProducts.map((p) => [p.id, p]));
    const ordered: ProductData[] = [];
    for (const id of productIds) {
      const p = idMap.get(id);
      if (p) ordered.push(p);
    }
    for (const p of sellerProducts) {
      if (!productIds.includes(p.id)) ordered.push(p);
    }
    return ordered;
  })();

  const handleDragStart = (idx: number) => {
    dragItemRef.current = idx;
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    dragOverItemRef.current = idx;
  };

  const handleDrop = () => {
    if (dragItemRef.current === null || dragOverItemRef.current === null)
      return;
    if (dragItemRef.current === dragOverItemRef.current) return;
    const items = [...orderedProducts];
    const [dragged] = items.splice(dragItemRef.current, 1);
    items.splice(dragOverItemRef.current, 0, dragged!);
    onChange(items.map((p) => p.id));
    dragItemRef.current = null;
    dragOverItemRef.current = null;
  };

  const moveProduct = (fromIdx: number, toIdx: number) => {
    if (toIdx < 0 || toIdx >= orderedProducts.length) return;
    const items = [...orderedProducts];
    const [moved] = items.splice(fromIdx, 1);
    items.splice(toIdx, 0, moved!);
    onChange(items.map((p) => p.id));
  };

  if (orderedProducts.length === 0) {
    return <p className="text-xs italic text-gray-400">No products found.</p>;
  }

  return (
    <div className="max-h-64 space-y-1 overflow-y-auto rounded border border-gray-200 p-2">
      {orderedProducts.map((product, idx) => {
        const isHero =
          layout === "featured" &&
          (heroProductId ? product.id === heroProductId : idx === 0);
        return (
          <div
            key={product.id}
            draggable
            onDragStart={() => handleDragStart(idx)}
            onDragOver={(e) => handleDragOver(e, idx)}
            onDrop={handleDrop}
            className={`flex cursor-grab items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors active:cursor-grabbing ${
              isHero
                ? "border border-blue-300 bg-blue-50"
                : "border border-transparent hover:bg-gray-50"
            }`}
          >
            <span className="flex flex-col gap-0.5 text-[10px] text-gray-400">
              <button
                type="button"
                onClick={() => moveProduct(idx, idx - 1)}
                disabled={idx === 0}
                className="leading-none hover:text-black disabled:opacity-30"
              >
                &#9650;
              </button>
              <button
                type="button"
                onClick={() => moveProduct(idx, idx + 1)}
                disabled={idx === orderedProducts.length - 1}
                className="leading-none hover:text-black disabled:opacity-30"
              >
                &#9660;
              </button>
            </span>
            <span className="text-xs text-gray-400">&#9776;</span>
            {product.images?.[0] && (
              <img
                src={product.images[0]}
                alt={product.title}
                className="h-8 w-8 flex-shrink-0 rounded object-cover"
              />
            )}
            <span className="flex-1 truncate font-medium text-black">
              {product.title}
            </span>
            {isHero && (
              <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">
                HERO
              </span>
            )}
            <span className="text-xs text-gray-500">
              {product.price ? `$${product.price}` : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}

interface ReviewItem {
  key: string;
  reviewerPubkey: string;
  productDTag: string;
  comment: string;
  isPositive: boolean;
}

function ReviewOrderList({
  shopPubkey,
  reviewOrder,
  onChange,
  dragItemRef,
  dragOverItemRef,
}: {
  shopPubkey: string;
  reviewOrder: string[];
  onChange: (keys: string[]) => void;
  dragItemRef: React.MutableRefObject<number | null>;
  dragOverItemRef: React.MutableRefObject<number | null>;
}) {
  const reviewsContext = useContext(ReviewsContext);

  const allReviews: ReviewItem[] = (() => {
    const merchantProducts =
      reviewsContext?.productReviewsData?.get(shopPubkey);
    if (!merchantProducts) return [];

    const reviews: ReviewItem[] = [];
    for (const [productDTag, productReviews] of merchantProducts.entries()) {
      for (const [reviewerPubkey, reviewData] of productReviews.entries()) {
        const commentEntry = reviewData.find(([cat]) => cat === "comment");
        const thumbEntry = reviewData.find(([_, __, cat]) => cat === "thumb");
        reviews.push({
          key: `${productDTag}:${reviewerPubkey}`,
          reviewerPubkey,
          productDTag,
          comment: commentEntry?.[1] || "",
          isPositive: thumbEntry?.[1] === "1",
        });
      }
    }
    return reviews;
  })();

  const orderedReviews = (() => {
    if (reviewOrder.length === 0) return allReviews;
    const reviewMap = new Map(allReviews.map((r) => [r.key, r]));
    const ordered: ReviewItem[] = [];
    for (const key of reviewOrder) {
      const review = reviewMap.get(key);
      if (review) {
        ordered.push(review);
        reviewMap.delete(key);
      }
    }
    for (const review of reviewMap.values()) {
      ordered.push(review);
    }
    return ordered;
  })();

  const handleDragStart = (idx: number) => {
    dragItemRef.current = idx;
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    dragOverItemRef.current = idx;
  };

  const handleDrop = () => {
    if (dragItemRef.current === null || dragOverItemRef.current === null)
      return;
    if (dragItemRef.current === dragOverItemRef.current) return;
    const items = [...orderedReviews];
    const [dragged] = items.splice(dragItemRef.current, 1);
    items.splice(dragOverItemRef.current, 0, dragged!);
    onChange(items.map((r) => r.key));
    dragItemRef.current = null;
    dragOverItemRef.current = null;
  };

  const moveReview = (fromIdx: number, toIdx: number) => {
    if (toIdx < 0 || toIdx >= orderedReviews.length) return;
    const items = [...orderedReviews];
    const [moved] = items.splice(fromIdx, 1);
    items.splice(toIdx, 0, moved!);
    onChange(items.map((r) => r.key));
  };

  if (orderedReviews.length === 0) {
    return (
      <p className="text-xs italic text-gray-400">
        No reviews yet. Reviews will appear here once customers leave feedback.
      </p>
    );
  }

  return (
    <div>
      <label className="mb-1 block text-sm font-bold text-black">
        Review Order
      </label>
      <p className="mb-2 text-xs text-gray-500">
        Drag to reorder how reviews appear on your storefront.
      </p>
      <div className="max-h-64 space-y-1 overflow-y-auto rounded border border-gray-200 p-2">
        {orderedReviews.map((review, idx) => (
          <div
            key={review.key}
            draggable
            onDragStart={() => handleDragStart(idx)}
            onDragOver={(e) => handleDragOver(e, idx)}
            onDrop={handleDrop}
            className="flex cursor-grab items-center gap-2 rounded border border-transparent px-2 py-1.5 text-sm transition-colors hover:bg-gray-50 active:cursor-grabbing"
          >
            <span className="flex flex-col gap-0.5 text-[10px] text-gray-400">
              <button
                type="button"
                onClick={() => moveReview(idx, idx - 1)}
                disabled={idx === 0}
                className="leading-none hover:text-black disabled:opacity-30"
              >
                &#9650;
              </button>
              <button
                type="button"
                onClick={() => moveReview(idx, idx + 1)}
                disabled={idx === orderedReviews.length - 1}
                className="leading-none hover:text-black disabled:opacity-30"
              >
                &#9660;
              </button>
            </span>
            <span className="text-xs text-gray-400">&#9776;</span>
            <span
              className={`flex-shrink-0 rounded px-1.5 py-0.5 text-xs font-bold ${
                review.isPositive
                  ? "bg-green-100 text-green-700"
                  : "bg-red-100 text-red-700"
              }`}
            >
              {review.isPositive ? "👍" : "👎"}
            </span>
            <span className="flex-1 truncate text-black">
              {review.comment
                ? `"${review.comment.slice(0, 60)}${
                    review.comment.length > 60 ? "..." : ""
                  }"`
                : "(no comment)"}
            </span>
            <span className="flex-shrink-0 text-[10px] text-gray-400">
              {review.reviewerPubkey.slice(0, 8)}...
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
