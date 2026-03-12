import { StorefrontSection, StorefrontColorScheme } from "@/utils/types/types";

interface SectionContactProps {
  section: StorefrontSection;
  colors: StorefrontColorScheme;
}

export default function SectionContact({
  section,
  colors,
}: SectionContactProps) {
  return (
    <div className="mx-auto max-w-4xl px-4 py-16 md:px-6">
      {section.heading && (
        <h2
          className="font-heading mb-4 text-center text-3xl font-bold"
          style={{ color: "var(--sf-text)" }}
        >
          {section.heading}
        </h2>
      )}
      {section.body && (
        <p className="font-body mx-auto mb-8 max-w-xl text-center text-lg opacity-70">
          {section.body}
        </p>
      )}
      <div
        className="mx-auto max-w-md rounded-xl border p-8"
        style={{ borderColor: colors.primary + "22" }}
      >
        <div className="space-y-4">
          {section.email && (
            <div className="flex items-center gap-3">
              <span style={{ color: colors.accent }} className="text-xl">
                ✉
              </span>
              <a
                href={`mailto:${section.email}`}
                className="font-body underline"
                style={{ color: colors.accent }}
              >
                {section.email}
              </a>
            </div>
          )}
          {section.phone && (
            <div className="flex items-center gap-3">
              <span style={{ color: colors.accent }} className="text-xl">
                ☏
              </span>
              <a
                href={`tel:${section.phone}`}
                className="font-body"
                style={{ color: colors.accent }}
              >
                {section.phone}
              </a>
            </div>
          )}
          {section.address && (
            <div className="flex items-start gap-3">
              <span style={{ color: colors.accent }} className="mt-1 text-xl">
                ⌂
              </span>
              <p className="font-body whitespace-pre-line opacity-80">
                {section.address}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
