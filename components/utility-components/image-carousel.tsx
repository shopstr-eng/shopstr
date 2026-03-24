import { Carousel } from "react-responsive-carousel";
import "react-responsive-carousel/lib/styles/carousel.min.css";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { Image } from "@nextui-org/react";
import { buildSrcSet } from "@/utils/images";
import { PREVNEXTBUTTONSTYLES } from "@/utils/STATIC-VARIABLES";

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
  const containerClass = `flex items-center justify-center ${classname}`;

  // Updated image class to use rounded-md for consistency
  const imageClass = fixedHeight
    ? "h-full w-full object-cover rounded-md transition-transform duration-300 ease-in-out hover:scale-105"
    : "w-full object-cover rounded-md";

  const displayImages = () => {
    if (!images || images.length === 0) {
      return [
        <div className={containerClass} key="no-image">
          <Image
            src="/no-image-placeholder.png"
            className={imageClass}
            alt="No product image available - dairy listing placeholder"
            loading="lazy"
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
          alt={`Product image ${index + 1} - farm-fresh dairy listing`}
          loading="lazy"
          radius="none" // radius="none" is fine, imageClass controls it
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
      showIndicators={false}
      showThumbs={showThumbs}
      infiniteLoop
      preventMovementUntilSwipeScrollTolerance
      swipeScrollTolerance={50}
      renderArrowPrev={(onClickHandler, hasPrev, label) =>
        hasPrev && (
          <button
            className={`carousel-control left-4 ${PREVNEXTBUTTONSTYLES}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClickHandler();
            }}
            title={label}
          >
            {/* Updated icon color */}
            <ChevronLeftIcon className="h-6 w-6 text-black" />
          </button>
        )
      }
      renderArrowNext={(onClickHandler, hasNext, label) =>
        hasNext && (
          <button
            className={`carousel-control right-4 ${PREVNEXTBUTTONSTYLES}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClickHandler();
            }}
            title={label}
          >
            {/* Updated icon color */}
            <ChevronRightIcon className="h-6 w-6 text-black" />
          </button>
        )
      }
      renderIndicator={(onClickHandler, isSelected, index, label) => {
        // Updated indicator dot styles
        const base =
          "inline-block w-3 h-3 rounded-full mx-1 cursor-pointer border-2 border-black";
        return (
          <li
            key={index}
            className={
              isSelected
                ? `${base} bg-primary-yellow`
                : `${base} bg-gray-300 hover:bg-gray-400`
            }
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClickHandler(e);
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
