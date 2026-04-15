import { StorefrontSection, StorefrontColorScheme } from "@/utils/types/types";
import FormattedText from "../formatted-text";

interface SectionTextProps {
  section: StorefrontSection;
  colors: StorefrontColorScheme;
}

export default function SectionText({ section }: SectionTextProps) {
  return (
    <div className="mx-auto max-w-4xl px-4 py-16 md:px-6">
      {section.heading && (
        <FormattedText
          text={section.heading}
          as="h2"
          className="font-heading mb-6 text-3xl font-bold"
          style={{ color: "var(--sf-text)" }}
        />
      )}
      {section.body && (
        <FormattedText
          text={section.body}
          as="div"
          className="font-body text-lg leading-relaxed whitespace-pre-line opacity-80"
        />
      )}
    </div>
  );
}
