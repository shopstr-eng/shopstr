import { Switch } from "@nextui-org/react";
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
    <div className="flex items-center p-2">
      <Switch
        size={"lg"}
        color={"warning"}
        onClick={() => {
          setWotFilter(!wotFilter);
        }}
      />
      <span>
        <p
          className="text-light-text hover:underline"
          onClick={handleTrustClick}
        >
          Trust
        </p>
      </span>
    </div>
  );
};

export default MilkMarketSwitch;
