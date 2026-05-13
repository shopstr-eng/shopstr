import { useState, useEffect, useContext } from "react";
import { Button } from "@heroui/react";
import { Slider } from "@heroui/react";
import { useTheme } from "next-themes";
import { FollowsContext } from "../../utils/context/context";
import { SHOPSTRBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";
import { storage, STORAGE_KEYS } from "@/utils/storage";

const ShopstrSlider = () => {
  const { theme } = useTheme();

  const followsContext = useContext(FollowsContext);

  const [wot, setWot] = useState(3);
  const [wotIsChanged, setWotIsChanged] = useState(false);

  useEffect(() => {
    const savedWot = storage.getJson<number>(STORAGE_KEYS.WOT, 3);
    setWot(savedWot);
  }, []);

  useEffect(() => {
    storage.setJson(STORAGE_KEYS.WOT, wot);
  }, [wot]);

  const refreshPage = () => {
    window.location.reload();
    setWotIsChanged(false);
  };

  return (
    <>
      <div className="flex items-center p-2">
        <Slider
          size="sm"
          step={1}
          color={theme === "dark" ? "warning" : "secondary"}
          label="Minimum Follower Count:"
          showSteps={true}
          maxValue={
            !followsContext.isLoading && followsContext.firstDegreeFollowsLength
              ? followsContext.firstDegreeFollowsLength
              : wot
          }
          minValue={1}
          value={wot}
          className="text-light-text dark:text-dark-text max-w-md"
          onChangeEnd={(value) => {
            if (Array.isArray(value)) {
              setWot(value[0]!);
            } else {
              setWot(value);
            }
            setWotIsChanged(true);
          }}
        />
      </div>
      {wotIsChanged && (
        <div className="bg-light-bg dark:bg-dark-bg flex h-fit flex-row justify-between px-3 py-[15px]">
          <Button className={SHOPSTRBUTTONCLASSNAMES} onClick={refreshPage}>
            Refresh to Apply
          </Button>
        </div>
      )}
    </>
  );
};

export default ShopstrSlider;
