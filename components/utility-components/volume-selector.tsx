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
      label="SELECT VOLUME"
      labelPlacement="outside"
      selectedKeys={selectedVolume ? new Set([selectedVolume]) : new Set()}
      onSelectionChange={(keys) => {
        const selectedKey = Array.from(keys)[0] as string;
        if (selectedKey) {
          onVolumeChange(selectedKey);
        }
      }}
      classNames={{
        label: "text-zinc-500 font-bold uppercase tracking-wider text-xs",
        trigger:
          "bg-[#111] border-zinc-700 data-[hover=true]:border-zinc-500 data-[focus=true]:border-yellow-400 rounded-xl",
        value: "text-white font-bold text-base",
        popoverContent: "bg-[#161616] border border-zinc-800 rounded-xl p-1",
      }}
      isRequired={isRequired}
      className="mb-4 w-full md:w-1/2"
    >
      <SelectSection>
        {volumes.map((volume) => {
          const price = volumePrices.get(volume) || 0;
          return (
            <SelectItem
              key={volume}
              value={volume}
              textValue={`${volume} - ${price} ${currency}`}
              className="text-zinc-300 data-[hover=true]:bg-zinc-800 data-[hover=true]:text-white data-[selectable=true]:focus:bg-zinc-800 rounded-lg"
            >
              {volume} - {price} {currency}
            </SelectItem>
          );
        })}
      </SelectSection>
    </Select>
  );
}
