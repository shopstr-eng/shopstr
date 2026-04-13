import { Input } from "@heroui/react";
import {
  StorefrontPage,
  StorefrontSection,
  StorefrontSectionType,
  StorefrontNavLink,
} from "@/utils/types/types";
import SectionEditor from "./section-editor";
import { useState } from "react";
import type { ProductData } from "@/utils/parsers/product-parser-functions";

interface PageEditorProps {
  pages: StorefrontPage[];
  onChange: (pages: StorefrontPage[]) => void;
  navLinks: StorefrontNavLink[];
  onNavLinksChange: (links: StorefrontNavLink[]) => void;
  sellerProducts?: ProductData[];
  shopPubkey?: string;
}

const SECTION_TYPES: { type: StorefrontSectionType; label: string }[] = [
  { type: "hero", label: "Hero" },
  { type: "about", label: "About" },
  { type: "story", label: "Our Story" },
  { type: "products", label: "Products" },
  { type: "testimonials", label: "Testimonials" },
  { type: "faq", label: "FAQ" },
  { type: "ingredients", label: "Ingredients / Sourcing" },
  { type: "comparison", label: "Comparison" },
  { type: "text", label: "Text Block" },
  { type: "image", label: "Image" },
  { type: "contact", label: "Contact" },
  { type: "reviews", label: "Customer Reviews" },
];

const inputWrapperClass =
  "border-2 border-gray-300 rounded-lg bg-white shadow-none hover:bg-white data-[hover=true]:bg-white group-data-[focus=true]:border-black";

export default function PageEditor({
  pages,
  onChange,
  navLinks,
  onNavLinksChange,
  sellerProducts = [],
  shopPubkey,
}: PageEditorProps) {
  const [expandedPage, setExpandedPage] = useState<string | null>(null);

  const externalLinks = navLinks.filter((l) => !l.isPage);

  const addPage = () => {
    const id = `page-${Date.now()}`;
    const slug = "new-page";
    const title = "New Page";
    onChange([...pages, { id, title, slug, sections: [] }]);
    onNavLinksChange([...navLinks, { label: title, href: slug, isPage: true }]);
    setExpandedPage(id);
  };

  const removePage = (id: string) => {
    const page = pages.find((p) => p.id === id);
    onChange(pages.filter((p) => p.id !== id));
    if (page) {
      onNavLinksChange(
        navLinks.filter((l) => !(l.isPage && l.href === page.slug))
      );
    }
  };

  const updatePage = (id: string, fields: Partial<StorefrontPage>) => {
    const page = pages.find((p) => p.id === id);
    onChange(pages.map((p) => (p.id === id ? { ...p, ...fields } : p)));
    if (page && (fields.title || fields.slug)) {
      const oldSlug = page.slug;
      const newSlug = fields.slug || oldSlug;
      const newTitle = fields.title || page.title;
      onNavLinksChange(
        navLinks.map((l) =>
          l.isPage && l.href === oldSlug
            ? { ...l, label: newTitle, href: newSlug }
            : l
        )
      );
    }
  };

  const updatePageSections = (
    pageId: string,
    sections: StorefrontSection[]
  ) => {
    onChange(pages.map((p) => (p.id === pageId ? { ...p, sections } : p)));
  };

  const addSectionToPage = (pageId: string, type: StorefrontSectionType) => {
    const page = pages.find((p) => p.id === pageId);
    if (!page) return;
    const newSection: StorefrontSection = {
      id: `section-${Date.now()}`,
      type,
      enabled: true,
    };
    updatePageSections(pageId, [...page.sections, newSection]);
  };

  const addExternalLink = () => {
    onNavLinksChange([...navLinks, { label: "", href: "" }]);
  };

  const updateExternalLink = (
    oldIdx: number,
    fields: Partial<StorefrontNavLink>
  ) => {
    let extCount = 0;
    onNavLinksChange(
      navLinks.map((l) => {
        if (!l.isPage) {
          if (extCount === oldIdx) {
            extCount++;
            return { ...l, ...fields };
          }
          extCount++;
        }
        return l;
      })
    );
  };

  const removeExternalLink = (extIdx: number) => {
    let extCount = 0;
    onNavLinksChange(
      navLinks.filter((l) => {
        if (!l.isPage) {
          if (extCount === extIdx) {
            extCount++;
            return false;
          }
          extCount++;
        }
        return true;
      })
    );
  };

  return (
    <div className="space-y-4">
      <label className="block text-base font-bold text-black">Pages</label>
      <p className="text-sm text-gray-500">
        Create pages for your storefront. Each page gets its own URL, sections,
        and a link in the navigation bar.
      </p>

      {pages.map((page) => (
        <div
          key={page.id}
          className="rounded-lg border-2 border-gray-200 bg-gray-50"
        >
          <div className="flex items-center justify-between px-4 py-3">
            <button
              type="button"
              onClick={() =>
                setExpandedPage(expandedPage === page.id ? null : page.id)
              }
              className="flex items-center gap-2 text-sm font-bold text-black"
            >
              <span className="text-xs">
                {expandedPage === page.id ? "▾" : "▸"}
              </span>
              {page.title}
              <span className="font-normal text-gray-400">/{page.slug}</span>
            </button>
            <button
              type="button"
              onClick={() => removePage(page.id)}
              className="text-xs text-red-500 hover:text-red-700"
            >
              Remove
            </button>
          </div>

          {expandedPage === page.id && (
            <div className="space-y-4 border-t border-gray-200 px-4 py-4">
              <div className="flex gap-3">
                <Input
                  label="Page Title"
                  classNames={{ inputWrapper: inputWrapperClass }}
                  variant="bordered"
                  value={page.title}
                  onChange={(e) =>
                    updatePage(page.id, { title: e.target.value })
                  }
                  className="flex-1"
                />
                <Input
                  label="URL Slug"
                  classNames={{ inputWrapper: inputWrapperClass }}
                  variant="bordered"
                  value={page.slug}
                  onChange={(e) =>
                    updatePage(page.id, {
                      slug: e.target.value
                        .toLowerCase()
                        .replace(/[^a-z0-9-]/g, "-"),
                    })
                  }
                  className="flex-1"
                />
              </div>

              <div className="space-y-2">
                {page.sections.map((section, idx) => (
                  <SectionEditor
                    key={section.id}
                    section={section}
                    onChange={(updated) => {
                      const sections = [...page.sections];
                      sections[idx] = updated;
                      updatePageSections(page.id, sections);
                    }}
                    onRemove={() => {
                      updatePageSections(
                        page.id,
                        page.sections.filter((_, i) => i !== idx)
                      );
                    }}
                    onMoveUp={() => {
                      if (idx === 0) return;
                      const sections = [...page.sections];
                      [sections[idx - 1], sections[idx]] = [
                        sections[idx]!,
                        sections[idx - 1]!,
                      ];
                      updatePageSections(page.id, sections);
                    }}
                    onMoveDown={() => {
                      if (idx === page.sections.length - 1) return;
                      const sections = [...page.sections];
                      [sections[idx], sections[idx + 1]] = [
                        sections[idx + 1]!,
                        sections[idx]!,
                      ];
                      updatePageSections(page.id, sections);
                    }}
                    isFirst={idx === 0}
                    isLast={idx === page.sections.length - 1}
                    sellerProducts={sellerProducts}
                    shopPubkey={shopPubkey}
                  />
                ))}
              </div>

              <div className="flex flex-wrap gap-2">
                {SECTION_TYPES.map((st) => (
                  <button
                    key={st.type}
                    type="button"
                    onClick={() => addSectionToPage(page.id, st.type)}
                    className="rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-600 hover:border-black hover:text-black"
                  >
                    + {st.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}

      <button
        type="button"
        onClick={addPage}
        className="text-sm font-bold text-blue-600 hover:underline"
      >
        + Add Page
      </button>

      {externalLinks.length > 0 && (
        <div className="mt-4 space-y-2">
          <label className="block text-sm font-bold text-gray-600">
            External Links
          </label>
          {externalLinks.map((link, extIdx) => (
            <div key={extIdx} className="flex items-center gap-2">
              <Input
                classNames={{
                  inputWrapper:
                    "border-2 border-gray-300 rounded-lg bg-white shadow-none",
                  input: "!text-black",
                }}
                variant="bordered"
                value={link.label}
                onChange={(e) =>
                  updateExternalLink(extIdx, { label: e.target.value })
                }
                placeholder="Label"
                className="w-32"
              />
              <Input
                classNames={{
                  inputWrapper:
                    "border-2 border-gray-300 rounded-lg bg-white shadow-none",
                  input: "!text-black",
                }}
                variant="bordered"
                value={link.href}
                onChange={(e) =>
                  updateExternalLink(extIdx, { href: e.target.value })
                }
                placeholder="URL (e.g. https://...)"
                className="flex-1"
              />
              <button
                type="button"
                onClick={() => removeExternalLink(extIdx)}
                className="text-xs text-red-500"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={addExternalLink}
        className="text-sm text-gray-500 hover:text-black hover:underline"
      >
        + Add External Link
      </button>
    </div>
  );
}
