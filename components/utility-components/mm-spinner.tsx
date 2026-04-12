import { Spinner } from "@heroui/react";

export default function MilkMarketSpinner({ label }: { label?: string }) {
  return (
    <>
      <Spinner
        size={"lg"}
        label={label}
        classNames={{
          // Use your primary-yellow for the spinner's circle
          circle1: "border-b-primary-yellow",
          circle2: "border-b-primary-yellow",
          // Use black for the label text
          label: "text-black",
        }}
      />
    </>
  );
}
