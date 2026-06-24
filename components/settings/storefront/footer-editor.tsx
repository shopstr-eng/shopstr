import { useState } from "react";
import { Input, Textarea } from "@heroui/react";
import {
  StorefrontFooter,
  StorefrontSocialLink,
  StorefrontPolicies,
} from "@/utils/types/types";
import {
  POLICY_LABELS,
  POLICY_KEYS,
  getDefaultPolicies,
} from "@/utils/storefront-policies";

const SOCIAL_PLATFORMS: StorefrontSocialLink["platform"][] = [
  "instagram",
  "x",
  "facebook",
  "youtube",
  "tiktok",
  "telegram",
  "website",
  "email",
  "other",
];

interface FooterEditorProps {
  footer: StorefrontFooter;
  onChange: (updated: StorefrontFooter) => void;
  shopName?: string;
}

export default function FooterEditor({
  footer,
  onChange,
  shopName,
}: FooterEditorProps) {
  const [expandedPolicy, setExpandedPolicy] = useState<string | null>(null);

  const update = (fields: Partial<StorefrontFooter>) =>
    onChange({ ...footer, ...fields });

  const policies = footer.policies || {};
  const defaults = getDefaultPolicies(shopName || "");

  const getPolicy = (key: keyof StorefrontPolicies) =>
    policies[key] || defaults[key]!;

  const updatePolicy = (
    key: keyof StorefrontPolicies,
    updates: Partial<{ enabled: boolean; content: string }>
  ) => {
    const current = getPolicy(key);
    onChange({
      ...footer,
      policies: {
        ...policies,
        [key]: { ...current, ...updates },
      },
    });
  };

  const resetPolicyToDefault = (key: keyof StorefrontPolicies) => {
    onChange({
      ...footer,
      policies: {
        ...policies,
        [key]: { ...defaults[key]! },
      },
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="text-light-text dark:text-dark-text mb-1 block text-xs font-medium">
          Footer Text
        </label>
        <Textarea
          variant="bordered"
          size="sm"
          minRows={2}
          placeholder="e.g. © 2025 My Shop. All rights reserved."
          value={footer.text || ""}
          onChange={(e) => update({ text: e.target.value })}
        />
      </div>

      <div>
        <label className="text-light-text dark:text-dark-text mb-1 flex items-center gap-2 text-xs font-medium">
          <input
            type="checkbox"
            checked={footer.showPoweredBy !== false}
            onChange={(e) => update({ showPoweredBy: e.target.checked })}
            className="h-3 w-3"
          />
          Show &quot;Powered by Shopstr&quot;
        </label>
      </div>

      <div>
        <label className="text-light-text dark:text-dark-text mb-2 block text-xs font-medium">
          Store Policies
        </label>
        <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
          Policy links shown in your storefront footer. Toggle each on or off
          and edit the text to match your shop.
        </p>
        <div className="space-y-2">
          {POLICY_KEYS.map((key) => {
            const policy = getPolicy(key);
            const isExpanded = expandedPolicy === key;
            return (
              <div
                key={key}
                className="rounded-lg border border-gray-400 dark:border-gray-500"
              >
                <div className="flex items-center gap-3 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={policy.enabled}
                    onChange={(e) =>
                      updatePolicy(key, { enabled: e.target.checked })
                    }
                    className="h-3.5 w-3.5"
                  />
                  <span className="text-light-text dark:text-dark-text flex-1 text-xs font-medium">
                    {POLICY_LABELS[key]}
                  </span>
                  <button
                    type="button"
                    onClick={() => setExpandedPolicy(isExpanded ? null : key)}
                    className="text-shopstr-purple dark:text-shopstr-yellow text-xs hover:underline"
                  >
                    {isExpanded ? "Collapse" : "Edit"}
                  </button>
                </div>
                {isExpanded && (
                  <div className="border-t border-gray-400 p-3 dark:border-gray-500">
                    <Textarea
                      variant="bordered"
                      size="sm"
                      value={policy.content}
                      onChange={(e) =>
                        updatePolicy(key, { content: e.target.value })
                      }
                      minRows={10}
                      maxRows={30}
                      placeholder="Enter your policy content (Markdown supported)"
                    />
                    <div className="mt-2 flex items-center justify-between">
                      <p className="text-xs text-gray-400 dark:text-gray-500">
                        Supports Markdown (headings, bold, lists)
                      </p>
                      <button
                        type="button"
                        onClick={() => resetPolicyToDefault(key)}
                        className="text-xs text-orange-500 hover:underline dark:text-orange-400"
                      >
                        Reset to Default
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <label className="text-light-text dark:text-dark-text mb-2 block text-xs font-medium">
          Social Links
        </label>
        <div className="space-y-2">
          {(footer.socialLinks || []).map((link, i) => (
            <div key={i} className="flex items-center gap-2">
              <select
                className="bg-light-fg text-light-text dark:bg-dark-fg dark:text-dark-text rounded border border-gray-300 p-1.5 text-xs dark:border-gray-600"
                value={link.platform}
                onChange={(e) => {
                  const links = [...(footer.socialLinks || [])];
                  links[i] = {
                    ...links[i]!,
                    platform: e.target
                      .value as StorefrontSocialLink["platform"],
                  };
                  update({ socialLinks: links });
                }}
              >
                {SOCIAL_PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </option>
                ))}
              </select>
              <Input
                variant="bordered"
                size="sm"
                placeholder="URL"
                value={link.url}
                onChange={(e) => {
                  const links = [...(footer.socialLinks || [])];
                  links[i] = { ...links[i]!, url: e.target.value };
                  update({ socialLinks: links });
                }}
                className="flex-1"
              />
              <button
                type="button"
                onClick={() => {
                  const links = (footer.socialLinks || []).filter(
                    (_, j) => j !== i
                  );
                  update({ socialLinks: links });
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
                socialLinks: [
                  ...(footer.socialLinks || []),
                  { platform: "instagram", url: "" },
                ],
              })
            }
            className="text-xs font-bold text-blue-600 hover:underline dark:text-blue-400"
          >
            + Add Social Link
          </button>
        </div>
      </div>

      <div>
        <label className="text-light-text dark:text-dark-text mb-2 block text-xs font-medium">
          Footer Nav Links
        </label>
        <div className="space-y-2">
          {(footer.navLinks || []).map((link, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                variant="bordered"
                size="sm"
                placeholder="Label"
                value={link.label}
                onChange={(e) => {
                  const links = [...(footer.navLinks || [])];
                  links[i] = { ...links[i]!, label: e.target.value };
                  update({ navLinks: links });
                }}
                className="w-32"
              />
              <Input
                variant="bordered"
                size="sm"
                placeholder="URL"
                value={link.href}
                onChange={(e) => {
                  const links = [...(footer.navLinks || [])];
                  links[i] = { ...links[i]!, href: e.target.value };
                  update({ navLinks: links });
                }}
                className="flex-1"
              />
              <button
                type="button"
                onClick={() => {
                  const links = (footer.navLinks || []).filter(
                    (_, j) => j !== i
                  );
                  update({ navLinks: links });
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
                navLinks: [...(footer.navLinks || []), { label: "", href: "" }],
              })
            }
            className="text-xs font-bold text-blue-600 hover:underline dark:text-blue-400"
          >
            + Add Footer Link
          </button>
        </div>
      </div>
    </div>
  );
}
