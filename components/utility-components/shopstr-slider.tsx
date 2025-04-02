import { useState, useEffect, useContext } from "react";
import { Button } from "@nextui-org/react";
import { Slider } from "@nextui-org/react";
import { useTheme } from "next-themes";
import { FollowsContext } from "../../utils/context/context";
import { getLocalStorageData } from "@/utils/nostr/nostr-helper-functions";
import { SHOPSTRBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";

const ShopstrSlider = () => {
  const { theme } = useTheme();

  const followsContext = useContext(FollowsContext);

  const [wot, setWot] = useState(getLocalStorageData().wot);
  const [wotIsChanged, setWotIsChanged] = useState(false);

  useEffect(() => {
    localStorage.setItem("wot", String(wot));
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
          defaultValue={wot}
          className="max-w-md text-light-text dark:text-dark-text"
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
        <div className="flex h-fit flex-row justify-between bg-light-bg px-3 py-[15px] dark:bg-dark-bg">
          <Button className={SHOPSTRBUTTONCLASSNAMES} onClick={refreshPage}>
            Refresh to Apply
          </Button>
        </div>
      )}
    </>
  );
};

export default ShopstrSlider;
