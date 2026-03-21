import { useState } from "react";
import { Input } from "@nextui-org/react";
import { ChevronRightIcon, TrashIcon } from "@heroicons/react/24/outline";
import { StorefrontPage } from "@/utils/types/types";

interface PageEditorProps {
  pages: StorefrontPage[];
  onChange: (pages: StorefrontPage[]) => void;
}

export default function PageEditor({ pages, onChange }: PageEditorProps) {
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
              <div className="space-y-3 border-t-2 border-gray-200 p-3 dark:border-dark-fg">
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
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  Page content sections can be added after saving, by visiting
                  your storefront settings again.
                </p>
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
