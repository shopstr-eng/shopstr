import { StorefrontSection, StorefrontColorScheme } from "@/utils/types/types";

interface SectionTextProps {
  section: StorefrontSection;
  colors?: StorefrontColorScheme;
}

export default function SectionText({ section }: SectionTextProps) {
  return (
    <div className="mx-auto max-w-4xl px-4 py-16 md:px-6">
      {section.heading && (
        <h2
          className="font-heading mb-6 text-center text-3xl font-bold"
          style={{ color: "var(--sf-text)" }}
        >
          {section.heading}
        </h2>
      )}
      {section.body && (
        <div
          className="font-body mx-auto max-w-2xl whitespace-pre-line text-center text-lg leading-relaxed opacity-80"
          style={{ color: "var(--sf-text)" }}
        >
          {section.body}
        </div>
      )}
    </div>
  );
}
