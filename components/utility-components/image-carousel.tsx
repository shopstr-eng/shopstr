import React from "react";
import { Carousel } from "react-responsive-carousel";
import "react-responsive-carousel/lib/styles/carousel.min.css";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { Image } from "@nextui-org/react";
import { buildSrcSet } from "@/utils/images";
import { useRouter } from "next/router";
import { PREVNEXTBUTTONSTYLES } from "@/utils/STATIC-VARIABLES";

interface ImageCarouselProps {
  images: ProductImage[];
  classname?: string;
  showThumbs?: boolean;
  fixedHeight?: boolean;
}
type ProductImage = {
  url: string;
  alt?: string;
};

export default function ImageCarousel({
  images,
  classname = "",
  showThumbs = false,
  fixedHeight = true,
}: ImageCarouselProps) {
  const router = useRouter();
<<<<<<< HEAD

  const PREVNEXTBUTTONSTYLES =
    "absolute z-10 top-[calc(50%-(.5*50%/2))] cursor-pointer h-[30%] w-[8%] rounded-sm bg-purple-300 opacity-20 hover:bg-purple-500 hover:opacity-80 flex items-center";
=======
>>>>>>> 48e5b484293f5bda92d01fcf8df3ebc81e8ed917

  const containerClass = `flex items-center justify-center ${classname}`;

  const imageClass = fixedHeight
    ? "h-full w-full object-cover"
    : "h-full w-full object-cover";

  const displayImages = () => {
<<<<<<< HEAD
    if (!images || images.length === 0) {
=======
    const className = "flex items-center justify-center " + classname + "";
    if (!images || images.length == 0)
>>>>>>> 48e5b484293f5bda92d01fcf8df3ebc81e8ed917
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
          src={image.url}
          srcSet={buildSrcSet(image.url)}
          className={imageClass}
          alt={`Product image ${index + 1}`}
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
      showIndicators={router.pathname !== "/" && images && images.length > 1}
      showThumbs={showThumbs}
      infiniteLoop={true}
      preventMovementUntilSwipeScrollTolerance={true}
      swipeScrollTolerance={50}
      renderArrowPrev={(onClickHandler, hasPrev, label) =>
        hasPrev && (
          <button
            className={"left-0 justify-start " + PREVNEXTBUTTONSTYLES}
            onClick={(e) => {
              onClickHandler();
              e.stopPropagation();
            }}
            title={label}
          >
            <ChevronLeftIcon className="h-7 w-7" />
          </button>
        )
      }
      renderArrowNext={(onClickHandler, hasNext, label) =>
        hasNext && (
          <button
            className={"right-0 justify-end " + PREVNEXTBUTTONSTYLES}
            onClick={(e) => {
              onClickHandler();
              e.stopPropagation();
            }}
            title={label}
          >
            <ChevronRightIcon className="h-7 w-7" />
          </button>
        )
      }
      renderIndicator={(onClickHandler, isSelected, index, label) => {
        const indicatorStyles =
          "inline-block w-3.5 h-3.5 rounded-full mr-3 z-10 cursor-pointer";
        if (isSelected) {
          return (
            <li
              className={"bg-cyan-500 " + indicatorStyles}
              aria-label={`Selected: ${label} ${index + 1}`}
              title={`Selected: ${label} ${index + 1}`}
              onClick={(e) => {
                e.stopPropagation();
              }}
            />
          );
        }
        return (
          <li
            className={indicatorStyles + " bg-gray-300 hover:bg-gray-500"}
            onClick={(e) => {
              onClickHandler(e);
              e.stopPropagation();
            }}
            onKeyDown={onClickHandler}
            value={index}
            key={index}
            role="button"
            tabIndex={0}
            title={`${label} ${index + 1}`}
            aria-label={`${label} ${index + 1}`}
          />
        );
      }}
    >
      {displayImages()}
    </Carousel>
  );
}
