import { Select, SelectItem, SelectSection } from "@nextui-org/react";

interface BulkSelectorProps {
  bulkPrices: Map<number, number>;
  basePrice: number;
  currency: string;
  selectedBulkOption: string;
  onBulkChange: (bulk: string) => void;
  isRequired?: boolean;
}

export default function BulkSelector({
  bulkPrices,
  basePrice,
  currency,
  selectedBulkOption,
  onBulkChange,
  isRequired = false,
}: BulkSelectorProps) {
  if (!bulkPrices || bulkPrices.size === 0) return null;

  const sortedEntries = Array.from(bulkPrices.entries()).sort(
    (a, b) => a[0] - b[0]
  );

  const getSavingsPercent = (units: number, totalPrice: number): number => {
    if (basePrice <= 0 || units <= 0) return 0;
    const perUnitBulk = totalPrice / units;
    return Math.round(((basePrice - perUnitBulk) / basePrice) * 100);
  };

  return (
    <Select
      variant="bordered"
      aria-label="Bulk Pricing"
      label="Select Bundle Size"
      labelPlacement="inside"
      selectedKeys={
        selectedBulkOption ? new Set([selectedBulkOption]) : new Set(["1"])
      }
      onSelectionChange={(keys) => {
        const selectedKey = Array.from(keys)[0] as string;
        if (selectedKey) {
          onBulkChange(selectedKey);
        }
      }}
      isRequired={isRequired}
      className="mb-4 w-full text-light-text dark:text-dark-text md:w-1/2"
    >
      <SelectSection className="text-light-text dark:text-dark-text">
        {[
          <SelectItem
            key="1"
            value="1"
            textValue={`1 unit - ${basePrice} ${currency}`}
            className="text-light-text dark:text-dark-text"
          >
            1 unit - {basePrice} {currency}
          </SelectItem>,
          ...sortedEntries.map(([units, price]) => {
            const savings = getSavingsPercent(units, price);
            const perUnit = (price / units).toFixed(2);
            return (
              <SelectItem
                key={units.toString()}
                value={units.toString()}
                textValue={`${units} units - ${price} ${currency}${
                  savings > 0 ? ` (Save ${savings}%)` : ""
                }`}
                className="text-light-text dark:text-dark-text"
              >
                <div className="flex flex-col">
                  <span>
                    {units} units - {price} {currency}
                  </span>
                  <span className="text-tiny text-gray-500">
                    {perUnit} {currency}/unit
                    {savings > 0 && (
                      <span className="ml-1 font-semibold text-green-600 dark:text-green-400">
                        — Save {savings}%
                      </span>
                    )}
                  </span>
                </div>
              </SelectItem>
            );
          }),
        ]}
      </SelectSection>
    </Select>
  );
}
