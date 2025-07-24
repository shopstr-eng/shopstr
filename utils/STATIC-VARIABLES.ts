export const CATEGORIES = [
  "Milk",
  "Cheese",
  "Yogurt",
  "Dairy",
  "Pets",
  "Health",
  "Food",
  "Cow",
  "Goat",
];

export type ShippingOptionsType =
  | "N/A"
  | "Free"
  | "Pickup"
  | "Free/Pickup"
  | "Added Cost";

export const SHIPPING_OPTIONS = [
  "N/A",
  "Free", // free shipping you are going to ship it
  "Pickup", // you are only going to have someone pick it up
  "Free/Pickup", // you are open to do either
  "Added Cost", // you are going to charge for shipping
];

export const BLACKBUTTONCLASSNAMES =
  "text-dark-text shadow-lg bg-gradient-to-tr min-w-fit from-dark-bg via-dark-fg to-dark-bg";

export const WHITEBUTTONCLASSNAMES =
  "text-light-text shadow-lg bg-light-bg min-w-fit";

export const PREVNEXTBUTTONSTYLES =
  "absolute z-10 top-1/2 transform -translate-y-1/2 p-2 bg-neutral-800 bg-opacity-60 rounded-full shadow-md hover:bg-opacity-90 transition duration-200";
