import type { ButtonHTMLAttributes, ReactNode } from "react";
import { render } from "@testing-library/react";
import { Image } from "@heroui/react";
import Landing from "@/pages/index";

jest.mock("next/router", () => ({
  useRouter: () => ({ pathname: "/", push: jest.fn() }),
}));

jest.mock("@heroui/react", () => {
  const React = require("react");

  return {
    Button: ({
      children,
      startContent: _startContent,
      ...props
    }: ButtonHTMLAttributes<HTMLButtonElement> & {
      startContent?: ReactNode;
    }) => React.createElement("button", props, children),
    Image: jest.fn(() => null),
    useDisclosure: () => ({
      isOpen: false,
      onOpen: jest.fn(),
      onClose: jest.fn(),
    }),
  };
});

jest.mock("@/components/sign-in/SignInModal", () => () => null);
jest.mock("@/components/utility-components/product-card", () => () => null);

const mockImage = Image as unknown as jest.Mock;

describe("homepage How It Works images", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ listingCount: 0, sellerCount: 0 }),
    });
  });

  afterEach(() => {
    (global.fetch as jest.Mock).mockRestore?.();
  });

  it("uses native lazy loading without HeroUI's detached preloader", () => {
    render(<Landing />);

    const stepImages = Array.from(
      new Map(
        mockImage.mock.calls
          .map(([props]) => props)
          .filter(({ src }) => src.includes("-step-"))
          .map((props) => [props.src, props])
      ).values()
    );

    expect(stepImages).toHaveLength(8);
    stepImages.forEach((props) => {
      expect(props).toEqual(
        expect.objectContaining({
          as: "img",
          loading: "lazy",
          removeWrapper: true,
          disableSkeleton: true,
          width: 250,
          height: 437,
        })
      );
    });
  });
});
