import React, { useEffect, useState } from "react";
import {
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  Divider,
  Chip,
  Image,
  Button,
  Accordion,
  AccordionItem,
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@nextui-org/react";
import { ProfileAvatar } from "./avatar";
import { NostrEvent } from "../nostr-helpers";
import { locationAvatar } from "./location-dropdown";
import CompactCategories from "./compact-categories";
import ImageCarousel from "./image-carousel";
import { ShippingOptions } from "./STATIC-VARIABLES";
import CompactPriceDisplay, {
  calculateTotalCost,
} from "./display-monetary-info";

interface ProductData {
  id: string;
  pubkey: string;
  createdAt: number;
  title: string;
  summary: string;
  publishedAt: string;
  images: string[];
  categories: string[];
  location: string;
  price: number;
  currency: string;
  shippingType?: ShippingOptions;
  shippingCost?: number;
  totalCost: number;
}

const cardWidth = 380;
const cardxMargin = 2.5;
export const TOTALPRODUCTCARDWIDTH = cardWidth + cardxMargin * 2 + 10;

export default function ProductCard({
  product,
  handleDelete,
  onProductClick,
}: {
  product: NostrEvent;
  handleDelete: (productId: string, passphrase: string) => void;
  onProductClick: (productId: any) => void;
}) {
  const [productData, setProductData] = useState<ProductData>({
    id: "",
    pubkey: "",
    createdAt: 0,
    title: "",
    summary: "",
    publishedAt: "",
    images: [],
    categories: [],
    location: "",
    price: 0,
    currency: "",
    shippingType: null,
    shippingCost: null,
    totalCost: 0,
  });
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const {
    title,
    summary,
    publishedAt,
    images,
    categories,
    location,
    price,
    currency,
    shippingType,
    shippingCost,
    totalCost,
  } = productData;

  useEffect(() => {
    const parsedTags = parseTags(product.tags);
    setProductData((prevState) => ({ ...prevState, ...parsedTags }));
  }, []);

  const parseTags = (tags) => {
    let parsedData: ProductData = {};
    parsedData.pubkey = product.pubkey;
    parsedData.id = product.id;
    parsedData.createdAt = product.created_at;
    tags.forEach((tag) => {
      const [key, ...values] = tag;
      switch (key) {
        case "title":
          parsedData.title = values[0];
          break;
        case "summary":
          parsedData.summary = values[0];
          break;
        case "published_at":
          parsedData.publishedAt = values[0];
          break;
        case "image":
          if (parsedData.images === undefined) parsedData.images = [];
          parsedData.images.push(values[0]);
          break;
        case "t":
          if (parsedData.categories === undefined) parsedData.categories = [];
          parsedData.categories.push(values[0]);
          break;
        case "location":
          parsedData.location = values[0];
          break;
        case "price":
          const [amount, currency] = values;
          parsedData.price = Number(amount);
          parsedData.currency = currency;
          break;
        case "shipping":
          if (values.length === 3) {
            const [type, cost, currency] = values;
            parsedData.shippingType = type;
            parsedData.shippingCost = Number(cost);
            break;
          }
          // TODO Deprecate Below after 11/07/2023
          else if (values.length === 2) {
            // [cost, currency]
            const [cost, currency] = values;
            parsedData.shippingType = "Added Cost";
            parsedData.shippingCost = Number(cost);
            break;
          } else if (values.length === 1) {
            // [type]
            const [type] = values;
            parsedData.shippingType = type;
            parsedData.shippingCost = 0;
            break;
          }
          break;
        default:
          return;
      }
    });
    parsedData.totalCost = calculateTotalCost(parsedData);
    return parsedData;
  };

  const cardHoverStyle = "hover:shadow-lg hover:shadow-purple-300";
  const productCardWidth = ` mx-[${cardxMargin}px] w-[${cardWidth}px] `;
  return (
    <Card
      className={
        // "bg-gray-100 my-3 rounded-lg " + productCardWidth + cardHoverStyle
        "bg-gray-100 my-3 rounded-lg mx-[2.5px] w-[385px]"
      }
      onScroll={() => {
        setIsInfoOpen(false);
      }}
    >
      {/* <CardHeader className="flex justify-between"></CardHeader> */}
      <CardBody
        className={"cursor-pointer "}
        onClick={() => {
          onProductClick(productData);
        }}
      >
        <div className="flex justify-between z-10 w-full">
          <ProfileAvatar pubkey={product.pubkey} className="w-4/6" />
          <div className="flex flex-col justify-center ">
            <CompactCategories categories={categories} />
          </div>
        </div>
        <div className="mb-5">
          <ImageCarousel
            images={images}
            classname="w-full h-[300px]"
            showThumbs={false}
          />
          <div className="flex flex-row justify-between mt-3">
            <Chip key={location} startContent={locationAvatar(location)}>
              {location}
            </Chip>
            <CompactPriceDisplay monetaryInfo={productData} />
          </div>
        </div>
        <Divider />
        <div className="w-full flex flex-col items-center mt-5 ">
          <h2 className="text-2xl font-bold mb-4">{title}</h2>
        </div>
      </CardBody>
    </Card>
  );
}
