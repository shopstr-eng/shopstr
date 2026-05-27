import { StorefrontSection, StorefrontColorScheme } from "@/utils/types/types";
import { useState } from "react";
import FormattedText from "../formatted-text";

interface SectionFaqProps {
  section: StorefrontSection;
  colors: StorefrontColorScheme;
}

export default function SectionFaq({ section, colors }: SectionFaqProps) {
  const items = section.items || [];
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (items.length === 0) return null;

  return (
    <div className="mx-auto w-full max-w-3xl min-w-0 overflow-hidden px-4 py-16 md:px-6">
      {section.heading && (
        <FormattedText
          text={section.heading}
          as="h2"
          className="font-heading mb-8 text-center text-3xl font-bold break-words"
          style={{ color: "var(--sf-text)", overflowWrap: "anywhere" }}
        />
      )}
      <div className="space-y-3">
        {items.map((item, idx) => (
          <div
            key={idx}
            className="w-full overflow-hidden rounded-lg border"
            style={{ borderColor: colors.primary + "22" }}
          >
            <button
              className="grid w-full min-w-0 items-center gap-3 px-4 py-4 text-left font-bold transition-colors sm:gap-4 sm:px-6"
              style={{
                backgroundColor:
                  openIndex === idx ? colors.primary + "11" : "transparent",
                gridTemplateColumns: "minmax(0, 1fr) auto",
              }}
              onClick={() => setOpenIndex(openIndex === idx ? null : idx)}
            >
              <FormattedText
                text={item.question || ""}
                as="span"
                className="font-heading block break-words"
                style={{
                  overflowWrap: "anywhere",
                  minWidth: 0,
                  maxWidth: "100%",
                }}
              />
              <span
                className="flex-shrink-0 text-xl transition-transform"
                style={{
                  transform:
                    openIndex === idx ? "rotate(45deg)" : "rotate(0deg)",
                  color: colors.accent,
                }}
              >
                +
              </span>
            </button>
            {openIndex === idx && (
              <FormattedText
                text={item.answer || ""}
                as="div"
                className="font-body block border-t px-4 py-4 break-words whitespace-pre-line opacity-80 sm:px-6"
                style={{
                  borderColor: colors.primary + "11",
                  overflowWrap: "anywhere",
                  minWidth: 0,
                  maxWidth: "100%",
                }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
