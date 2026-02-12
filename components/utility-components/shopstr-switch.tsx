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
    <div className="flex items-center gap-3">
      <Switch
        size={"lg"}
        color={theme === "dark" ? "warning" : "secondary"}
        onClick={() => {
          setWotFilter(!wotFilter);
        }}
      />
      <span
        className="cursor-pointer text-xs font-bold uppercase tracking-wider text-zinc-500 transition-colors hover:text-zinc-300"
        onClick={handleTrustClick}
      >
        Trust
      </span>
    </div>
  );
};

export default ShopstrSwitch;
