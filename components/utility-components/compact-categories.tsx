import React from "react";
import { CATEGORIES } from "@/utils/STATIC-VARIABLES";
import { Chip, Tooltip } from "@nextui-org/react";

const CompactCategories = ({ categories }: { categories: string[] }) => {
  const [isOpen, setIsOpen] = React.useState(false);

  const validCategories = categories
    ?.filter((category) => CATEGORIES.includes(category))
    .sort((a, b) => b.length - a.length); // sort by longest to shortest to avoid styling bugs of categories jumping around

  const categoryChips = validCategories?.map((category, index) => {
    return (
      <Chip
        key={index}
        className="rounded-lg border border-zinc-700 bg-[#161616] text-[10px] font-bold uppercase tracking-wider text-zinc-300 py-1"
        size="sm"
      >
        {category}
      </Chip>
    );
  });

  if (validCategories?.length === 0) return null;

  return (
    <>
      {categoryChips && (
        <Tooltip
          content={
            <div className="flex w-fit flex-col gap-2 rounded-xl border border-zinc-800 bg-[#111] p-2.5 shadow-2xl">
              {categoryChips}
            </div>
          }
          isOpen={isOpen}
          onOpenChange={(open) => setIsOpen(open)}
          placement="bottom"
          offset={-32}
          motionProps={{
            variants: {
              exit: {
                opacity: 0,
                transition: {
                  duration: 0.075,
                  ease: "easeIn",
                },
              },
              enter: {
                opacity: 1,
                transition: {
                  duration: 0.1,
                  ease: "easeOut",
                },
              },
            },
          }}
          isDisabled={categoryChips.length <= 1}
          classNames={{
            base: "bg-transparent border-none shadow-none",
          }}
        >
          <div
            className="z-0 w-fit cursor-pointer active:scale-95 transition-transform"
            onClick={() => {
              setIsOpen(!isOpen);
            }}
          >
            {isOpen ? (
              <Chip
                className="rounded-lg border border-zinc-500 bg-[#161616] text-[10px] font-bold uppercase tracking-wider text-white"
                size="sm"
              >
                {validCategories[0]}
              </Chip>
            ) : (
              <Chip
                className="rounded-lg border border-zinc-700 bg-[#161616] text-[10px] font-bold uppercase tracking-wider text-zinc-400 hover:border-zinc-500 hover:text-white"
                size="sm"
              >
                {validCategories[0]}
                {categoryChips.length > 1 ? <span>, ...</span> : null}
              </Chip>
            )}
          </div>
        </Tooltip>
      )}
    </>
  );
};

export default CompactCategories;
