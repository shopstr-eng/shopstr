import { Switch } from "@nextui-org/react";
import { useRouter } from "next/router";
import { useTheme } from "next-themes";

const ShopstrSwitch = ({
  wotFilter,
  setWotFilter,
}: {
  wotFilter: boolean;
  setWotFilter: (value: boolean) => void;
}) => {
  const router = useRouter();
  const { theme } = useTheme();

  const handleTrustClick = () => {
    router.push("/settings/preferences");
  };

  return (
    <div className="flex items-center p-2">
      <Switch
        size={"lg"}
        color={theme === "dark" ? "warning" : "secondary"}
        onClick={() => {
          setWotFilter(!wotFilter);
        }}
      />
      <span>
        <p
          className="text-light-text hover:underline dark:text-dark-text"
          onClick={handleTrustClick}
        >
          Trust
        </p>
      </span>
    </div>
  );
};

export default ShopstrSwitch;
