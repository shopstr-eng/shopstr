import { useState, useEffect, useContext } from "react";
import { Button } from "@nextui-org/react";
import { Slider } from "@nextui-org/react";
import { FollowsContext } from "../../utils/context/context";
import { getLocalStorageData } from "@/utils/nostr/nostr-helper-functions";
import { BLACKBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";

const MilkMarketSlider = () => {
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
          color={"warning"}
          label="Minimum Follower Count:"
          showSteps={true}
          maxValue={
            !followsContext.isLoading && followsContext.firstDegreeFollowsLength
              ? followsContext.firstDegreeFollowsLength
              : wot
          }
          minValue={1}
          defaultValue={wot}
          className="max-w-md text-light-text"
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
        <div className="flex h-fit flex-row justify-between bg-light-bg px-3 py-[15px]">
          <Button className={BLACKBUTTONCLASSNAMES} onClick={refreshPage}>
            Refresh to Apply
          </Button>
        </div>
      )}
    </>
  );
};

export default MilkMarketSlider;
