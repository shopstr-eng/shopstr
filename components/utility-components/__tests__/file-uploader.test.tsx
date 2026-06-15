import { render, screen } from "@testing-library/react";
import type { ButtonHTMLAttributes, HTMLAttributes, SVGProps } from "react";
import "@testing-library/jest-dom";

import { FileUploaderButton } from "../file-uploader";

jest.mock(
  "@heroui/react",
  () => ({
    Button: ({
      children,
      className,
      onClick,
      type = "button",
      ...props
    }: ButtonHTMLAttributes<HTMLButtonElement>) => (
      <button type={type} className={className} onClick={onClick} {...props}>
        {children}
      </button>
    ),
    Progress: (props: HTMLAttributes<HTMLDivElement>) => (
      <div data-testid="progress" {...props} />
    ),
  }),
  { virtual: true }
);

jest.mock("@/utils/nostr/nostr-helper-functions", () => ({
  blossomUploadImages: jest.fn(),
  getLocalStorageData: jest.fn(() => ({})),
}));

jest.mock("@heroicons/react/24/outline", () => ({
  PhotoIcon: (props: SVGProps<SVGSVGElement>) => (
    <svg data-testid="photo-icon" {...props} />
  ),
  ArrowUpTrayIcon: (props: SVGProps<SVGSVGElement>) => (
    <svg data-testid="arrow-up-tray-icon" {...props} />
  ),
  XCircleIcon: (props: SVGProps<SVGSVGElement>) => (
    <svg data-testid="x-circle-icon" {...props} />
  ),
  XMarkIcon: (props: SVGProps<SVGSVGElement>) => (
    <svg data-testid="x-mark-icon" {...props} />
  ),
}));

describe("FileUploaderButton", () => {
  test("applies containerClassName to the outer wrapper and keeps className on the inner button", () => {
    const { container } = render(
      <FileUploaderButton
        className="inner-button-class"
        containerClassName="outer-wrapper-class"
        imgCallbackOnUpload={jest.fn()}
      >
        Upload Avatar
      </FileUploaderButton>
    );

    const root = container.firstElementChild as HTMLElement;
    const button = screen.getByRole("button", { name: /Upload Avatar/i });

    expect(root).toHaveClass("outer-wrapper-class");
    expect(root).toHaveClass("w-fit");
    expect(root).not.toHaveClass("inner-button-class");
    expect(button).toHaveClass("inner-button-class");
    expect(button).not.toHaveClass("outer-wrapper-class");
  });

  test("uses the default full-width wrapper behavior when containerClassName is omitted", () => {
    const { container } = render(
      <FileUploaderButton
        className="inner-button-class"
        imgCallbackOnUpload={jest.fn()}
      >
        Upload Banner
      </FileUploaderButton>
    );

    const root = container.firstElementChild as HTMLElement;
    const button = screen.getByRole("button", { name: /Upload Banner/i });

    expect(root).toHaveClass("flex", "w-full", "flex-col", "gap-4");
    expect(root).not.toHaveClass("w-fit");
    expect(button).toHaveClass("inner-button-class");
  });
});
