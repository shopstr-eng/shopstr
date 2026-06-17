import { fireEvent, render, screen } from "@testing-library/react";
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
    Input: ({
      isDisabled,
      onChange,
      onKeyDown,
      placeholder,
      type,
      value,
    }: any) => (
      <input
        disabled={isDisabled}
        onChange={onChange}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        type={type}
        value={value}
      />
    ),
  }),
  { virtual: true }
);

jest.mock("@/utils/nostr/nostr-helper-functions", () => ({
  blossomUploadImages: jest.fn(),
  getLocalStorageData: jest.fn(() => ({})),
}));

jest.mock("@heroicons/react/24/outline", () => ({
  PhotoIcon: (props: any) => <svg data-testid="photo-icon" {...props} />,
  ArrowUpTrayIcon: (props: any) => (
    <svg data-testid="arrow-up-tray-icon" {...props} />
  ),
  LinkIcon: (props: any) => <svg data-testid="link-icon" {...props} />,
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

  test("accepts a pasted HTTPS image URL when enabled", () => {
    const onUpload = jest.fn();
    render(
      <FileUploaderButton allowUrlInput imgCallbackOnUpload={onUpload}>
        Upload Banner
      </FileUploaderButton>
    );

    fireEvent.change(screen.getByPlaceholderText(/paste an image url/i), {
      target: { value: "  https://cdn.example.com/banner.png  " },
    });
    fireEvent.click(screen.getByRole("button", { name: /Use URL/i }));

    expect(onUpload).toHaveBeenCalledWith("https://cdn.example.com/banner.png");
    expect(screen.getByPlaceholderText(/paste an image url/i)).toHaveValue("");
  });

  test("rejects pasted non-HTTPS URLs", () => {
    const onUpload = jest.fn();
    render(
      <FileUploaderButton allowUrlInput imgCallbackOnUpload={onUpload}>
        Upload Banner
      </FileUploaderButton>
    );

    fireEvent.change(screen.getByPlaceholderText(/paste an image url/i), {
      target: { value: "http://cdn.example.com/banner.png" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Use URL/i }));

    expect(onUpload).not.toHaveBeenCalled();
    expect(
      screen.getByText("Please enter a valid image URL starting with https://.")
    ).toBeInTheDocument();
  });
});
