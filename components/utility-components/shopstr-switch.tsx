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
    <>
      {theme === "dark" ? (
        <Switch size={"lg"} color="warning" onClick={() => setWotFilter(!wotFilter)}>
          WoT
        </Switch>
      ) : (
        <Switch size={"lg"} color="secondary" onClick={() => setWotFilter(!wotFilter)}>
          WoT
        </Switch>
      )}
    </>
  );
}

export default ShopstrSwitch;
