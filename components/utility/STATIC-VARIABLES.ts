export const CATEGORIES = [
  "Digital",
  "Physical",
  "Services",
  "Resale",
  "Exchange",
  "Swap",
  "Clothing",
  "Shoes",
  "Accessories",
  "Electronics",
  "Collectibles",
  "Entertainment",
  "Books",
  "Pets",
  "Sports",
  "Tickets",
  "Fitness",
  "Art",
  "Crafts",
  "Home",
  "Office",
  "Food",
  "Miscellaneous",
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

export const SHOPSTRBUTTONCLASSNAMES =
  "text-dark-text dark:text-light-text shadow-lg bg-gradient-to-tr from-shopstr-purple via-shopstr-purple-light to-shopstr-purple min-w-fit dark:from-shopstr-yellow dark:via-shopstr-yellow-light dark:to-shopstr-yellow";
