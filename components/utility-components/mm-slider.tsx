import { useState, useEffect, useContext } from "react";
  import { Button } from "@heroui/react";
  import { Slider } from "@heroui/react";
import { FollowsContext } from "../../utils/context/context";
import { getLocalStorageData } from "@/utils/nostr/nostr-helper-functions";
import { BLUEBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";

const MilkMarketSlider = () => {
  const followsContext = useContext(FollowsContext);

  const [wot, setWot] = useState(3);
  const [wotIsChanged, setWotIsChanged] = useState(false);

  useEffect(() => {
    const savedWot = getLocalStorageData().wot;
    setWot(savedWot);
  }, []);

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
          label="Minimum Follower Count:"
          showSteps={true}
          maxValue={
            !followsContext.isLoading && followsContext.firstDegreeFollowsLength
              ? followsContext.firstDegreeFollowsLength
              : wot > 1
                ? wot
                : 2
          }
          minValue={1}
          value={wot}
          className="max-w-md"
          classNames={{
            thumb: "bg-primary-blue",
            filler: "bg-primary-blue",
          }}
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
        <div className="flex h-fit flex-row justify-between bg-white px-3 py-[15px]">
          <Button className={BLUEBUTTONCLASSNAMES} onClick={refreshPage}>
            Refresh to Apply
          </Button>
        </div>
      )}
    </>
  );
};

export default MilkMarketSlider;
