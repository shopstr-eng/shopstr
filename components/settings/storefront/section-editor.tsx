import { useState, useEffect, useRef } from "react";
import { Input, Textarea } from "@nextui-org/react";
import {
  ChevronUpIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import {
  StorefrontSection,
  StorefrontSectionType,
  StorefrontComparisonColumn,
  StorefrontTimelineItem,
} from "@/utils/types/types";
import { FileUploaderButton } from "@/components/utility-components/file-uploader";
import { ProductData } from "@/utils/parsers/product-parser-functions";

const SECTION_LABELS: Record<StorefrontSectionType, string> = {
  hero: "Hero Banner",
  about: "About",
  story: "Our Story",
  products: "Products",
  testimonials: "Testimonials",
  faq: "FAQ",
  ingredients: "Ingredients",
  comparison: "Comparison",
  text: "Text Block",
  image: "Image",
  contact: "Contact Info",
  reviews: "Reviews",
};

interface SectionEditorProps {
  section: StorefrontSection;
  onChange: (updated: StorefrontSection) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
  products?: ProductData[];
  isNew?: boolean;
  onFlashDone?: () => void;
}

export default function SectionEditor({
  section,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
  products = [],
  isNew,
  onFlashDone,
}: SectionEditorProps) {
  const [expanded, setExpanded] = useState(false);
  const [isFlashing, setIsFlashing] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isNew) return;
    setIsFlashing(true);
    setExpanded(true);
    cardRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    const timer = setTimeout(() => {
      setIsFlashing(false);
      onFlashDone?.();
    }, 1500);
    return () => clearTimeout(timer);
  }, [isNew]);

  const update = (fields: Partial<StorefrontSection>) =>
    onChange({ ...section, ...fields });

  const enabled = section.enabled !== false;
  const borderClass = isFlashing
    ? "border-shopstr-purple dark:border-shopstr-yellow shadow-[0_0_12px_rgba(164,56,186,0.35)]"
    : enabled
      ? "border-gray-400 dark:border-gray-500"
      : "border-gray-200 dark:border-gray-700";

  return (
    <div
      ref={cardRef}
      className={`rounded-lg border-2 duration-500 transition-all ${borderClass} bg-light-fg dark:bg-dark-fg`}
    >
      <div className="flex items-center gap-2 p-3">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex flex-1 items-center gap-2 text-left"
        >
          <ChevronRightIcon
            className={`h-4 w-4 flex-shrink-0 text-light-text transition-transform dark:text-dark-text ${
              expanded ? "rotate-90" : ""
            }`}
          />
          <span className="text-sm font-bold text-light-text dark:text-dark-text">
            {SECTION_LABELS[section.type]}
          </span>
          {section.heading && (
            <span className="truncate text-xs text-gray-400 dark:text-gray-500">
              — {section.heading}
            </span>
          )}
        </button>
        <label className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => update({ enabled: e.target.checked })}
            className="h-3 w-3"
          />
          On
        </label>
        <button
          type="button"
          onClick={onMoveUp}
          disabled={isFirst}
          className="rounded p-1 text-light-text hover:bg-gray-100 disabled:opacity-30 dark:text-dark-text dark:hover:bg-gray-700"
        >
          <ChevronUpIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={isLast}
          className="rounded p-1 text-light-text hover:bg-gray-100 disabled:opacity-30 dark:text-dark-text dark:hover:bg-gray-700"
        >
          <ChevronDownIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="rounded p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
        >
          <TrashIcon className="h-4 w-4" />
        </button>
      </div>

      {expanded && (
        <div className="space-y-3 border-t-2 border-gray-200 p-3 dark:border-dark-fg">
          {/* Common fields for most sections */}
          {section.type !== "image" && section.type !== "reviews" && (
            <Input
              variant="bordered"
              size="sm"
              label="Heading"
              value={section.heading || ""}
              onChange={(e) => update({ heading: e.target.value })}
            />
          )}

          {["hero", "about", "story", "text", "contact"].includes(
            section.type
          ) && (
            <Textarea
              variant="bordered"
              size="sm"
              label={section.type === "hero" ? "Subheading" : "Body Text"}
              minRows={2}
              value={
                section.type === "hero"
                  ? section.subheading || ""
                  : section.body || ""
              }
              onChange={(e) =>
                update(
                  section.type === "hero"
                    ? { subheading: e.target.value }
                    : { body: e.target.value }
                )
              }
            />
          )}

          {/* Image upload for relevant sections */}
          {["hero", "about", "story", "image"].includes(section.type) && (
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                Image
              </label>
              {section.image && (
                <img
                  src={section.image}
                  alt=""
                  className="mb-2 h-24 w-full rounded object-cover"
                />
              )}
              <FileUploaderButton
                className="rounded border border-black px-3 py-1.5 text-xs font-bold text-light-text dark:border-dark-fg dark:text-dark-text"
                imgCallbackOnUpload={(url) => update({ image: url })}
              >
                {section.image ? "Change Image" : "Upload Image"}
              </FileUploaderButton>
              {section.image && (
                <button
                  type="button"
                  onClick={() => update({ image: undefined })}
                  className="ml-2 text-xs text-red-500"
                >
                  Remove
                </button>
              )}
            </div>
          )}

          {/* Image position for sections with side-by-side layout */}
          {["about", "story"].includes(section.type) && (
            <div className="flex gap-2">
              <label className="text-xs text-gray-500 dark:text-gray-400">
                Image Position:
              </label>
              {(["left", "right"] as const).map((pos) => (
                <label
                  key={pos}
                  className="flex items-center gap-1 text-xs text-light-text dark:text-dark-text"
                >
                  <input
                    type="radio"
                    checked={(section.imagePosition || "right") === pos}
                    onChange={() => update({ imagePosition: pos })}
                  />
                  {pos.charAt(0).toUpperCase() + pos.slice(1)}
                </label>
              ))}
            </div>
          )}

          {/* Hero-specific fields */}
          {section.type === "hero" && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  variant="bordered"
                  size="sm"
                  label="CTA Button Text"
                  value={section.ctaText || ""}
                  onChange={(e) => update({ ctaText: e.target.value })}
                />
                <Input
                  variant="bordered"
                  size="sm"
                  label="CTA Button Link"
                  value={section.ctaLink || ""}
                  onChange={(e) => update({ ctaLink: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">
                  Overlay Opacity: {section.overlayOpacity ?? 40}%
                </label>
                <input
                  type="range"
                  min={0}
                  max={90}
                  step={5}
                  value={section.overlayOpacity ?? 40}
                  onChange={(e) =>
                    update({ overlayOpacity: parseInt(e.target.value) })
                  }
                  className="w-full"
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <input
                  type="checkbox"
                  checked={!!section.fullWidth}
                  onChange={(e) => update({ fullWidth: e.target.checked })}
                />
                Full Width
              </label>
            </>
          )}

          {/* Products section */}
          {section.type === "products" && (
            <>
              <Input
                variant="bordered"
                size="sm"
                label="Subheading"
                value={section.subheading || ""}
                onChange={(e) => update({ subheading: e.target.value })}
              />
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">
                    Layout
                  </label>
                  <select
                    className="w-full rounded border border-gray-300 bg-light-fg p-1.5 text-xs text-light-text dark:border-gray-600 dark:bg-dark-fg dark:text-dark-text"
                    value={section.productLayout || "grid"}
                    onChange={(e) =>
                      update({
                        productLayout: e.target.value as
                          | "grid"
                          | "list"
                          | "featured",
                      })
                    }
                  >
                    <option value="grid">Grid</option>
                    <option value="list">List</option>
                    <option value="featured">Featured</option>
                  </select>
                </div>
                <div className="w-24">
                  <Input
                    variant="bordered"
                    size="sm"
                    label="Max Items"
                    type="number"
                    min={1}
                    max={50}
                    value={String(section.productLimit || "")}
                    onChange={(e) =>
                      update({
                        productLimit: e.target.value
                          ? parseInt(e.target.value)
                          : undefined,
                      })
                    }
                  />
                </div>
              </div>

              {/* Product ordering */}
              {products.length > 0 && (
                <div className="rounded border border-gray-200 bg-light-bg p-2 dark:border-dark-fg dark:bg-dark-bg">
                  <p className="mb-2 text-xs font-semibold text-gray-500 dark:text-gray-400">
                    Product Order{" "}
                    <span className="font-normal opacity-70">
                      (pin specific products to the top)
                    </span>
                  </p>
                  <div className="space-y-1">
                    {(section.productIds || []).map((pid, i) => {
                      const product = products.find((p) => p.id === pid);
                      return (
                        <div
                          key={pid}
                          className="flex items-center gap-2 rounded bg-light-fg px-2 py-1 dark:bg-dark-fg"
                        >
                          <span className="flex-1 truncate text-xs text-light-text dark:text-dark-text">
                            {product?.title || pid}
                          </span>
                          <button
                            type="button"
                            disabled={i === 0}
                            onClick={() => {
                              const ids = [...(section.productIds || [])];
                              [ids[i - 1], ids[i]] = [ids[i]!, ids[i - 1]!];
                              update({ productIds: ids });
                            }}
                            className="text-gray-400 hover:text-gray-600 disabled:opacity-20 dark:hover:text-gray-300"
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            disabled={
                              i === (section.productIds || []).length - 1
                            }
                            onClick={() => {
                              const ids = [...(section.productIds || [])];
                              [ids[i], ids[i + 1]] = [ids[i + 1]!, ids[i]!];
                              update({ productIds: ids });
                            }}
                            className="text-gray-400 hover:text-gray-600 disabled:opacity-20 dark:hover:text-gray-300"
                          >
                            ▼
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              update({
                                productIds: (section.productIds || []).filter(
                                  (_, j) => j !== i
                                ),
                              });
                            }}
                            className="text-xs text-red-500"
                          >
                            ✕
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-2">
                    <select
                      className="w-full rounded border border-gray-300 bg-white p-1.5 text-xs text-light-text dark:border-gray-600 dark:bg-dark-fg dark:text-dark-text"
                      value=""
                      onChange={(e) => {
                        if (!e.target.value) return;
                        const existing = section.productIds || [];
                        if (!existing.includes(e.target.value)) {
                          update({ productIds: [...existing, e.target.value] });
                        }
                        e.target.value = "";
                      }}
                    >
                      <option value="">+ Pin a product to the top…</option>
                      {products
                        .filter(
                          (p) => !(section.productIds || []).includes(p.id)
                        )
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.title}
                          </option>
                        ))}
                    </select>
                  </div>

                  {/* Hero product selector — only for "featured" layout */}
                  {(section.productLayout || "grid") === "featured" && (
                    <div className="mt-3">
                      <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400">
                        Featured (Hero) Product
                      </label>
                      <select
                        className="w-full rounded border border-gray-300 bg-white p-1.5 text-xs text-light-text dark:border-gray-600 dark:bg-dark-fg dark:text-dark-text"
                        value={section.heroProductId || ""}
                        onChange={(e) =>
                          update({
                            heroProductId: e.target.value || undefined,
                          })
                        }
                      >
                        <option value="">Auto (first product)</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.title}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Image section */}
          {section.type === "image" && (
            <>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                  Image
                </label>
                {section.image && (
                  <img
                    src={section.image}
                    alt=""
                    className="mb-2 h-24 w-full rounded object-cover"
                  />
                )}
                <FileUploaderButton
                  className="rounded border border-black px-3 py-1.5 text-xs font-bold text-light-text dark:border-dark-fg dark:text-dark-text"
                  imgCallbackOnUpload={(url) => update({ image: url })}
                >
                  {section.image ? "Change Image" : "Upload Image"}
                </FileUploaderButton>
                {section.image && (
                  <button
                    type="button"
                    onClick={() => update({ image: undefined })}
                    className="ml-2 text-xs text-red-500"
                  >
                    Remove
                  </button>
                )}
              </div>
              <Input
                variant="bordered"
                size="sm"
                label="Caption (optional)"
                value={section.caption || ""}
                onChange={(e) => update({ caption: e.target.value })}
              />
              <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <input
                  type="checkbox"
                  checked={!!section.fullWidth}
                  onChange={(e) => update({ fullWidth: e.target.checked })}
                />
                Full Width
              </label>
            </>
          )}

          {/* Contact section */}
          {section.type === "contact" && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Input
                variant="bordered"
                size="sm"
                label="Email"
                type="email"
                value={section.email || ""}
                onChange={(e) => update({ email: e.target.value })}
              />
              <Input
                variant="bordered"
                size="sm"
                label="Phone"
                value={section.phone || ""}
                onChange={(e) => update({ phone: e.target.value })}
              />
              <Input
                variant="bordered"
                size="sm"
                label="Address"
                value={section.address || ""}
                onChange={(e) => update({ address: e.target.value })}
              />
            </div>
          )}

          {/* FAQ section */}
          {section.type === "faq" && (
            <div className="space-y-2">
              {(section.items || []).map((item, i) => (
                <div
                  key={i}
                  className="rounded border border-gray-200 bg-light-bg p-2 dark:border-dark-fg dark:bg-dark-bg"
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-1 space-y-1">
                      <Input
                        variant="bordered"
                        size="sm"
                        label="Question"
                        value={item.question}
                        onChange={(e) => {
                          const items = [...(section.items || [])];
                          items[i] = { ...items[i]!, question: e.target.value };
                          update({ items });
                        }}
                      />
                      <Textarea
                        variant="bordered"
                        size="sm"
                        label="Answer"
                        minRows={2}
                        value={item.answer}
                        onChange={(e) => {
                          const items = [...(section.items || [])];
                          items[i] = { ...items[i]!, answer: e.target.value };
                          update({ items });
                        }}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const items = (section.items || []).filter(
                          (_, j) => j !== i
                        );
                        update({ items });
                      }}
                      className="mt-1 text-xs text-red-500"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  update({
                    items: [
                      ...(section.items || []),
                      { question: "", answer: "" },
                    ],
                  })
                }
                className="text-xs font-bold text-blue-600 hover:underline dark:text-blue-400"
              >
                + Add FAQ Item
              </button>
            </div>
          )}

          {/* Testimonials section */}
          {section.type === "testimonials" && (
            <div className="space-y-2">
              {(section.testimonials || []).map((t, i) => (
                <div
                  key={i}
                  className="rounded border border-gray-200 bg-light-bg p-2 dark:border-dark-fg dark:bg-dark-bg"
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-1 space-y-1">
                      <Textarea
                        variant="bordered"
                        size="sm"
                        label="Quote"
                        minRows={2}
                        value={t.quote}
                        onChange={(e) => {
                          const ts = [...(section.testimonials || [])];
                          ts[i] = { ...ts[i]!, quote: e.target.value };
                          update({ testimonials: ts });
                        }}
                      />
                      <Input
                        variant="bordered"
                        size="sm"
                        label="Author"
                        value={t.author}
                        onChange={(e) => {
                          const ts = [...(section.testimonials || [])];
                          ts[i] = { ...ts[i]!, author: e.target.value };
                          update({ testimonials: ts });
                        }}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const ts = (section.testimonials || []).filter(
                          (_, j) => j !== i
                        );
                        update({ testimonials: ts });
                      }}
                      className="mt-1 text-xs text-red-500"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  update({
                    testimonials: [
                      ...(section.testimonials || []),
                      { quote: "", author: "" },
                    ],
                  })
                }
                className="text-xs font-bold text-blue-600 hover:underline dark:text-blue-400"
              >
                + Add Testimonial
              </button>
            </div>
          )}

          {/* Ingredients section */}
          {section.type === "ingredients" && (
            <div className="space-y-2">
              {(section.ingredientItems || []).map((item, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded border border-gray-200 bg-light-bg p-2 dark:border-dark-fg dark:bg-dark-bg"
                >
                  <div className="flex-1 space-y-1">
                    <Input
                      variant="bordered"
                      size="sm"
                      label="Name"
                      value={item.name}
                      onChange={(e) => {
                        const items = [...(section.ingredientItems || [])];
                        items[i] = { ...items[i]!, name: e.target.value };
                        update({ ingredientItems: items });
                      }}
                    />
                    <Input
                      variant="bordered"
                      size="sm"
                      label="Description (optional)"
                      value={item.description || ""}
                      onChange={(e) => {
                        const items = [...(section.ingredientItems || [])];
                        items[i] = {
                          ...items[i]!,
                          description: e.target.value,
                        };
                        update({ ingredientItems: items });
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const items = (section.ingredientItems || []).filter(
                        (_, j) => j !== i
                      );
                      update({ ingredientItems: items });
                    }}
                    className="text-xs text-red-500"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  update({
                    ingredientItems: [
                      ...(section.ingredientItems || []),
                      { name: "" },
                    ],
                  })
                }
                className="text-xs font-bold text-blue-600 hover:underline dark:text-blue-400"
              >
                + Add Ingredient
              </button>
            </div>
          )}

          {/* Story timeline items */}
          {section.type === "story" && (
            <TimelineEditor
              items={section.timelineItems || []}
              onChange={(timelineItems) => update({ timelineItems })}
            />
          )}

          {/* Comparison section */}
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

          {/* Reviews section */}
          {section.type === "reviews" && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              This section automatically displays your customer reviews from
              Nostr.
            </p>
          )}
        </div>
      )}
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
    <div className="space-y-2">
      <label className="block text-xs font-semibold text-light-text dark:text-dark-text">
        Timeline Entries
      </label>
      {items.map((item, idx) => (
        <div
          key={idx}
          className="rounded border border-gray-200 bg-light-bg p-2 dark:border-dark-fg dark:bg-dark-bg"
        >
          <div className="flex items-start gap-2">
            <div className="flex-1 space-y-1">
              <Input
                variant="bordered"
                size="sm"
                label="Year / Label (optional)"
                value={item.year || ""}
                onChange={(e) => edit(idx, { year: e.target.value })}
              />
              <Input
                variant="bordered"
                size="sm"
                label="Heading"
                value={item.heading}
                onChange={(e) => edit(idx, { heading: e.target.value })}
              />
              <Textarea
                variant="bordered"
                size="sm"
                label="Body"
                minRows={2}
                value={item.body}
                onChange={(e) => edit(idx, { body: e.target.value })}
              />
            </div>
            <button
              type="button"
              onClick={() => remove(idx)}
              className="mt-1 text-xs text-red-500"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="text-xs font-bold text-blue-600 hover:underline dark:text-blue-400"
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
        <label className="mb-2 block text-xs font-semibold text-light-text dark:text-dark-text">
          Comparison Rows (Features)
        </label>
        {features.map((f, idx) => (
          <div key={idx} className="mb-1.5 flex items-center gap-2">
            <Input
              variant="bordered"
              size="sm"
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
          className="text-xs font-bold text-blue-600 hover:underline dark:text-blue-400"
        >
          + Add Row
        </button>
      </div>

      <div>
        <label className="mb-2 block text-xs font-semibold text-light-text dark:text-dark-text">
          Columns
        </label>
        {columns.map((col, colIdx) => (
          <div
            key={colIdx}
            className="mb-2 rounded border border-gray-200 bg-light-bg p-2 dark:border-dark-fg dark:bg-dark-bg"
          >
            <div className="mb-2 flex items-center gap-2">
              <Input
                variant="bordered"
                size="sm"
                label="Column Heading"
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
                className="text-xs text-red-500"
              >
                ✕
              </button>
            </div>
            {features.map((f, rowIdx) => (
              <Input
                key={rowIdx}
                variant="bordered"
                size="sm"
                label={f || `Row ${rowIdx + 1}`}
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
            {features.length === 0 && (
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Add rows above first, then fill in values for each column.
              </p>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            onColumnsChange([...columns, { heading: "", values: [] }])
          }
          className="text-xs font-bold text-blue-600 hover:underline dark:text-blue-400"
        >
          + Add Column
        </button>
      </div>
    </div>
  );
}
