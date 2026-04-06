import { act, renderHook } from "@testing-library/react";
import { useDebounce } from "../useDebounce";

describe("useDebounce", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it("returns initial value immediately", () => {
    const { result } = renderHook(() => useDebounce("hello", 300));
    expect(result.current).toBe("hello");
  });

  it("does not update value before delay", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 300),
      { initialProps: { value: "initial" } }
    );

    rerender({ value: "updated" });

    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(result.current).toBe("initial");
  });

  it("updates value after delay", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 300),
      { initialProps: { value: "initial" } }
    );

    rerender({ value: "updated" });

    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(result.current).toBe("updated");
  });

  it("cancels previous timer on rapid updates", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 300),
      { initialProps: { value: "a" } }
    );

    rerender({ value: "b" });

    act(() => {
      jest.advanceTimersByTime(100);
    });

    rerender({ value: "c" });

    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(result.current).toBe("c");
  });

  it("works with number type", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 200),
      { initialProps: { value: 1 } }
    );

    rerender({ value: 42 });

    act(() => {
      jest.advanceTimersByTime(200);
    });

    expect(result.current).toBe(42);
  });
});
