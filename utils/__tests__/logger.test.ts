import { createLogger } from "../logger";

describe("app logger", () => {
  const originalLevel = process.env.NEXT_PUBLIC_SHOPSTR_LOG_LEVEL;

  afterEach(() => {
    if (originalLevel === undefined) {
      delete process.env.NEXT_PUBLIC_SHOPSTR_LOG_LEVEL;
    } else {
      process.env.NEXT_PUBLIC_SHOPSTR_LOG_LEVEL = originalLevel;
    }
    jest.restoreAllMocks();
  });

  it("filters messages below the configured log level", () => {
    process.env.NEXT_PUBLIC_SHOPSTR_LOG_LEVEL = "info";
    const debugSpy = jest
      .spyOn(console, "debug")
      .mockImplementation(() => undefined);

    createLogger({ area: "test" }).debug("hidden debug");

    expect(debugSpy).not.toHaveBeenCalled();
  });

  it("emits structured browser log payloads", () => {
    process.env.NEXT_PUBLIC_SHOPSTR_LOG_LEVEL = "debug";
    const infoSpy = jest
      .spyOn(console, "info")
      .mockImplementation(() => undefined);

    createLogger({ area: "test" }).info("hello", { action: "sample" });

    expect(infoSpy).toHaveBeenCalledWith(
      "[shopstr]",
      expect.objectContaining({
        action: "sample",
        area: "test",
        level: "info",
        msg: "hello",
      })
    );
  });

  it("serializes errors into the payload", () => {
    process.env.NEXT_PUBLIC_SHOPSTR_LOG_LEVEL = "debug";
    const errorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    createLogger().error("failed", { action: "sample" }, new Error("boom"));

    expect(errorSpy).toHaveBeenCalledWith(
      "[shopstr]",
      expect.objectContaining({
        action: "sample",
        error: expect.objectContaining({ message: "boom" }),
        level: "error",
        msg: "failed",
      })
    );
  });
});
