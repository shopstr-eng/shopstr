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

export const AVATARBADGEBUTTONCLASSNAMES =
  "h-10 w-10 min-w-0 rounded-full border-2 border-white p-0 text-dark-text shadow-md bg-gradient-to-tr from-shopstr-purple via-shopstr-purple-light to-shopstr-purple dark:text-light-text dark:from-shopstr-yellow dark:via-shopstr-yellow-light dark:to-shopstr-yellow";

export const WHITEBUTTONCLASSNAMES =
  "bg-white border-2 border-black text-black font-bold hover:bg-gray-100 transition-colors";

export const BLUEBUTTONCLASSNAMES =
  "bg-primary-blue border-2 border-black text-white font-bold hover:opacity-90 transition-opacity";

export const PREVNEXTBUTTONSTYLES =
  "absolute z-10 top-1/2 transform -translate-y-1/2 p-2 bg-white dark:bg-neutral-800 bg-opacity-60 rounded-full shadow-md hover:bg-opacity-90 transition duration-200";
