import { useState, useEffect, useContext } from "react";
import { Slider } from "@nextui-org/react";
import { useTheme } from "next-themes";
import { FollowsContext } from "../../utils/context/context";
import { getLocalStorageData } from "@/utils/nostr/nostr-helper-functions";

const ShopstrSlider = () => {
  const { theme } = useTheme();
  const followsContext = useContext(FollowsContext);

  // Directly get initial value from localStorage with proper numeric conversion
  const [wot, setWot] = useState(() => {
    const storedValue = getLocalStorageData().wot;
    return typeof storedValue === 'number' ? storedValue : 3;
  });
 
  useEffect(() => {
    localStorage.setItem("wot", String(wot));
  }, [wot]);

  return (
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
        className="max-w-md text-light-text dark:text-dark-text"
        onChange={(value) => {
          const numericValue = Array.isArray(value) ? value[0]! : value;
          setWot(numericValue);
        }}
      />
    </div>
  );
};

export default ShopstrSlider;
