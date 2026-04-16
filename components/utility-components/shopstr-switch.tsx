import { Switch } from "@heroui/react";
import { useTheme } from "next-themes";
import { UIContext } from "@/utils/context/context";
import { useContext } from "react";

const ShopstrSwitch = ({
  wotFilter,
  setWotFilter,
}: {
  wotFilter: boolean;
  setWotFilter: (value: boolean) => void;
}) => {
  const { theme } = useTheme();
  const { setPreferencesModalOpen } = useContext(UIContext);

  const handleTrustClick = () => {
    setPreferencesModalOpen(true);
  };

  return (
    <div className="flex items-center p-2">
      <Switch
        size={"lg"}
        color={theme === "dark" ? "warning" : "secondary"}
        isSelected={wotFilter}
        onValueChange={setWotFilter}
      />
      <span>
        <p
          className="text-light-text dark:text-dark-text hover:underline"
          onClick={handleTrustClick}
        >
          Trust
        </p>
      </span>
    </div>
  );
};

export default ShopstrSwitch;
