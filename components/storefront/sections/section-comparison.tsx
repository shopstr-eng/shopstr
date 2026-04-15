import { StorefrontSection, StorefrontColorScheme } from "@/utils/types/types";
import FormattedText from "../formatted-text";

interface SectionComparisonProps {
  section: StorefrontSection;
  colors: StorefrontColorScheme;
}

export default function SectionComparison({
  section,
  colors,
}: SectionComparisonProps) {
  const features = section.comparisonFeatures || [];
  const columns = section.comparisonColumns || [];

  if (columns.length === 0 || features.length === 0) return null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-16 md:px-6">
      {section.heading && (
        <FormattedText
          text={section.heading}
          as="h2"
          className="font-heading mb-8 text-center text-3xl font-bold"
          style={{ color: "var(--sf-text)" }}
        />
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th
                className="font-heading border-b-2 px-4 py-3 text-left"
                style={{ borderColor: colors.primary + "33" }}
              />
              {columns.map((col, idx) => (
                <th
                  key={idx}
                  className="font-heading border-b-2 px-4 py-3 text-center font-bold"
                  style={{ borderColor: colors.primary + "33" }}
                >
                  {col.heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {features.map((feature, rowIdx) => (
              <tr key={rowIdx}>
                <td
                  className="font-body border-b px-4 py-3 font-medium"
                  style={{ borderColor: colors.primary + "11" }}
                >
                  <FormattedText text={feature} />
                </td>
                {columns.map((col, colIdx) => (
                  <td
                    key={colIdx}
                    className="font-body border-b px-4 py-3 text-center"
                    style={{ borderColor: colors.primary + "11" }}
                  >
                    <FormattedText text={col.values[rowIdx] || "—"} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
