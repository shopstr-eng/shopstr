import { Spinner } from "@nextui-org/react";
import { useTheme } from "next-themes";

export default function ShopstrSpinner() {
  const { theme } = useTheme();
  return (
    <>
      {theme === "dark" ? (
        <Spinner size={"lg"} color="warning" />
      ) : (
        <Spinner size={"lg"} color="secondary" />
      )}
    </>
  );
}
