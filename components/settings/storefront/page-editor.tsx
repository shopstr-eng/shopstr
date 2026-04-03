import { useState } from "react";
import { Input } from "@nextui-org/react";
import { ChevronRightIcon, TrashIcon } from "@heroicons/react/24/outline";
import {
  StorefrontPage,
  StorefrontSection,
  StorefrontSectionType,
} from "@/utils/types/types";
import { ProductData } from "@/utils/parsers/product-parser-functions";
import SectionEditor from "./section-editor";

const PAGE_SECTION_TYPES: { type: StorefrontSectionType; label: string }[] = [
  { type: "hero", label: "Hero" },
  { type: "about", label: "About" },
  { type: "story", label: "Our Story" },
  { type: "products", label: "Products" },
  { type: "testimonials", label: "Testimonials" },
  { type: "faq", label: "FAQ" },
  { type: "ingredients", label: "Ingredients" },
  { type: "comparison", label: "Comparison" },
  { type: "text", label: "Text" },
  { type: "image", label: "Image" },
  { type: "contact", label: "Contact" },
  { type: "reviews", label: "Reviews" },
];

interface PageEditorProps {
  pages: StorefrontPage[];
  onChange: (pages: StorefrontPage[]) => void;
  sellerProducts?: ProductData[];
}

export default function PageEditor({
  pages,
  onChange,
  sellerProducts = [],
}: PageEditorProps) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  const addPage = () => {
    const id = `page-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    onChange([...pages, { id, title: "", slug: "", sections: [] }]);
    setExpandedIdx(pages.length);
  };

  const removePage = (i: number) => {
    onChange(pages.filter((_, j) => j !== i));
    if (expandedIdx === i) setExpandedIdx(null);
  };

  const updatePage = (i: number, fields: Partial<StorefrontPage>) => {
    const updated = [...pages];
    updated[i] = { ...updated[i]!, ...fields };
    onChange(updated);
  };

  const addSectionToPage = (i: number, type: StorefrontSectionType) => {
    const newSection: StorefrontSection = {
      id: `section-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type,
      enabled: true,
    };
    const page = pages[i]!;
    updatePage(i, { sections: [...(page.sections || []), newSection] });
  };

  const updatePageSection = (
    pageIdx: number,
    sectionIdx: number,
    updated: StorefrontSection
  ) => {
    const page = pages[pageIdx]!;
    const sections = [...(page.sections || [])];
    sections[sectionIdx] = updated;
    updatePage(pageIdx, { sections });
  };

  const removePageSection = (pageIdx: number, sectionIdx: number) => {
    const page = pages[pageIdx]!;
    const sections = (page.sections || []).filter((_, j) => j !== sectionIdx);
    updatePage(pageIdx, { sections });
  };

  const movePageSection = (pageIdx: number, from: number, to: number) => {
    const page = pages[pageIdx]!;
    const sections = [...(page.sections || [])];
    if (to < 0 || to >= sections.length) return;
    [sections[from], sections[to]] = [sections[to]!, sections[from]!];
    updatePage(pageIdx, { sections });
  };

  const slugify = (s: string) =>
    s
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .slice(0, 60);

  return (
    <div>
      <label className="mb-2 block text-base font-bold text-light-text dark:text-dark-text">
        Custom Pages
      </label>
      <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">
        Add custom pages to your storefront (e.g. About, FAQ, Contact). Each
        page gets its own URL at{" "}
        <code className="rounded bg-light-bg px-1 text-xs dark:bg-dark-bg">
          /shop/[slug]/[page-slug]
        </code>
        .
      </p>
      <div className="space-y-2">
        {pages.map((page, i) => (
          <div
            key={page.id}
            className="rounded-lg border-2 border-gray-400 bg-light-fg dark:border-gray-500 dark:bg-dark-fg"
          >
            <div className="flex items-center gap-2 p-3">
              <button
                type="button"
                onClick={() => setExpandedIdx(expandedIdx === i ? null : i)}
                className="flex flex-1 items-center gap-2 text-left"
              >
                <ChevronRightIcon
                  className={`h-4 w-4 flex-shrink-0 text-light-text transition-transform dark:text-dark-text ${
                    expandedIdx === i ? "rotate-90" : ""
                  }`}
                />
                <span className="text-sm font-bold text-light-text dark:text-dark-text">
                  {page.title || "(Untitled Page)"}
                </span>
                {page.slug && (
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    /{page.slug}
                  </span>
                )}
                {page.sections && page.sections.length > 0 && (
                  <span className="rounded-full bg-gray-200 px-1.5 py-0.5 text-xs text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                    {page.sections.length} section
                    {page.sections.length !== 1 ? "s" : ""}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => removePage(i)}
                className="rounded p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </div>
            {expandedIdx === i && (
              <div className="space-y-4 border-t-2 border-gray-200 p-3 dark:border-dark-fg">
                <Input
                  variant="bordered"
                  size="sm"
                  label="Page Title"
                  value={page.title}
                  onChange={(e) => {
                    const title = e.target.value;
                    updatePage(i, {
                      title,
                      slug: page.slug || slugify(title),
                    });
                  }}
                />
                <Input
                  variant="bordered"
                  size="sm"
                  label="URL Slug"
                  value={page.slug}
                  onChange={(e) =>
                    updatePage(i, { slug: slugify(e.target.value) })
                  }
                  startContent={
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      /
                    </span>
                  }
                  description="Only letters, numbers, and hyphens"
                />

                <div>
                  <p className="mb-2 text-xs font-semibold text-light-text dark:text-dark-text">
                    Page Sections
                  </p>
                  <div className="space-y-2">
                    {(page.sections || []).map((section, si) => (
                      <SectionEditor
                        key={section.id}
                        section={section}
                        products={sellerProducts}
                        onChange={(updated) =>
                          updatePageSection(i, si, updated)
                        }
                        onRemove={() => removePageSection(i, si)}
                        onMoveUp={() => movePageSection(i, si, si - 1)}
                        onMoveDown={() => movePageSection(i, si, si + 1)}
                        isFirst={si === 0}
                        isLast={si === (page.sections || []).length - 1}
                      />
                    ))}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {PAGE_SECTION_TYPES.map((st) => (
                      <button
                        key={st.type}
                        type="button"
                        onClick={() => addSectionToPage(i, st.type)}
                        className="rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-600 hover:border-shopstr-purple hover:text-shopstr-purple dark:border-gray-600 dark:text-gray-400 dark:hover:border-shopstr-yellow dark:hover:text-shopstr-yellow"
                      >
                        + {st.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={addPage}
        className="mt-3 text-sm font-bold text-blue-600 hover:underline dark:text-blue-400"
      >
        + Add Custom Page
      </button>
    </div>
  );
}
