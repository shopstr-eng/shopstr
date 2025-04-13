import React from "react";
import { Carousel } from "react-responsive-carousel";
import "react-responsive-carousel/lib/styles/carousel.min.css";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { Image } from "@nextui-org/react";
import { buildSrcSet } from "@/utils/images";
import { useRouter } from "next/router";

interface ImageCarouselProps {
  images: string[];
  classname?: string;
  showThumbs?: boolean;
  fixedHeight?: boolean;
}

export default function ImageCarousel({
  images,
  classname = "",
  showThumbs = false,
  fixedHeight = true,
}: ImageCarouselProps) {
  const router = useRouter();

  const PREVNEXTBUTTONSTYLES =
    "absolute z-10 top-1/2 transform -translate-y-1/2 p-2 bg-white dark:bg-neutral-800 bg-opacity-60 rounded-full shadow-md hover:bg-opacity-90 transition duration-200";

  const containerClass = `flex items-center justify-center ${classname}`;

  const imageClass = fixedHeight
    ? "h-full w-full object-cover rounded-xl transition-transform duration-300 ease-in-out hover:scale-105"
    : "w-full object-cover rounded-xl";

  const displayImages = () => {
    if (!images || images.length === 0) {
      return [
        <div className={containerClass} key="no-image">
          <Image
            src="/no-image-placeholder.png"
            className={imageClass}
            alt="No image placeholder"
          />
        </div>,
      ];
    }

    return images.map((image, index) => (
      <div className={containerClass} key={`image-${index}`}>
        <Image
          src={image}
          srcSet={buildSrcSet(image)}
          className={imageClass}
          alt={image || `Product image ${index + 1}`}
          radius="none"
          style={{
            width: "100%",
            height: "100%",
          }}
          disableSkeleton={true}
        />
      </div>
    ));
  };

  return (
    <Carousel
      showArrows={images && images.length > 1}
      showStatus={false}
      showIndicators={router.pathname !== "/" && images.length > 1}
      showThumbs={showThumbs}
      infiniteLoop
      preventMovementUntilSwipeScrollTolerance
      swipeScrollTolerance={50}
      renderArrowPrev={(onClickHandler, hasPrev, label) =>
        hasPrev && (
          <button
            className={`left-4 ${PREVNEXTBUTTONSTYLES}`}
            onClick={(e) => {
              onClickHandler();
              e.stopPropagation();
            }}
            title={label}
          >
            <ChevronLeftIcon className="h-6 w-6 text-black dark:text-white" />
          </button>
        )
      }
      renderArrowNext={(onClickHandler, hasNext, label) =>
        hasNext && (
          <button
            className={`right-4 ${PREVNEXTBUTTONSTYLES}`}
            onClick={(e) => {
              onClickHandler();
              e.stopPropagation();
            }}
            title={label}
          >
            <ChevronRightIcon className="h-6 w-6 text-black dark:text-white" />
          </button>
        )
      }
      renderIndicator={(onClickHandler, isSelected, index, label) => {
        const base = "inline-block w-3 h-3 rounded-full mx-1 cursor-pointer";
        return (
          <li
            key={index}
            className={
              isSelected
                ? `${base} bg-blue-500`
                : `${base} bg-gray-300 hover:bg-gray-500`
            }
            onClick={(e) => {
              onClickHandler(e);
              e.stopPropagation();
            }}
            title={`${label} ${index + 1}`}
            role="button"
            tabIndex={0}
          />
        );
      }}
    >
      {displayImages()}
    </Carousel>
  );
}
