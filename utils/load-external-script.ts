const cache = new Map<string, Promise<void>>();

export function loadExternalScript(src: string): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  const existingPromise = cache.get(src);
  if (existingPromise) return existingPromise;
  const promise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${src}"]`
    );
    if (existing) {
      if (existing.dataset.loaded === "true") {
        resolve();
        return;
      }
      let settled = false;
      const onLoad = () => {
        if (settled) return;
        settled = true;
        existing.dataset.loaded = "true";
        resolve();
      };
      existing.addEventListener("load", onLoad, { once: true });
      existing.addEventListener(
        "error",
        () => {
          if (settled) return;
          settled = true;
          reject(new Error(`Failed to load ${src}`));
        },
        { once: true }
      );
      // Defensive: if the script already finished loading before listeners
      // attached, resolve after a microtask so consumers can proceed.
      setTimeout(() => {
        if (settled) return;
        if (existing.dataset.loaded === "true") {
          settled = true;
          resolve();
        }
      }, 0);
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => {
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = () => {
      cache.delete(src);
      reject(new Error(`Failed to load ${src}`));
    };
    document.body.appendChild(script);
  });
  cache.set(src, promise);
  return promise;
}
