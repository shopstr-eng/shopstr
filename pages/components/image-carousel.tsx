import React from "react";
import { Carousel } from "react-responsive-carousel";
import "react-responsive-carousel/lib/styles/carousel.min.css"; // requires a loader
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";

interface ImageCarouselProps {
  images: string[];
  classname?: string;
  showThumbs?: boolean;
}
export default function ImageCarousel({
  images,
  classname,
  showThumbs,
}: ImageCarouselProps) {
  /** SHARED STYLES **/
  const PREVNEXTBUTTONSTYLES =
    " absolute z-10 top-[calc(50%-(.5*50%/2))] cursor-pointer h-[30%] w-[8%] rounded-sm bg-purple-300 opacity-20 hover:bg-purple-500 hover:opacity-80 flex items-center ";

  const displayImages = () => {
    let className = "flex items-center justify-center " + classname + "";
    if (!images || images.length == 0)
      return [
        <div className={className} key={"image" + 0}>
          <img
            src="/no-image-placeholder.png"
            className="object-contain w-full h-full"
          />
        </div>,
      ];
    return images.map((image, index) => {
      return (
        <div className={className} key={"image" + index}>
          <img src={image} className="object-contain w-full h-full" />
        </div>
      );
    });
  };
  return (
    <Carousel
      showArrows={images && images.length > 1}
      showStatus={false}
      showIndicators={images && images.length > 1}
      showThumbs={showThumbs}
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
            <ChevronLeftIcon className="w-7 h-7" />
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
            <ChevronRightIcon className="w-7 h-7" />
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
