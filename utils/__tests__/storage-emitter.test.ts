import { storageEmitter } from "../storage-emitter";

describe("storageEmitter", () => {
  it("notifies listeners registered for the emitted key", () => {
    const cartListener = jest.fn();
    const tokensListener = jest.fn();

    const unsubCart = storageEmitter.on("cart", cartListener);
    const unsubTokens = storageEmitter.on("tokens", tokensListener);

    storageEmitter.emit("cart");
    expect(cartListener).toHaveBeenCalledTimes(1);
    expect(tokensListener).not.toHaveBeenCalled();

    unsubCart();
    unsubTokens();
  });

  it("stops notifying after unsubscribe", () => {
    const listener = jest.fn();
    const unsubscribe = storageEmitter.on("cart", listener);

    storageEmitter.emit("cart");
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    storageEmitter.emit("cart");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("notifies all listeners on emitAll", () => {
    const listenerA = jest.fn();
    const listenerB = jest.fn();

    const unsubA = storageEmitter.on("cart", listenerA);
    const unsubB = storageEmitter.on("history", listenerB);

    storageEmitter.emitAll();
    expect(listenerA).toHaveBeenCalledTimes(1);
    expect(listenerB).toHaveBeenCalledTimes(1);

    unsubA();
    unsubB();
  });
});
