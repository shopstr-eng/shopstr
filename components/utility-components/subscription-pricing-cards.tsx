import { Select, SelectItem } from "@nextui-org/react";
import { formatWithCommas } from "./display-monetary-info";

export type SubscriptionFrequencyOption =
  | "weekly"
  | "every_2_weeks"
  | "monthly"
  | "every_2_months"
  | "quarterly";

const FREQUENCY_LABELS: Record<string, string> = {
  weekly: "Weekly",
  every_2_weeks: "Every 2 Weeks",
  monthly: "Monthly",
  every_2_months: "Every 2 Months",
  quarterly: "Quarterly",
};

interface SubscriptionPricingCardsProps {
  basePrice: number;
  currency: string;
  discountPercent: number;
  frequencies: string[];
  selectedFrequency: string;
  onFrequencyChange: (frequency: string) => void;
  isSubscription: boolean;
  onSelectionChange: (isSubscription: boolean) => void;
}

export default function SubscriptionPricingCards({
  basePrice,
  currency,
  discountPercent,
  frequencies,
  selectedFrequency,
  onFrequencyChange,
  isSubscription,
  onSelectionChange,
}: SubscriptionPricingCardsProps) {
  const discountAmount =
    Math.ceil(((basePrice * discountPercent) / 100) * 100) / 100;
  const subscriptionPrice = basePrice - discountAmount;
  const savingsFormatted = formatWithCommas(discountAmount, currency);
  const subscriptionFormatted = formatWithCommas(subscriptionPrice, currency);
  const regularFormatted = formatWithCommas(basePrice, currency);

  return (
    <div className="flex w-full flex-col gap-3">
      <div
        onClick={() => onSelectionChange(true)}
        className={`relative cursor-pointer rounded-md border-2 p-4 transition-transform hover:-translate-y-0.5 active:translate-y-0.5 ${
          isSubscription
            ? "border-black bg-primary-yellow shadow-neo"
            : "border-gray-300 bg-white"
        }`}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div
              className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                isSubscription ? "border-black bg-black" : "border-gray-400"
              }`}
            >
              {isSubscription && (
                <div className="h-2 w-2 rounded-full bg-primary-yellow" />
              )}
            </div>
            <span className="text-lg font-bold text-black">
              Subscribe & Save
            </span>
          </div>
          <span className="rounded-md border-2 border-black bg-green-400 px-2 py-0.5 text-xs font-bold text-black shadow-neo">
            {discountPercent}% OFF
          </span>
        </div>
        <div className="ml-7 mt-2">
          <p className="text-2xl font-bold text-black">
            {subscriptionFormatted}
          </p>
          <p className="text-sm text-gray-600">
            You save {savingsFormatted} per delivery
          </p>
          {isSubscription && frequencies.length > 0 && (
            <div className="mt-3">
              <Select
                variant="bordered"
                aria-label="Delivery Frequency"
                label={
                  <span className="font-semibold text-black">
                    Delivery Frequency
                  </span>
                }
                labelPlacement="outside"
                placeholder="Select frequency"
                selectedKeys={
                  selectedFrequency ? new Set([selectedFrequency]) : new Set()
                }
                onSelectionChange={(keys) => {
                  const key = Array.from(keys)[0] as string;
                  if (key) onFrequencyChange(key);
                }}
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
                onClick={(e) => e.stopPropagation()}
              >
                {frequencies.map((freq) => (
                  <SelectItem
                    key={freq}
                    value={freq}
                    className="font-semibold text-black hover:bg-primary-yellow data-[hover=true]:bg-primary-yellow data-[selected=true]:bg-primary-yellow"
                  >
                    {FREQUENCY_LABELS[freq] || freq}
                  </SelectItem>
                ))}
              </Select>
            </div>
          )}
        </div>
      </div>

      <div
        onClick={() => onSelectionChange(false)}
        className={`cursor-pointer rounded-md border-2 p-4 transition-transform hover:-translate-y-0.5 active:translate-y-0.5 ${
          !isSubscription
            ? "border-black bg-white shadow-neo"
            : "border-gray-300 bg-white"
        }`}
      >
        <div className="flex items-center gap-2">
          <div
            className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${
              !isSubscription ? "border-black bg-black" : "border-gray-400"
            }`}
          >
            {!isSubscription && (
              <div className="h-2 w-2 rounded-full bg-white" />
            )}
          </div>
          <span className="text-lg font-bold text-black">
            One-Time Purchase
          </span>
        </div>
        <div className="ml-7 mt-2">
          <p className="text-2xl font-bold text-black">{regularFormatted}</p>
        </div>
      </div>
    </div>
  );
}
