import { useEffect, useRef, useState } from "react";

import { Tab } from "@/components/hooks/use-tabs";
import classNames from "classnames";
import { motion } from "framer-motion";

const transition = {
  type: "tween",
  ease: "easeOut",
  duration: 0.15,
};

type Props = {
  selectedTabIndex: number;
  tabs: Tab[];
  setSelectedTab: (input: [number, number]) => void;
};

const Tabs = ({
  tabs,
  selectedTabIndex,
  setSelectedTab,
}: Props): JSX.Element => {
  const [buttonRefs, setButtonRefs] = useState<Array<HTMLButtonElement | null>>(
    []
  );

  useEffect(() => {
    setButtonRefs((prev) => prev.slice(0, tabs.length));
  }, [tabs.length]);

  const navRef = useRef<HTMLDivElement>(null);
  // const navRect = navRef.current?.getBoundingClientRect();

  // const selectedRect = buttonRefs[selectedTabIndex]?.getBoundingClientRect();
  const [selectedRect, setSelectedRect] = useState<DOMRect | null>(null);
  const [navRect, setNavRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    const updateRects = () => {
      const newSelectedRect =
        buttonRefs[selectedTabIndex]?.getBoundingClientRect() || null;
      const newNavRect = navRef.current?.getBoundingClientRect() || null;
      setSelectedRect(newSelectedRect);
      setNavRect(newNavRect);
    };

    updateRects();

    window.addEventListener("resize", updateRects);

    return () => {
      window.removeEventListener("resize", updateRects);
    };
  }, [buttonRefs, selectedTabIndex]);

  return (
    <nav
      ref={navRef}
      className="relative z-0 flex w-full flex-shrink-0 items-center justify-center "
    >
      {tabs.map((item, i) => {
        const isActive = selectedTabIndex === i;

        return (
          <button
            key={i}
            className={classNames(
              "relative z-20 flex h-10 w-full cursor-pointer select-none items-center  justify-center bg-transparent px-4 py-8 text-lg duration-200 transition-colors hover:bg-white/10",
              {
                "text-light-text": !isActive, // Default color for non-active tabs
                "text-light-text font-bold": isActive, // Color for active tabs
              }
            )}
            ref={(el) => (buttonRefs[i] = el)}
            onClick={() => {
              setSelectedTab([i, i > selectedTabIndex ? 1 : -1]);
            }}
          >
            {item.label}
          </button>
        );
      })}

      {selectedRect && navRect && (
        <motion.div
          className={
            "bg-dark-bg absolute bottom-0 left-0.5 z-10 h-[5px] rounded-full"
          }
          animate={{
            width: selectedRect.width * 0.2,
            x: `calc(${selectedRect.left - navRect.left}px + 195%)`,
            opacity: 1,
          }}
          transition={transition}
        />
      )}
    </nav>
  );
};

export const Framer = { Tabs };
