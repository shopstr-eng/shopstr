import { useState } from "react";
import { CATEGORIES } from "@/utils/STATIC-VARIABLES";
import { Chip, Tooltip } from "@nextui-org/react";

const CompactCategories = ({ categories }: { categories: string[] }) => {
  const [isOpen, setIsOpen] = useState(false);

  // Define the neobrutalist chip style
  const CHIP_CLASSES =
    "bg-white border-2 border-black text-black font-bold rounded-md";

  const validCategories = categories
    ?.filter((category) => CATEGORIES.includes(category))
    .sort((a, b) => b.length - a.length); // sort by longest to shortest to avoid styling bugs of categories jumping around

  const categoryChips = validCategories?.map((category, index) => {
    // Apply styles to chips inside the tooltip
    return (
      <Chip key={index} classNames={{ base: CHIP_CLASSES }}>
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
            <div className="flex w-fit flex-col gap-2">{categoryChips}</div>
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
            // Apply styles to the tooltip popup itself
            content: "bg-white border-2 border-black rounded-md shadow-neo p-2",
          }}
        >
          <div
            className=" w-fit z-0"
            onClick={() => {
              setIsOpen(true);
            }}
          >
            {isOpen ? (
              // Apply styles to the main chip (when open)
              <Chip classNames={{ base: CHIP_CLASSES }}>
                {validCategories[0]}
              </Chip>
            ) : (
              // Apply styles to the main chip (when closed)
              <Chip classNames={{ base: CHIP_CLASSES }}>
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
