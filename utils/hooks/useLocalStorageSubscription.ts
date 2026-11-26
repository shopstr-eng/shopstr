import { type DependencyList, useEffect, useRef, useState } from "react";
import { type StorageIdentifier } from "@/utils/storage";
import { storageEmitter } from "@/utils/storage-emitter";

/**
 * Subscribe to a localStorage key for both same-tab writes (via storageEmitter)
 * and cross-tab writes (via window "storage" events).
 */
export function useLocalStorageSubscription<T>(
  key: StorageIdentifier,
  reader: () => T,
  initialValue: T,
  deps: DependencyList = []
): T {
  const [value, setValue] = useState<T>(initialValue);
  const readerRef = useRef(reader);
  readerRef.current = reader;

  useEffect(() => {
    if (typeof window === "undefined") return;

    const sync = () => {
      setValue(readerRef.current());
    };

    sync();

    const unsubscribe = storageEmitter.on(key, sync);
    const handleStorage = (event: StorageEvent) => {
      if (event.key === key || event.key === null) {
        sync();
      }
    };
    window.addEventListener("storage", handleStorage);

    return () => {
      unsubscribe();
      window.removeEventListener("storage", handleStorage);
    };
  }, [key, ...deps]);

  return value;
}
