import { render, screen } from "@testing-library/react";
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
    }: any) => (
      <button type={type} className={className} onClick={onClick} {...props}>
        {children}
      </button>
    ),
    Progress: (props: any) => <div data-testid="progress" {...props} />,
  }),
  { virtual: true }
);

jest.mock("@/utils/nostr/nostr-helper-functions", () => ({
  // Downstream uses blossomUpload (upstream's blossomUploadImages was renamed/diverged).
  blossomUpload: jest.fn(),
  getLocalStorageData: jest.fn(() => ({})),
}));

// nostr-context-provider transitively imports nostr-tools -> @noble/curves (ESM),
// which jest cannot transform under the .pnpm layout. Mock it to avoid loading
// the real module; these tests only exercise wrapper/button classNames.
jest.mock("@/components/utility-components/nostr-context-provider", () => {
  const React = require("react");
  return {
    __esModule: true,
    SignerContext: React.createContext({ signer: null, isLoggedIn: false }),
    NostrContext: React.createContext({ nostr: null }),
  };
});

jest.mock("@heroicons/react/24/outline", () => ({
  PhotoIcon: (props: any) => <svg data-testid="photo-icon" {...props} />,
  ArrowUpTrayIcon: (props: any) => (
    <svg data-testid="arrow-up-tray-icon" {...props} />
  ),
  XCircleIcon: (props: any) => <svg data-testid="x-circle-icon" {...props} />,
  XMarkIcon: (props: any) => <svg data-testid="x-mark-icon" {...props} />,
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

  test("uses the default wrapper behavior when containerClassName is omitted", () => {
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

    // Downstream's default wrapper is "flex flex-col gap-4" (w-full only applies
    // when isPlaceholder/isProductUpload), diverging from upstream's always-w-full.
    expect(root).toHaveClass("flex", "flex-col", "gap-4");
    expect(root).not.toHaveClass("w-fit");
    expect(button).toHaveClass("inner-button-class");
  });
});
