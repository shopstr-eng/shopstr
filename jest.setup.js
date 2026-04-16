import "@testing-library/jest-dom";
import { TextEncoder, TextDecoder } from "util";

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

const originalWarn = console.warn;
const originalError = console.error;

const warnSpy = jest.spyOn(console, "warn").mockImplementation((...args) => {
  const warnString = args.toString();
  if (warnString.includes("Invoice check warning")) {
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

jest.mock("@heroui/ripple", () => {
  const React = jest.requireActual("react");
  return {
    Ripple: () => null,
    useRipple: () => ({
      ripples: [],
      onClear: jest.fn(),
      onPress: jest.fn(),
    }),
  };
}, { virtual: true });

jest.mock("framer-motion", () => {
  const actual = jest.requireActual("framer-motion");
  const React = jest.requireActual("react");
  return {
    ...actual,
    LazyMotion: ({ children }) =>
      React.createElement(React.Fragment, null, children),
    AnimatePresence: ({ children }) =>
      React.createElement(React.Fragment, null, children),
  };
});

jest.mock("@heroui/modal", () => {
  const React = jest.requireActual("react");
  const ReactDOM = jest.requireActual("react-dom");

  const extractText = (node) => {
    if (node == null || typeof node === "boolean") return "";
    if (typeof node === "string" || typeof node === "number")
      return String(node);
    if (Array.isArray(node)) return node.map(extractText).join(" ").trim();
    if (React.isValidElement(node)) return extractText(node.props?.children);
    return "";
  };

  const findHeaderText = (node) => {
    if (node == null || typeof node === "boolean") return "";
    if (Array.isArray(node)) {
      for (const child of node) {
        const result = findHeaderText(child);
        if (result) return result;
      }
      return "";
    }
    if (!React.isValidElement(node)) return "";
    if (node.type === ModalHeader) return extractText(node.props?.children);
    return findHeaderText(node.props?.children);
  };

  const wrap =
    (Component) =>
    ({ children, isOpen = true, ...props }) =>
      isOpen ? React.createElement(Component, props, children) : null;

  const ModalHeader = wrap("div");
  const ModalContent = wrap("div");
  const ModalBody = wrap("div");
  const ModalFooter = wrap("div");

  const Modal = ({ children, isOpen = true, ...props }) => {
    const portalRoot = React.useMemo(() => {
      const element = document.createElement("div");
      document.body.appendChild(element);
      return element;
    }, []);

    React.useEffect(() => {
      if (!isOpen) return undefined;

      const siblings = Array.from(document.body.children).filter(
        (child) => child !== portalRoot
      );
      const previousValues = siblings.map((child) =>
        child.getAttribute("aria-hidden")
      );

      siblings.forEach((child) => child.setAttribute("aria-hidden", "true"));

      return () => {
        siblings.forEach((child, index) => {
          const previousValue = previousValues[index];
          if (previousValue === null) {
            child.removeAttribute("aria-hidden");
          } else {
            child.setAttribute("aria-hidden", previousValue);
          }
        });
      };
    }, [isOpen, portalRoot]);

    React.useEffect(
      () => () => {
        portalRoot.remove();
      },
      [portalRoot]
    );

    if (!isOpen) return null;

    const ariaLabel = findHeaderText(children) || props["aria-label"];

    return ReactDOM.createPortal(
      React.createElement(
        "div",
        { role: "dialog", "aria-label": ariaLabel, ...props },
        React.createElement(
          "button",
          {
            type: "button",
            "aria-label": "Close",
            onClick: props.onClose,
          },
          "Close"
        ),
        children
      ),
      portalRoot
    );
  };

  return {
    Modal,
    ModalContent,
    ModalBody,
    ModalFooter,
    ModalHeader,
  };
}, { virtual: true });
