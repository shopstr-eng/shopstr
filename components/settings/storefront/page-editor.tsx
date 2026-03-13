import { Input } from "@nextui-org/react";
import {
  StorefrontPage,
  StorefrontSection,
  StorefrontSectionType,
} from "@/utils/types/types";
import SectionEditor from "./section-editor";
import { useState } from "react";

interface PageEditorProps {
  pages: StorefrontPage[];
  onChange: (pages: StorefrontPage[]) => void;
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

export default function PageEditor({ pages, onChange }: PageEditorProps) {
  const [expandedPage, setExpandedPage] = useState<string | null>(null);

  const addPage = () => {
    const id = `page-${Date.now()}`;
    onChange([
      ...pages,
      { id, title: "New Page", slug: "new-page", sections: [] },
    ]);
    setExpandedPage(id);
  };

  const removePage = (id: string) => {
    onChange(pages.filter((p) => p.id !== id));
  };

  const updatePage = (id: string, fields: Partial<StorefrontPage>) => {
    onChange(pages.map((p) => (p.id === id ? { ...p, ...fields } : p)));
  };

  const updatePageSections = (
    pageId: string,
    sections: StorefrontSection[]
  ) => {
    updatePage(pageId, { sections });
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

  return (
    <div className="space-y-4">
      <label className="block text-base font-bold text-black">Pages</label>
      <p className="text-sm text-gray-500">
        Create additional pages for your storefront (e.g. About, Contact). Each
        page gets its own URL and can have its own sections.
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
    </div>
  );
}
