import "@testing-library/jest-dom";
import { TextEncoder, TextDecoder } from "util";

jest.mock("@braintree/sanitize-url", () => ({
  sanitizeUrl: jest.fn((url) => (typeof url === "string" ? url : "")),
}));

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
