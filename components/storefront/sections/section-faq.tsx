import { StorefrontSection, StorefrontColorScheme } from "@/utils/types/types";
import { useState } from "react";

interface SectionFaqProps {
  section: StorefrontSection;
  colors: StorefrontColorScheme;
}

export default function SectionFaq({ section, colors }: SectionFaqProps) {
  const items = section.items || [];
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (items.length === 0) return null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-16 md:px-6">
      {section.heading && (
        <h2
          className="font-heading mb-8 text-center text-3xl font-bold"
          style={{ color: "var(--sf-text)" }}
        >
          {section.heading}
        </h2>
      )}
      <div className="space-y-3">
        {items.map((item, idx) => (
          <div
            key={idx}
            className="overflow-hidden rounded-lg border"
            style={{ borderColor: colors.primary + "22" }}
          >
            <button
              className="flex w-full items-center justify-between px-6 py-4 text-left font-bold transition-colors"
              style={{
                backgroundColor:
                  openIndex === idx ? colors.primary + "11" : "transparent",
              }}
              onClick={() => setOpenIndex(openIndex === idx ? null : idx)}
            >
              <span className="font-heading">{item.question}</span>
              <span
                className="ml-4 text-xl transition-transform"
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
              <div
                className="font-body border-t px-6 py-4 opacity-80"
                style={{ borderColor: colors.primary + "11" }}
              >
                {item.answer}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
