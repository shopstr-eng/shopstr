import React from "react";
import { Carousel } from "react-responsive-carousel";
import "react-responsive-carousel/lib/styles/carousel.min.css";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { Image } from "@nextui-org/react";
import { buildSrcSet } from "@/utils/images";
import { useRouter } from "next/router";
import { NEO_BTN } from "@/utils/STATIC-VARIABLES";

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

  const containerClass = `flex items-center justify-center ${classname}`;

  const imageClass = fixedHeight
    ? "h-full w-full object-cover rounded-2xl border border-zinc-800 bg-[#161616]"
    : "w-full object-cover rounded-2xl border border-zinc-800 bg-[#161616]";

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
            className={`${NEO_BTN} absolute left-2 md:left-4 top-1/2 z-10 flex h-8 w-8 md:h-10 md:w-10 -translate-y-1/2 items-center justify-center rounded-lg p-0`}
            onClick={(e) => {
              onClickHandler();
              e.stopPropagation();
            }}
            title={label}
          >
            <ChevronLeftIcon className="h-5 w-5 md:h-6 md:w-6 text-black" />
          </button>
        )
      }
      renderArrowNext={(onClickHandler, hasNext, label) =>
        hasNext && (
          <button
            className={`${NEO_BTN} absolute right-2 md:right-4 top-1/2 z-10 flex h-8 w-8 md:h-10 md:w-10 -translate-y-1/2 items-center justify-center rounded-lg p-0`}
            onClick={(e) => {
              onClickHandler();
              e.stopPropagation();
            }}
            title={label}
          >
            <ChevronRightIcon className="h-5 w-5 md:h-6 md:w-6 text-black" />
          </button>
        )
      }
      renderIndicator={(onClickHandler, isSelected, index, label) => {
        const base =
          "inline-block w-2.5 h-2.5 md:w-3 md:h-3 rounded-full mx-1.5 cursor-pointer border border-black/20 transition-all";
        return (
          <li
            key={index}
            className={
              isSelected
                ? `${base} bg-yellow-400 border-white`
                : `${base} bg-zinc-700 hover:bg-zinc-500`
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
