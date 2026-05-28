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
      <style jsx>{`
        .comparison-wrap {
          container-type: inline-size;
        }
        .comparison-wrap :global(table.comparison-table) {
          font-size: 1rem;
        }
        .comparison-wrap :global(table.comparison-table th),
        .comparison-wrap :global(table.comparison-table td),
        .comparison-wrap :global(table.comparison-table th *),
        .comparison-wrap :global(table.comparison-table td *) {
          word-break: normal !important;
          overflow-wrap: normal !important;
          hyphens: none !important;
        }
        @container (max-width: 720px) {
          .comparison-wrap :global(table.comparison-table) {
            font-size: 0.875rem;
          }
          .comparison-wrap :global(table.comparison-table th),
          .comparison-wrap :global(table.comparison-table td) {
            padding-left: 0.75rem;
            padding-right: 0.75rem;
          }
        }
        @container (max-width: 560px) {
          .comparison-wrap :global(table.comparison-table) {
            font-size: 0.75rem;
          }
          .comparison-wrap :global(table.comparison-table th),
          .comparison-wrap :global(table.comparison-table td) {
            padding-left: 0.5rem;
            padding-right: 0.5rem;
          }
        }
        @container (max-width: 420px) {
          .comparison-wrap :global(table.comparison-table) {
            font-size: 0.6875rem;
          }
          .comparison-wrap :global(table.comparison-table th),
          .comparison-wrap :global(table.comparison-table td) {
            padding-left: 0.375rem;
            padding-right: 0.375rem;
          }
        }
        @container (max-width: 340px) {
          .comparison-wrap :global(table.comparison-table) {
            font-size: 0.625rem;
          }
        }
      `}</style>
      {section.heading && (
        <FormattedText
          text={section.heading}
          as="h2"
          className="font-heading mb-8 text-center text-3xl font-bold"
          style={{ color: "var(--sf-text)" }}
        />
      )}
      <div className="comparison-wrap">
        <div className="overflow-x-auto">
          <table className="comparison-table w-full border-collapse">
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
    </div>
  );
}
