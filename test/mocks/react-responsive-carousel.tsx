import React from "react";

type CarouselProps = React.PropsWithChildren<Record<string, unknown>>;

export function Carousel({ children, ...props }: CarouselProps) {
  return (
    <div data-testid="carousel" data-props={JSON.stringify(props)}>
      {children}
    </div>
  );
}

export default Carousel;
