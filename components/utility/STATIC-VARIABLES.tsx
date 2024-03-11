import { FaNetworkWired } from "react-icons/fa";
import { MdOutlineMedicalServices } from "react-icons/md";
import { LuShirt } from "react-icons/lu";
import { MdOutlinePhoneIphone } from "react-icons/md";
import { GrDiamond } from "react-icons/gr";
import { PiBookOpen } from "react-icons/pi";
import { FaPaw } from "react-icons/fa";
import { MdOutlineSportsSoccer } from "react-icons/md";
import { FaPaintBrush } from "react-icons/fa";
import { GiStoneCrafting } from "react-icons/gi";
import { RiHomeHeartLine } from "react-icons/ri";
import { PiOfficeChairBold } from "react-icons/pi";
import { CiWheat } from "react-icons/ci";
import { FaTag } from "react-icons/fa";
import { FaExchangeAlt } from "react-icons/fa";
import { LuTag } from "react-icons/lu";
import { FaPeopleArrows } from "react-icons/fa";

export const CATEGORIES = [
  { name: "Digital", icon: <FaNetworkWired /> },
  { name: "Physical", icon: <FaPeopleArrows /> },
  { name: "Clothing", icon: <LuShirt /> },
  { name: "Electronics", icon: <MdOutlinePhoneIphone /> },
  { name: "Collectibles", icon: <GrDiamond /> },
  { name: "Books", icon: <PiBookOpen /> },
  { name: "Pets", icon: <FaPaw /> },
  { name: "Sports", icon: <MdOutlineSportsSoccer /> },
  { name: "Art", icon: <FaPaintBrush /> },
  { name: "Crafts", icon: <GiStoneCrafting /> },
  { name: "Home", icon: <RiHomeHeartLine /> },
  { name: "Office", icon: <PiOfficeChairBold /> },
  { name: "Food", icon: <CiWheat /> },
  { name: "Services", icon: <MdOutlineMedicalServices /> },
  { name: "Resale", icon: <FaTag /> },
  { name: "Exchange/swap", icon: <FaExchangeAlt /> },
  { name: "Miscellaneous", icon: <LuTag /> },
];

export type CurrencyType = "SATS" | "USD";

export const CURRENCY_OPTIONS: CurrencyType[] = ["SATS", "USD"];

export type ShippingOptionsType =
  | "N/A"
  | "Free"
  | "Pickup"
  | "Free/Pickup"
  | "Added Cost";

export const SHIPPING_OPTIONS: ShippingOptionsType[] = [
  "N/A",
  "Free", // free shipping you are going to ship it
  "Pickup", // you are only going to have someone pick it up
  "Free/Pickup", // you are open to do either
  "Added Cost", // you are going to charge for shipping
];

export const SHOPSTRBUTTONCLASSNAMES =
  "text-dark-text dark:text-light-text shadow-lg bg-gradient-to-tr from-shopstr-purple via-shopstr-purple-light to-shopstr-purple min-w-fit dark:from-shopstr-yellow dark:via-shopstr-yellow-light dark:to-shopstr-yellow";
