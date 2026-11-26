type StorageListener = () => void;

class StorageEmitter {
  private listeners = new Map<string, Set<StorageListener>>();

  on(key: string, listener: StorageListener): () => void {
    let keyListeners = this.listeners.get(key);
    if (!keyListeners) {
      keyListeners = new Set();
      this.listeners.set(key, keyListeners);
    }
    keyListeners.add(listener);

    return () => {
      this.off(key, listener);
    };
  }

  off(key: string, listener: StorageListener): void {
    const keyListeners = this.listeners.get(key);
    if (!keyListeners) return;
    keyListeners.delete(listener);
    if (keyListeners.size === 0) {
      this.listeners.delete(key);
    }
  }

  emit(key: string): void {
    const keyListeners = this.listeners.get(key);
    if (!keyListeners) return;
    for (const listener of Array.from(keyListeners)) {
      listener();
    }
  }

  emitAll(): void {
    for (const keyListeners of Array.from(this.listeners.values())) {
      for (const listener of Array.from(keyListeners)) {
        listener();
      }
    }
  }
}

export const storageEmitter = new StorageEmitter();
