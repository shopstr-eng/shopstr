import { Switch } from "@heroui/react";
import { useTheme } from "next-themes";
import { UIContext } from "@/utils/context/context";
import { useContext } from "react";
import { useRouter } from "next/router";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";

const ShopstrSwitch = ({
  wotFilter,
  setWotFilter,
}: {
  wotFilter: boolean;
  setWotFilter: (value: boolean) => void;
}) => {
  const { theme } = useTheme();
  const { setPreferencesModalOpen } = useContext(UIContext);
  const { isLoggedIn } = useContext(SignerContext);
  const router = useRouter();

  const handleTrustClick = () => {
    if (isLoggedIn) {
      setPreferencesModalOpen(true);
      return;
    }

    router.push("/settings/preferences");
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
