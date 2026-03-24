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
    <div className="w-full">
      <Select
        variant="bordered"
        aria-label="Volume"
        label={
          <span className="font-semibold text-black">Select Volume *</span>
        }
        labelPlacement="outside"
        placeholder="Choose a volume"
        selectedKeys={selectedVolume ? new Set([selectedVolume]) : new Set()}
        onSelectionChange={(keys) => {
          const selectedKey = Array.from(keys)[0] as string;
          if (selectedKey) {
            onVolumeChange(selectedKey);
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
          {volumes.map((volume) => {
            const price = volumePrices.get(volume) || 0;
            return (
              <SelectItem
                key={volume}
                value={volume}
                textValue={`${volume} - ${price} ${currency}`}
                className="font-semibold text-black hover:bg-primary-yellow data-[hover=true]:bg-primary-yellow data-[selected=true]:bg-primary-yellow"
              >
                {volume} - {price} {currency}
              </SelectItem>
            );
          })}
        </SelectSection>
      </Select>
    </div>
  );
}
