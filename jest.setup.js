import "@testing-library/jest-dom";
import { TextEncoder, TextDecoder } from "util";

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

const originalWarn = console.warn;
const originalError = console.error;

const warnSpy = jest.spyOn(console, "warn").mockImplementation((...args) => {
  const warnString = args.toString();
  if (
    warnString.includes("IndexedDB is not available") ||
    warnString.includes("Invoice check warning")
  ) {
    return;
  }
  originalWarn(...args);
});

const errorSpy = jest.spyOn(console, "error").mockImplementation((...args) => {
  const errorString = args.toString();
  if (
    errorString.includes("validateDOMNesting") ||
    errorString.includes("An update to") ||
    errorString.includes("React does not recognize the") ||
    errorString.includes("Received `false` for a non-boolean attribute") ||
    errorString.includes("disableSkeleton")
  ) {
    return;
  }
  originalError(...args);
});

afterAll(() => {
  warnSpy.mockRestore();
  errorSpy.mockRestore();
});

jest.mock("@braintree/sanitize-url", () => ({
  sanitizeUrl: jest.fn((url) => (typeof url === "string" ? url : "")),
}));

