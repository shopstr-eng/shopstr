import { Select, SelectItem, SelectSection } from "@nextui-org/react";

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
    <div className="w-full">
      <Select
        variant="bordered"
        aria-label="Weight"
        label={
          <span className="font-semibold text-black">Select Weight *</span>
        }
        labelPlacement="outside"
        placeholder="Choose a weight"
        selectedKeys={selectedWeight ? new Set([selectedWeight]) : new Set()}
        onSelectionChange={(keys) => {
          const selectedKey = Array.from(keys)[0] as string;
          if (selectedKey) {
            onWeightChange(selectedKey);
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
          {weights.map((weight) => {
            const price = weightPrices.get(weight) || 0;
            return (
              <SelectItem
                key={weight}
                value={weight}
                textValue={`${weight} - ${price} ${currency}`}
                className="font-semibold text-black hover:bg-primary-yellow data-[hover=true]:bg-primary-yellow data-[selected=true]:bg-primary-yellow"
              >
                {weight} - {price} {currency}
              </SelectItem>
            );
          })}
        </SelectSection>
      </Select>
    </div>
  );
}
