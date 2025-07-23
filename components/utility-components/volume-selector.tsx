import React from "react";
import { Select, SelectItem, SelectSection } from "@nextui-org/react";

interface VolumeSelectorProps {
  volumes: string[];
  volumePrices: Map<string, number>;
  currency: string;
  selectedVolume: string;
  onVolumeChange: (volume: string) => void;
  isRequired?: boolean;
}

export default function VolumeSelector({
  volumes,
  volumePrices,
  currency,
  selectedVolume,
  onVolumeChange,
  isRequired = false,
}: VolumeSelectorProps) {
  if (!volumes || volumes.length === 0) return null;

  return (
    <Select
      variant="bordered"
      aria-label="Volume"
      label="Select Volume"
      labelPlacement="inside"
      selectedKeys={selectedVolume ? new Set([selectedVolume]) : new Set()}
      onSelectionChange={(keys) => {
        const selectedKey = Array.from(keys)[0] as string;
        if (selectedKey) {
          onVolumeChange(selectedKey);
        }
      }}
      isRequired={isRequired}
      className="mb-4 w-full text-light-text dark:text-dark-text md:w-1/2"
    >
      <SelectSection className="text-light-text dark:text-dark-text">
        {volumes.map((volume) => {
          const price = volumePrices.get(volume) || 0;
          return (
            <SelectItem
              key={volume}
              value={volume}
              textValue={`${volume} - ${price} ${currency}`}
              className="text-light-text dark:text-dark-text"
            >
              {volume} - {price} {currency}
            </SelectItem>
          );
        })}
      </SelectSection>
    </Select>
  );
}
