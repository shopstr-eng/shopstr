import { Switch } from "@nextui-org/react";
import { useTheme } from "next-themes";

const ShopstrSwitch = ({
    wotFilter,
    setWotFilter,
  }: {
    wotFilter: boolean,
    setWotFilter: (value: boolean) => void,
  }) => {
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex items-center p-2">
      <Switch size={"lg"} color={theme === "dark" ? "warning" : "secondary"} onClick={() => setWotFilter(!wotFilter)} />
      <span className=" text-light-text dark:text-dark-text">Trust</span>
    </div>
  );
}

export default ShopstrSwitch;
