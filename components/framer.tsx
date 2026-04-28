import { type ReactElement } from "react";

import { Tab } from "@/components/hooks/use-tabs";
import classNames from "classnames";
import { motion } from "framer-motion";

const tapTransition = {
  type: "tween",
  ease: "easeOut",
  duration: 0.1,
} as const;

type Props = {
  selectedTabIndex: number;
  tabs: Tab[];
  setSelectedTab: (input: [number, number]) => void;
};

const Tabs = ({
  tabs,
  selectedTabIndex,
  setSelectedTab,
}: Props): ReactElement => {
  return (
    <nav
      role="tablist"
      className="relative z-0 flex w-full flex-shrink-0 flex-wrap items-center justify-center gap-2 p-2"
    >
      {tabs.map((item, i) => {
        const isActive = selectedTabIndex === i;

        return (
          <motion.button
            key={i}
            type="button"
            role="tab"
            aria-selected={isActive}
            whileTap={{ y: 2 }}
            transition={tapTransition}
            onClick={() => {
              setSelectedTab([i, i > selectedTabIndex ? 1 : -1]);
            }}
            className={classNames(
              "shadow-neo cursor-pointer rounded-md border-2 border-black px-5 py-2 text-base font-bold transition-transform select-none",
              isActive
                ? "bg-primary-yellow text-black"
                : "bg-white text-black hover:-translate-y-0.5 active:translate-y-0.5"
            )}
          >
            {item.label}
          </motion.button>
        );
      })}
    </nav>
  );
};

export const Framer = { Tabs };
