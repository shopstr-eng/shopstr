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

export const NEO_BTN =
  "rounded-xl border-2 border-transparent bg-yellow-400 font-black uppercase tracking-widest text-black shadow-[2px_2px_0px_0px_#ffffff] hover:bg-yellow-500 transition-all active:shadow-none active:translate-x-[1px] active:translate-y-[1px] disabled:opacity-50 disabled:cursor-not-allowed";

export const PREVNEXTBUTTONSTYLES =
  "absolute z-10 top-1/2 transform -translate-y-1/2 p-2 bg-[#161616] border border-zinc-700 text-white rounded-lg shadow-[2px_2px_0px_0px_#ffffff] hover:bg-zinc-800 transition duration-200";
