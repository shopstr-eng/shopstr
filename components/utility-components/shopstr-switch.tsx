import { Switch } from "@heroui/react";
import { useRouter } from "next/router";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

const ShopstrSwitch = ({
  wotFilter,
  setWotFilter,
}: {
  wotFilter: boolean;
  setWotFilter: (value: boolean) => void;
}) => {
  const router = useRouter();
  const { resolvedTheme, theme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const activeTheme = resolvedTheme ?? theme;
  const switchColor =
    mounted && activeTheme !== "dark" ? "secondary" : "warning";

  const handleTrustClick = () => {
    router.push("/settings/preferences");
  };

  return (
    <div className="flex items-center gap-3">
      <Switch
        size={"lg"}
        color={switchColor}
        isSelected={wotFilter}
        onValueChange={setWotFilter}
      />
      <span
        className="cursor-pointer text-xs font-bold tracking-wider text-zinc-500 uppercase transition-colors hover:text-zinc-300"
        onClick={handleTrustClick}
      >
        Trust
      </span>
    </div>
  );
};

export default ShopstrSwitch;
