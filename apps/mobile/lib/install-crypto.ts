import * as ExpoCrypto from "expo-crypto";

type CryptoLike = {
  getRandomValues?: (typedArray: ArrayBufferView) => ArrayBufferView;
  randomUUID?: () => string;
};

type MessageEventLike<T = unknown> = {
  data: T;
};

type MessageListener = (event: MessageEventLike) => void;

class MessagePortPolyfill {
  onmessage: MessageListener | null = null;
  counterpart: MessagePortPolyfill | null = null;

  private listeners = new Set<MessageListener>();

  postMessage(data: unknown) {
    const targetPort = this.counterpart;
    if (!targetPort) {
      return;
    }

    setTimeout(() => {
      const event = { data };
      targetPort.onmessage?.(event);
      targetPort.listeners.forEach((listener) => {
        listener(event);
      });
    }, 0);
  }

  addEventListener(type: string, listener: MessageListener) {
    if (type === "message") {
      this.listeners.add(listener);
    }
  }

  removeEventListener(type: string, listener: MessageListener) {
    if (type === "message") {
      this.listeners.delete(listener);
    }
  }

  start() {
    // No-op for the RN polyfill. Messages are dispatched immediately.
  }

  close() {
    this.listeners.clear();
    this.onmessage = null;
  }
}

class MessageChannelPolyfill {
  port1: MessagePortPolyfill;
  port2: MessagePortPolyfill;

  constructor() {
    this.port1 = new MessagePortPolyfill();
    this.port2 = new MessagePortPolyfill();
    this.port1.counterpart = this.port2;
    this.port2.counterpart = this.port1;
  }
}

const globalWithCrypto = globalThis as unknown as {
  crypto?: CryptoLike;
  MessageChannel?: typeof MessageChannelPolyfill;
  MessagePort?: typeof MessagePortPolyfill;
};

const existingCrypto = globalWithCrypto.crypto ?? {};

if (typeof existingCrypto.getRandomValues !== "function") {
  existingCrypto.getRandomValues = (typedArray) =>
    ExpoCrypto.getRandomValues(typedArray as never) as ArrayBufferView;
}

if (typeof existingCrypto.randomUUID !== "function") {
  existingCrypto.randomUUID = () => ExpoCrypto.randomUUID();
}

globalWithCrypto.crypto = existingCrypto;

if (typeof globalWithCrypto.MessageChannel !== "function") {
  globalWithCrypto.MessageChannel = MessageChannelPolyfill;
}

if (typeof globalWithCrypto.MessagePort !== "function") {
  globalWithCrypto.MessagePort = MessagePortPolyfill;
}
