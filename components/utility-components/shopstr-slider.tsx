import { useState, useEffect, useContext } from "react";
import { Button } from "@nextui-org/react";
import { Slider } from "@nextui-org/react";
import { FollowsContext } from "../../utils/context/context";
import { getLocalStorageData } from "@/utils/nostr/nostr-helper-functions";
import { NEO_BTN } from "@/utils/STATIC-VARIABLES";

const ShopstrSlider = () => {
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
      <div className="flex w-full items-center p-2">
        <Slider
          size="sm"
          step={1}
          label="MINIMUM FOLLOWER COUNT"
          showSteps={true}
          maxValue={
            !followsContext.isLoading && followsContext.firstDegreeFollowsLength
              ? followsContext.firstDegreeFollowsLength
              : wot
          }
          minValue={1}
          defaultValue={wot}
          className="max-w-md"
          classNames={{
            label:
              "text-zinc-500 font-bold uppercase tracking-wider text-xs mb-2",
            track: "bg-zinc-800 border border-zinc-700 h-2",
            filler: "bg-yellow-400",
            thumb:
              "w-5 h-5 bg-[#161616] border-2 border-yellow-400 shadow-sm after:bg-yellow-400",
            value: "font-black text-white text-sm",
            step: "bg-zinc-600 data-[in-range=true]:bg-black/50",
          }}
          renderValue={({ children, ...props }) => (
            <output
              {...props}
              className="font-mono text-sm font-bold text-yellow-400"
            >
              {children}
            </output>
          )}
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
        <div className="flex h-fit flex-row justify-between px-3 py-4">
          <Button
            className={`${NEO_BTN} h-10 px-6 text-xs`}
            onClick={refreshPage}
          >
            Refresh to Apply
          </Button>
        </div>
      )}
    </>
  );
};

export default ShopstrSlider;
