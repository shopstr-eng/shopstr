import { Switch } from "@heroui/react";
import { useRouter } from "next/router";

const MilkMarketSwitch = ({
  wotFilter,
  setWotFilter,
}: {
  wotFilter: boolean;
  setWotFilter: (value: boolean) => void;
}) => {
  const router = useRouter();

  const handleTrustClick = () => {
    router.push("/settings/preferences");
  };

  return (
    <div className="flex items-center gap-2 p-2">
      <Switch
        size="lg"
        isSelected={wotFilter}
        onValueChange={setWotFilter}
        classNames={{
          wrapper: "bg-gray-300 group-data-[selected=true]:bg-primary-yellow",
          thumb:
            "bg-white border-2 border-black group-data-[selected=true]:border-black shadow-neo",
        }}
      />
      <span>
        <p
          className="cursor-pointer font-bold whitespace-nowrap text-black hover:underline"
          onClick={handleTrustClick}
        >
          Trust
        </p>
      </span>
    </div>
  );
};

export default MilkMarketSwitch;
