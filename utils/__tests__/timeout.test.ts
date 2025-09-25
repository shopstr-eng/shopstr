import { newPromiseWithTimeout } from "../timeout";

jest.useFakeTimers();

describe("newPromiseWithTimeout", () => {
  beforeEach(() => {
    jest.clearAllTimers();
  });

  it("should resolve successfully when the callback resolves before the timeout", async () => {
    const promise = newPromiseWithTimeout<string>(
      (resolve) => {
        resolve("success");
      },
      { timeout: 1000 }
    );

    await expect(promise).resolves.toBe("success");
  });

  it("should reject with a Timeout error if the callback does not resolve in time", async () => {
    const promise = newPromiseWithTimeout<void>(() => {}, { timeout: 500 });

    jest.runAllTimers();

    await expect(promise).rejects.toThrow("Timeout");
  });

  it("should reject successfully when the callback rejects before the timeout", async () => {
    const customError = new Error("Custom rejection");
    const promise = newPromiseWithTimeout<void>(
      (resolve, reject) => {
        reject(customError);
      },
      { timeout: 1000 }
    );

    await expect(promise).rejects.toThrow("Custom rejection");
  });

  it("should clear the timeout when the promise resolves", () => {
    const clearTimeoutSpy = jest.spyOn(global, "clearTimeout");

    newPromiseWithTimeout<void>((resolve) => {
      resolve();
    });

    expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
    clearTimeoutSpy.mockRestore();
  });

  it("should clear the timeout when the promise rejects", () => {
    const clearTimeoutSpy = jest.spyOn(global, "clearTimeout");

    const promise = newPromiseWithTimeout<void>((resolve, reject) => {
      reject(new Error());
    });

    expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);

    promise.catch(() => {});
    clearTimeoutSpy.mockRestore();
  });

  it("should abort the AbortSignal on timeout", async () => {
    const abortListener = jest.fn();

    const promise = newPromiseWithTimeout<void>(
      (resolve, reject, abortSignal) => {
        abortSignal.addEventListener("abort", abortListener);
      },
      { timeout: 500 }
    );

    jest.runAllTimers();

    expect(abortListener).toHaveBeenCalledTimes(1);

    await promise.catch(() => {});
  });

  it("should handle a callback that returns a resolving promise", async () => {
    const promise = newPromiseWithTimeout<string>(
      (resolve) => {
        setTimeout(() => resolve("inner success"), 500);
      },
      { timeout: 1000 }
    );

    jest.advanceTimersByTime(500);
    await expect(promise).resolves.toBe("inner success");
  }, 30000);

  it("should handle a callback that returns a rejecting promise", async () => {
    const innerError = new Error("inner rejection");
    const promise = newPromiseWithTimeout<string>(
      () => {
        return Promise.reject(innerError);
      },
      { timeout: 1000 }
    );

    await expect(promise).rejects.toThrow("inner rejection");
  });
});
