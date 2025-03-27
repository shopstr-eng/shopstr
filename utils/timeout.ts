/**
 * The callback function that will be called when the promise is created
 * @param resolve - The function that will be called to resolve the promise
 * @param reject - The function that will be called to reject the promise
 * @param abortSignal - The AbortSignal that will be triggered when the promise is aborted
 */
export type PromiseWithTimeoutCallback<T> = (
  resolve: (val: T) => void,
  reject: (err: Error) => void,
  abortSignal: AbortSignal
) => any;

/**
 * Create a new promise that will be rejected after a timeout
 * @param callback - The function that will be called with the resolve and reject functions of the promise and an AbortSignal
 * @param param1
 * @returns
 */
export async function newPromiseWithTimeout<T>(
  callback: PromiseWithTimeoutCallback<T>,
  { timeout = 60000 }: { timeout?: number } = {}
): Promise<T> {
  return await new Promise<T>(
    (resolve: (val: T) => void, reject: (err: Error) => void) => {
      const abortController = new AbortController();
      const abortSignal = abortController.signal;

      const timeoutId = setTimeout(() => {
        abortController.abort();
        reject(new Error("Timeout"));
      }, timeout);

      function wrap<X>(f: (val: X) => void): (val: X) => void {
        return (val: X) => {
          clearTimeout(timeoutId);
          f(val);
        };
      }
      const p = callback(wrap<T>(resolve), wrap<Error>(reject), abortSignal);
      if (p && p instanceof Promise) {
        p.catch((err) => wrap<Error>(reject)(err));
      }
    }
  );
}
