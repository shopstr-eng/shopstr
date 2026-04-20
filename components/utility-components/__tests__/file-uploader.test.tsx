import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { FileUploaderButton } from "../file-uploader";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import {
  blossomUploadImages,
  getLocalStorageData,
} from "@/utils/nostr/nostr-helper-functions";

jest.mock("@/utils/nostr/nostr-helper-functions", () => ({
  blossomUploadImages: jest.fn(),
  getLocalStorageData: jest.fn(),
}));

jest.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
}));

jest.mock("@heroicons/react/24/outline", () => ({
  PhotoIcon: () => <div data-testid="photo-icon" />,
  ArrowUpTrayIcon: () => <div data-testid="upload-icon" />,
  XCircleIcon: () => <div data-testid="failure-icon" />,
  XMarkIcon: () => <div data-testid="close-icon" />,
}));

jest.mock("@nextui-org/react", () => {
  const React = require("react");

  return {
    Button: ({
      children,
      onClick,
      disabled,
      isLoading,
      startContent,
      ...props
    }: any) => (
      <button onClick={onClick} disabled={disabled} data-loading={isLoading} {...props}>
        {startContent}
        {children}
      </button>
    ),
    Input: React.forwardRef(({ className, ...props }: any, ref) => (
      <input ref={ref} className={className} {...props} />
    )),
    Progress: ({ value, classNames, ...props }: any) => (
      <div aria-label="Upload progress" data-value={value} {...props} />
    ),
  };
});

const mockGetLocalStorageData = getLocalStorageData as jest.Mock;
const mockBlossomUploadImages = blossomUploadImages as jest.Mock;
const mockCreateObjectURL = jest.fn();
const mockRevokeObjectURL = jest.fn();

const flushPromises = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

const renderWithSigner = (ui: React.ReactElement, isLoggedIn = true) =>
  render(
    <SignerContext.Provider
      value={{
        signer: {} as any,
        isLoggedIn,
        isAuthStateResolved: true,
        pubkey: "pubkey",
        npub: "npub",
        newSigner: jest.fn(),
      }}
    >
      {ui}
    </SignerContext.Provider>
  );

describe("FileUploaderButton", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockGetLocalStorageData.mockReturnValue({ blossomServers: [] });
    mockBlossomUploadImages.mockResolvedValue([["url", "https://cdn.example/image.jpg"]]);
    mockCreateObjectURL.mockImplementation((file: File) => `blob:${file.name}`);
    mockRevokeObjectURL.mockImplementation(() => undefined);

    Object.defineProperty(URL, "createObjectURL", {
      writable: true,
      value: mockCreateObjectURL,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      writable: true,
      value: mockRevokeObjectURL,
    });

    Object.defineProperty(global, "createImageBitmap", {
      writable: true,
      value: jest.fn().mockResolvedValue({
        width: 200,
        height: 100,
        close: jest.fn(),
      }),
    });

    jest
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue({
        drawImage: jest.fn(),
        fillRect: jest.fn(),
      } as any);

    jest
      .spyOn(HTMLCanvasElement.prototype, "toBlob")
      .mockImplementation(function (
        callback: BlobCallback,
        type?: string
      ) {
        callback?.(new Blob(["image-bytes"], { type: type || "image/jpeg" }));
      });
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("renders the default upload CTA", () => {
    renderWithSigner(<FileUploaderButton imgCallbackOnUpload={jest.fn()} />);

    expect(
      screen.getByRole("button", { name: /upload banner/i })
    ).toBeInTheDocument();
  });

  it("shows a failure message and skips uploads when a non-image file is selected", async () => {
    const onUpload = jest.fn();
    const { container } = renderWithSigner(
      <FileUploaderButton imgCallbackOnUpload={onUpload} />
    );
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const invalidFile = new File(["hello"], "notes.txt", {
      type: "text/plain",
    });

    fireEvent.change(input, { target: { files: [invalidFile] } });

    await waitFor(() => {
      expect(
        screen.getByText("Only JPEG, PNG, or WebP images are supported!")
      ).toBeInTheDocument();
    });
    expect(onUpload).not.toHaveBeenCalled();
    expect(mockBlossomUploadImages).not.toHaveBeenCalled();
  });

  it("uploads a selected file, shows processing state, and clears progress when finished", async () => {
    let resolveUpload: ((value: string[][]) => void) | undefined;
    mockBlossomUploadImages.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveUpload = resolve;
        })
    );

    const onUpload = jest.fn();
    const { container } = renderWithSigner(
      <FileUploaderButton imgCallbackOnUpload={onUpload} />
    );
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const imageFile = new File(["image"], "banner.jpg", {
      type: "image/jpeg",
    });

    await act(async () => {
      fireEvent.change(input, { target: { files: [imageFile] } });
    });

    expect(await screen.findByText("Uploading 1 image")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("30%")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /upload banner/i })
      ).toBeDisabled();
    });
    expect(mockBlossomUploadImages).toHaveBeenCalledWith(
      expect.objectContaining({ name: "banner.jpg" }),
      expect.any(Object),
      ["https://cdn.nostrcheck.me"]
    );

    await act(async () => {
      resolveUpload?.([["url", "https://cdn.example/banner.jpg"]]);
      await Promise.resolve();
    });

    expect(onUpload).toHaveBeenCalledWith("https://cdn.example/banner.jpg");
    expect(await screen.findByText("100%")).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(500);
    });

    await waitFor(() => {
      expect(screen.queryByLabelText("Upload progress")).not.toBeInTheDocument();
    });
    expect(mockRevokeObjectURL).toHaveBeenCalledWith("blob:banner.jpg");
    expect(input.value).toBe("");
  });

  it("uploads multiple selected files and emits each returned URL", async () => {
    mockGetLocalStorageData.mockReturnValue({
      blossomServers: ["https://blossom.example"],
    });
    mockBlossomUploadImages
      .mockResolvedValueOnce([["url", "https://blossom.example/first.jpg"]])
      .mockResolvedValueOnce([["url", "https://blossom.example/second.jpg"]]);

    const onUpload = jest.fn();
    const { container } = renderWithSigner(
      <FileUploaderButton imgCallbackOnUpload={onUpload} isProductUpload />
    );
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const firstFile = new File(["first"], "first.jpg", {
      type: "image/jpeg",
    });
    const secondFile = new File(["second"], "second.webp", {
      type: "image/webp",
    });

    await act(async () => {
      fireEvent.change(input, { target: { files: [firstFile, secondFile] } });
    });

    expect(await screen.findByText("Uploading 2 images")).toBeInTheDocument();

    await waitFor(() => {
      expect(onUpload).toHaveBeenNthCalledWith(
        1,
        "https://blossom.example/first.jpg"
      );
      expect(onUpload).toHaveBeenNthCalledWith(
        2,
        "https://blossom.example/second.jpg"
      );
    });

    expect(mockBlossomUploadImages).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ name: "first.jpg" }),
      expect.any(Object),
      ["https://blossom.example"]
    );
    expect(mockBlossomUploadImages).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ name: "second.webp" }),
      expect.any(Object),
      ["https://blossom.example"]
    );

    act(() => {
      jest.advanceTimersByTime(500);
    });

    await flushPromises();
    expect(mockRevokeObjectURL).toHaveBeenCalledWith("blob:first.jpg");
    expect(mockRevokeObjectURL).toHaveBeenCalledWith("blob:second.webp");
  });

  it("compresses oversized png uploads before sending them to Blossom", async () => {
    const oversizedPng = new File(["png"], "large.png", {
      type: "image/png",
    });
    Object.defineProperty(oversizedPng, "size", {
      configurable: true,
      value: 21 * 1024 * 1024,
    });

    const toBlobSpy = jest
      .spyOn(HTMLCanvasElement.prototype, "toBlob")
      .mockImplementationOnce(function (
        callback: BlobCallback,
        type?: string
      ) {
        callback?.(
          new Blob([new Uint8Array(21 * 1024 * 1024)], {
            type: type || "image/png",
          })
        );
      })
      .mockImplementationOnce(function (
        callback: BlobCallback,
        type?: string
      ) {
        callback?.(new Blob(["compressed"], { type: type || "image/jpeg" }));
      });

    const onUpload = jest.fn();
    const { container } = renderWithSigner(
      <FileUploaderButton imgCallbackOnUpload={onUpload} />
    );
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    await act(async () => {
      fireEvent.change(input, { target: { files: [oversizedPng] } });
    });

    await waitFor(() => {
      expect(mockBlossomUploadImages).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "large.jpg",
          type: "image/jpeg",
        }),
        expect.any(Object),
        ["https://cdn.nostrcheck.me"]
      );
    });

    expect(toBlobSpy).toHaveBeenCalled();
    expect(onUpload).toHaveBeenCalledWith("https://cdn.example/image.jpg");
  });

  it("shows a recoverable failure message when uploads return no url tags", async () => {
    mockBlossomUploadImages.mockResolvedValue([["x", "missing-url-tag"]]);

    const { container } = renderWithSigner(
      <FileUploaderButton imgCallbackOnUpload={jest.fn()} />
    );
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const imageFile = new File(["image"], "banner.jpg", {
      type: "image/jpeg",
    });

    await act(async () => {
      fireEvent.change(input, { target: { files: [imageFile] } });
    });

    expect(
      await screen.findByText(
        /Image upload failed to yield a URL! Change your Blossom media server/i
      )
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "" }));

    await waitFor(() => {
      expect(
        screen.queryByText(
          /Image upload failed to yield a URL! Change your Blossom media server/i
        )
      ).not.toBeInTheDocument();
    });
  });
});
