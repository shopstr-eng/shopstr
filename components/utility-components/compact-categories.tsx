import React from "react";
import { CATEGORIES } from "../utility/STATIC-VARIABLES";
import { Chip, Tooltip } from "@nextui-org/react";

const CompactCategories = ({ categories }: { categories: string[] }) => {
  const [isOpen, setIsOpen] = React.useState(false);

  const validCategories = categories
    ?.filter((category) => CATEGORIES.includes(category))
    .sort((a, b) => b.length - a.length); // sort by longest to shortest to avoid styling bugs of categories jumping around

  const categoryChips = validCategories?.map((category, index) => {
    return <Chip key={index}>{category}</Chip>;
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
          }}
        >
          <div
            className="z-0  w-fit"
            onClick={() => {
              setIsOpen(true);
            }}
          >
            {isOpen ? (
              <Chip>{validCategories[0]}</Chip>
            ) : (
              <Chip>
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
