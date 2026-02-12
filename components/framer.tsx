import React, { useEffect, useRef, useState } from "react";

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
      className="relative z-0 flex w-full flex-shrink-0 items-center justify-start md:justify-center border-b border-zinc-800 bg-[#111] overflow-x-auto no-scrollbar"
    >
      {tabs.map((item, i) => {
        const isActive = selectedTabIndex === i;

        return (
          <button
            key={i}
            className={classNames(
              "relative z-20 flex h-10 w-full min-w-fit cursor-pointer select-none items-center justify-center bg-transparent px-6 py-8 text-xs md:text-sm uppercase tracking-widest duration-200 transition-colors hover:bg-white/5 whitespace-nowrap",
              {
                "text-zinc-500 font-bold hover:text-zinc-300": !isActive,
                "font-black text-white": isActive,
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
            "absolute bottom-0 left-0.5 z-10 h-[4px] rounded-t-sm bg-yellow-400"
          }
          animate={{
            width: selectedRect.width * 0.8, // Increased width for better mobile visibility
            x: selectedRect.left - navRect.left + selectedRect.width * 0.1, // Centered underline
            opacity: 1,
          }}
          transition={transition}
        />
      )}
    </nav>
  );
};

export const Framer = { Tabs };
