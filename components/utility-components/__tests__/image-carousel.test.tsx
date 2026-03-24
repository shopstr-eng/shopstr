import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import ImageCarousel from "../image-carousel";
import { Carousel } from "react-responsive-carousel";

const mockRouter = {
  pathname: "/product-page",
};
jest.mock("next/router", () => ({
  useRouter: () => mockRouter,
}));

jest.mock("react-responsive-carousel", () => ({
  Carousel: jest.fn(({ children, ...props }) => (
    <div data-testid="carousel" data-props={JSON.stringify(props)}>
      {children}
    </div>
  )),
}));

jest.mock("@nextui-org/react", () => ({
  Image: ({ _disableSkeleton, ...props }: any) => (
    <img {...props} data-testid="next-image" />
  ),
}));

jest.mock("@heroicons/react/24/outline", () => ({
  ChevronLeftIcon: () => <div data-testid="chevron-left" />,
  ChevronRightIcon: () => <div data-testid="chevron-right" />,
}));

jest.mock("@/utils/images", () => ({
  buildSrcSet: (src: string) => `${src}-srcset`,
}));
jest.mock("@/utils/STATIC-VARIABLES", () => ({
  PREVNEXTBUTTONSTYLES: "mock-button-styles",
}));

const MockCarousel = Carousel as jest.Mock;

describe("ImageCarousel", () => {
  beforeEach(() => {
    MockCarousel.mockClear();
    mockRouter.pathname = "/product-page";
  });

  it("renders a placeholder when no images are provided", () => {
    render(<ImageCarousel images={[]} />);
    const image = screen.getByTestId("next-image") as HTMLImageElement;
    expect(image.src).toContain("/no-image-placeholder.png");
  });

  it("renders a single image without arrows or indicators", () => {
    render(<ImageCarousel images={["image1.jpg"]} />);
    const image = screen.getByTestId("next-image") as HTMLImageElement;
    expect(image.src).toContain("image1.jpg");

    const props = JSON.parse(
      screen.getByTestId("carousel").getAttribute("data-props")!
    );
    expect(props.showArrows).toBe(false);
    expect(props.showIndicators).toBe(false);
  });

  it("renders multiple images with arrows and indicators on a non-home page", () => {
    render(<ImageCarousel images={["image1.jpg", "image2.jpg"]} />);
    const images = screen.getAllByTestId("next-image");
    expect(images).toHaveLength(2);

    const props = JSON.parse(
      screen.getByTestId("carousel").getAttribute("data-props")!
    );
    expect(props.showArrows).toBe(true);
    expect(props.showIndicators).toBe(true);
  });

  it("renders multiple images with arrows but NO indicators on the home page", () => {
    mockRouter.pathname = "/";
    render(<ImageCarousel images={["image1.jpg", "image2.jpg"]} />);

    const props = JSON.parse(
      screen.getByTestId("carousel").getAttribute("data-props")!
    );
    expect(props.showArrows).toBe(true);
    expect(props.showIndicators).toBe(false);
  });

  it("applies correct image class based on fixedHeight prop", () => {
    const { rerender } = render(<ImageCarousel images={["image1.jpg"]} />);
    let image = screen.getByTestId("next-image");
    expect(image.className).toContain("h-full");

    rerender(<ImageCarousel images={["image1.jpg"]} fixedHeight={false} />);
    image = screen.getByTestId("next-image");
    expect(image.className).not.toContain("h-full");
  });

  it("passes showThumbs prop to the Carousel", () => {
    render(<ImageCarousel images={["image1.jpg"]} showThumbs={true} />);
    const props = JSON.parse(
      screen.getByTestId("carousel").getAttribute("data-props")!
    );
    expect(props.showThumbs).toBe(true);
  });

  describe("Custom Render Functions", () => {
    it("renderArrowPrev should render a button only when hasPrev is true", () => {
      // Render the component first to populate the mock's calls
      render(<ImageCarousel images={["1.jpg", "2.jpg"]} />);
      const { renderArrowPrev } = MockCarousel.mock.calls[0][0];
      const mockClickHandler = jest.fn();

      const { getByRole, queryByRole, rerender } = render(
        <>{renderArrowPrev(mockClickHandler, true, "prev")}</>
      );
      const button = getByRole("button");
      expect(button).toBeInTheDocument();
      fireEvent.click(button);
      expect(mockClickHandler).toHaveBeenCalled();

      rerender(<>{renderArrowPrev(mockClickHandler, false, "prev")}</>);
      expect(queryByRole("button")).not.toBeInTheDocument();
    });

    it("renderArrowNext should render a button only when hasNext is true", () => {
      render(<ImageCarousel images={["1.jpg", "2.jpg"]} />);
      const { renderArrowNext } = MockCarousel.mock.calls[0][0];
      const mockClickHandler = jest.fn();

      const { getByRole, queryByRole, rerender } = render(
        <>{renderArrowNext(mockClickHandler, true, "next")}</>
      );
      const button = getByRole("button");
      expect(button).toBeInTheDocument();
      fireEvent.click(button);
      expect(mockClickHandler).toHaveBeenCalled();

      rerender(<>{renderArrowNext(mockClickHandler, false, "next")}</>);
      expect(queryByRole("button")).not.toBeInTheDocument();
    });

    it("renderIndicator should render a styled list item", () => {
      render(<ImageCarousel images={["1.jpg", "2.jpg"]} />);
      const { renderIndicator } = MockCarousel.mock.calls[0][0];
      const mockClickHandler = jest.fn();

      const { getByRole, rerender } = render(
        <>{renderIndicator(mockClickHandler, true, 0, "item")}</>
      );
      const indicator = getByRole("button");
      expect(indicator).toBeInTheDocument();
      expect(indicator.className).toContain("bg-blue-500");

      fireEvent.click(indicator);
      expect(mockClickHandler).toHaveBeenCalled();

      rerender(<>{renderIndicator(mockClickHandler, false, 1, "item")}</>);
      const nonSelectedIndicator = getByRole("button");
      expect(nonSelectedIndicator.className).toContain("bg-gray-300");
    });
  });
});
