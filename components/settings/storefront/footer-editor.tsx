import { useState } from "react";
import { Input, Select, SelectItem, Textarea } from "@nextui-org/react";
import {
  StorefrontFooter,
  StorefrontSocialLink,
  StorefrontNavLink,
  StorefrontPolicies,
  StorefrontPolicy,
} from "@/utils/types/types";
import { POLICY_LABELS, getDefaultPolicies } from "@/utils/storefront-policies";

interface FooterEditorProps {
  footer: StorefrontFooter;
  onChange: (footer: StorefrontFooter) => void;
  shopName?: string;
}

const SOCIAL_PLATFORMS = [
  "instagram",
  "x",
  "facebook",
  "youtube",
  "tiktok",
  "telegram",
  "website",
  "email",
  "other",
] as const;

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

const POLICY_KEYS: (keyof StorefrontPolicies)[] = [
  "returnPolicy",
  "termsOfService",
  "privacyPolicy",
  "cancellationPolicy",
];

export default function FooterEditor({
  footer,
  onChange,
  shopName,
}: FooterEditorProps) {
  const socialLinks = footer.socialLinks || [];
  const navLinks = footer.navLinks || [];
  const [expandedPolicy, setExpandedPolicy] = useState<string | null>(null);

  const policies = footer.policies || {};
  const defaults = getDefaultPolicies(shopName || "");

  const getPolicy = (key: keyof StorefrontPolicies): StorefrontPolicy => {
    return policies[key] || defaults[key]!;
  };

  const updatePolicy = (
    key: keyof StorefrontPolicies,
    updates: Partial<StorefrontPolicy>
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
    const defaultPolicy = defaults[key]!;
    onChange({
      ...footer,
      policies: {
        ...policies,
        [key]: { ...defaultPolicy },
      },
    });
  };

  const updateSocial = (idx: number, fields: Partial<StorefrontSocialLink>) => {
    const updated = [...socialLinks];
    updated[idx] = { ...updated[idx]!, ...fields };
    onChange({ ...footer, socialLinks: updated });
  };

  const addSocial = () => {
    onChange({
      ...footer,
      socialLinks: [...socialLinks, { platform: "instagram", url: "" }],
    });
  };

  const removeSocial = (idx: number) => {
    onChange({
      ...footer,
      socialLinks: socialLinks.filter((_, i) => i !== idx),
    });
  };

  const updateNav = (idx: number, fields: Partial<StorefrontNavLink>) => {
    const updated = [...navLinks];
    updated[idx] = { ...updated[idx]!, ...fields };
    onChange({ ...footer, navLinks: updated });
  };

  const addNav = () => {
    onChange({
      ...footer,
      navLinks: [...navLinks, { label: "", href: "" }],
    });
  };

  const removeNav = (idx: number) => {
    onChange({
      ...footer,
      navLinks: navLinks.filter((_, i) => i !== idx),
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <Input
          label="Footer Text"
          classNames={{ inputWrapper: inputWrapperClass }}
          variant="bordered"
          value={footer.text || ""}
          onChange={(e) => onChange({ ...footer, text: e.target.value })}
          placeholder="e.g. Fresh from our farm to your table"
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-bold text-gray-700">
          Store Policies
        </label>
        <p className="mb-3 text-xs text-gray-500">
          These policies are shown as links in your storefront footer. Each
          opens its own page. Toggle them on or off, and edit the content to
          match your business.
        </p>
        <div className="space-y-2">
          {POLICY_KEYS.map((key) => {
            const policy = getPolicy(key);
            const isExpanded = expandedPolicy === key;
            return (
              <div
                key={key}
                className="rounded-lg border-2 border-gray-200 bg-gray-50"
              >
                <div className="flex items-center gap-3 p-3">
                  <input
                    type="checkbox"
                    checked={policy.enabled}
                    onChange={(e) =>
                      updatePolicy(key, { enabled: e.target.checked })
                    }
                    className="h-4 w-4"
                  />
                  <span className="flex-1 text-sm font-medium text-black">
                    {POLICY_LABELS[key]}
                  </span>
                  <button
                    type="button"
                    onClick={() => setExpandedPolicy(isExpanded ? null : key)}
                    className="text-xs font-bold text-blue-600 hover:underline"
                  >
                    {isExpanded ? "Collapse" : "Edit"}
                  </button>
                </div>
                {isExpanded && (
                  <div className="border-t border-gray-200 p-3">
                    <Textarea
                      classNames={{
                        inputWrapper: inputWrapperClass,
                        input: "text-sm",
                      }}
                      variant="bordered"
                      value={policy.content}
                      onChange={(e) =>
                        updatePolicy(key, { content: e.target.value })
                      }
                      minRows={10}
                      maxRows={30}
                      placeholder="Enter your policy content (Markdown supported)"
                    />
                    <div className="mt-2 flex items-center justify-between">
                      <p className="text-xs text-gray-400">
                        Supports Markdown formatting (headings, bold, lists)
                      </p>
                      <button
                        type="button"
                        onClick={() => resetPolicyToDefault(key)}
                        className="text-xs font-bold text-orange-600 hover:underline"
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
        <label className="mb-2 block text-sm font-bold text-gray-700">
          Social Links
        </label>
        <div className="space-y-2">
          {socialLinks.map((link, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <Select
                classNames={{
                  ...selectClassNames,
                  trigger: selectClassNames.trigger + " w-36",
                }}
                variant="bordered"
                selectedKeys={[link.platform]}
                onChange={(e) => {
                  if (e.target.value) {
                    updateSocial(idx, {
                      platform: e.target
                        .value as StorefrontSocialLink["platform"],
                    });
                  }
                }}
                aria-label="Platform"
                className="w-36"
              >
                {SOCIAL_PLATFORMS.map((p) => (
                  <SelectItem
                    key={p}
                    value={p}
                    className="capitalize text-black"
                  >
                    {p}
                  </SelectItem>
                ))}
              </Select>
              <Input
                classNames={{ inputWrapper: inputWrapperClass }}
                variant="bordered"
                value={link.url}
                onChange={(e) => updateSocial(idx, { url: e.target.value })}
                placeholder="https://..."
                className="flex-1"
              />
              <button
                type="button"
                onClick={() => removeSocial(idx)}
                className="text-xs text-red-500"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addSocial}
          className="mt-2 text-sm font-bold text-blue-600 hover:underline"
        >
          + Add Social Link
        </button>
      </div>

      <div>
        <label className="mb-2 block text-sm font-bold text-gray-700">
          Footer Navigation Links
        </label>
        <div className="space-y-2">
          {navLinks.map((link, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <Input
                classNames={{ inputWrapper: inputWrapperClass }}
                variant="bordered"
                value={link.label}
                onChange={(e) => updateNav(idx, { label: e.target.value })}
                placeholder="Link label"
                className="w-40"
              />
              <Input
                classNames={{ inputWrapper: inputWrapperClass }}
                variant="bordered"
                value={link.href}
                onChange={(e) => updateNav(idx, { href: e.target.value })}
                placeholder="URL or page slug"
                className="flex-1"
              />
              <label className="flex items-center gap-1 whitespace-nowrap text-xs text-gray-500">
                <input
                  type="checkbox"
                  checked={link.isPage || false}
                  onChange={(e) => updateNav(idx, { isPage: e.target.checked })}
                />
                Page
              </label>
              <button
                type="button"
                onClick={() => removeNav(idx)}
                className="text-xs text-red-500"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addNav}
          className="mt-2 text-sm font-bold text-blue-600 hover:underline"
        >
          + Add Link
        </button>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={footer.showPoweredBy !== false}
          onChange={(e) =>
            onChange({ ...footer, showPoweredBy: e.target.checked })
          }
        />
        Show &quot;Powered by Milk Market&quot;
      </label>
    </div>
  );
}
