import { Select, SelectItem, SelectSection } from "@heroui/react";

interface WeightSelectorProps {
  weights: string[];
  weightPrices: Map<string, number>;
  currency: string;
  selectedWeight: string;
  onWeightChange: (weight: string) => void;
  isRequired?: boolean;
}

export default function WeightSelector({
  weights,
  weightPrices,
  currency,
  selectedWeight,
  onWeightChange,
  isRequired = false,
}: WeightSelectorProps) {
  if (!weights || weights.length === 0) return null;

  return (
    <Select
      variant="bordered"
      aria-label="Weight"
      label="Select Weight"
      labelPlacement="inside"
      selectedKeys={selectedWeight ? new Set([selectedWeight]) : new Set()}
      onSelectionChange={(keys: any) => {
        const selectedKey = Array.from(keys)[0] as string;
        if (selectedKey) {
          onWeightChange(selectedKey);
        }
      }}
      isRequired={isRequired}
      className="text-light-text dark:text-dark-text mb-4 w-full md:w-1/2"
    >
      <SelectSection className="text-light-text dark:text-dark-text">
        {weights.map((weight) => {
          const price = weightPrices.get(weight) || 0;
          return (
            <SelectItem
              key={weight}
              textValue={`${weight} - ${price} ${currency}`}
              className="text-light-text dark:text-dark-text"
            >
              {weight} - {price} {currency}
            </SelectItem>
          );
        })}
      </SelectSection>
    </Select>
  );
}
