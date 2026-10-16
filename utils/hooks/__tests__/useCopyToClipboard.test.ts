import { act, renderHook } from "@testing-library/react";
import {
  COPY_FEEDBACK_DURATION_MS,
  useCopyToClipboard,
} from "../useCopyToClipboard";

describe("useCopyToClipboard", () => {
  let writeText: jest.Mock;

  beforeEach(() => {
    writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it("starts with copied set to false", () => {
    const { result } = renderHook(() => useCopyToClipboard());
    expect(result.current.copied).toBe(false);
  });

  it("writes text to the clipboard and reports success", async () => {
    const { result } = renderHook(() => useCopyToClipboard());

    let copied = false;
    await act(async () => {
      copied = await result.current.copy("hello");
    });

    expect(writeText).toHaveBeenCalledWith("hello");
    expect(copied).toBe(true);
    expect(result.current.copied).toBe(true);
  });

  it("resets copied after the feedback duration", async () => {
    jest.useFakeTimers();
    const { result } = renderHook(() => useCopyToClipboard());

    await act(async () => {
      await result.current.copy("hello");
    });

    expect(result.current.copied).toBe(true);

    act(() => {
      jest.advanceTimersByTime(COPY_FEEDBACK_DURATION_MS);
    });

    expect(result.current.copied).toBe(false);
  });

  it("keeps copied true until the duration elapses", async () => {
    jest.useFakeTimers();
    const { result } = renderHook(() => useCopyToClipboard(500));

    await act(async () => {
      await result.current.copy("hello");
    });

    act(() => {
      jest.advanceTimersByTime(499);
    });

    expect(result.current.copied).toBe(true);

    act(() => {
      jest.advanceTimersByTime(1);
    });

    expect(result.current.copied).toBe(false);
  });

  it("restarts the feedback timer on repeated copies", async () => {
    jest.useFakeTimers();
    const { result } = renderHook(() => useCopyToClipboard(500));

    await act(async () => {
      await result.current.copy("first");
    });

    act(() => {
      jest.advanceTimersByTime(400);
    });

    await act(async () => {
      await result.current.copy("second");
    });

    act(() => {
      jest.advanceTimersByTime(400);
    });

    expect(result.current.copied).toBe(true);

    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(result.current.copied).toBe(false);
  });

  it("returns false and does not mark copied when the clipboard rejects", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    const { result } = renderHook(() => useCopyToClipboard());

    let copied = true;
    await act(async () => {
      copied = await result.current.copy("hello");
    });

    expect(copied).toBe(false);
    expect(result.current.copied).toBe(false);
  });

  it("returns false when the clipboard API is unavailable", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
    const { result } = renderHook(() => useCopyToClipboard());

    let copied = true;
    await act(async () => {
      copied = await result.current.copy("hello");
    });

    expect(copied).toBe(false);
    expect(result.current.copied).toBe(false);
  });

  it("clears the pending reset timer on unmount", async () => {
    jest.useFakeTimers();
    const { result, unmount } = renderHook(() => useCopyToClipboard());

    await act(async () => {
      await result.current.copy("hello");
    });

    unmount();

    expect(() => {
      act(() => {
        jest.advanceTimersByTime(COPY_FEEDBACK_DURATION_MS);
      });
    }).not.toThrow();
    expect(jest.getTimerCount()).toBe(0);
  });
});
