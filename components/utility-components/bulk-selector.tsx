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
    <div className="w-full">
      <Select
        variant="bordered"
        aria-label="Bulk Pricing"
        label={
          <span className="font-semibold text-black">
            Select Bundle Size{isRequired ? " *" : ""}
          </span>
        }
        labelPlacement="outside"
        placeholder="Choose a bundle size"
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
        className="w-full"
        classNames={{
          trigger:
            "border-2 border-black rounded-md shadow-neo bg-white hover:bg-gray-50 data-[hover=true]:bg-gray-50",
          value: "text-black font-semibold",
          label: "text-black font-semibold",
          listboxWrapper: "border-2 border-black rounded-md",
          popoverContent:
            "border-2 border-black rounded-md shadow-neo bg-white",
        }}
      >
        <SelectSection>
          {[
            <SelectItem
              key="1"
              value="1"
              textValue={`1 unit - ${basePrice} ${currency}`}
              className="font-semibold text-black hover:bg-primary-yellow data-[hover=true]:bg-primary-yellow data-[selected=true]:bg-primary-yellow"
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
                  className="font-semibold text-black hover:bg-primary-yellow data-[hover=true]:bg-primary-yellow data-[selected=true]:bg-primary-yellow"
                >
                  <div className="flex flex-col">
                    <span>
                      {units} units - {price} {currency}
                    </span>
                    <span className="text-tiny text-gray-500">
                      {perUnit} {currency}/unit
                      {savings > 0 && (
                        <span className="ml-1 font-semibold text-green-600">
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
    </div>
  );
}
