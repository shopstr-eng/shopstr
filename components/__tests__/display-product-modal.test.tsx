import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import DisplayProductModal from "../display-product-modal";
import { ProductData } from "@/utils/parsers/product-parser-functions";

// ── Module mocks ──────────────────────────────────────────────────────────────

jest.mock(
  "@heroui/react",
  () => {
    const React = require("react");
    const passthrough = ({ children }: any) =>
      React.createElement("div", null, children);
    return {
      Modal: ({ isOpen, children }: any) =>
        isOpen
          ? React.createElement("div", { role: "dialog" }, children)
          : null,
      ModalContent: passthrough,
      ModalHeader: passthrough,
      ModalBody: passthrough,
      ModalFooter: passthrough,
      Button: ({ children, onClick }: any) =>
        React.createElement("button", { onClick }, children),
      Chip: passthrough,
      Divider: () => React.createElement("hr"),
    };
  },
  { virtual: true }
);

jest.mock("@heroicons/react/24/outline", () => ({
  PencilSquareIcon: () => null,
  ShareIcon: () => null,
  TrashIcon: () => null,
}));

jest.mock("../product-form", () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock("../utility-components/image-carousel", () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock("../utility-components/compact-categories", () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock("../utility-components/dropdowns/location-dropdown", () => ({
  locationAvatar: () => null,
}));
jest.mock("../utility-components/modals/confirm-action-modal", () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock("../utility-components/profile/profile-dropdown", () => ({
  ProfileWithDropdown: () => null,
}));
jest.mock("../utility-components/success-modal", () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock("@/utils/hooks/useCopyToClipboard", () => ({
  useCopyToClipboard: () => ({ copy: jest.fn() }),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const baseProduct: ProductData = {
  id: "product-id",
  pubkey: "seller-pubkey",
  createdAt: 1700000000,
  title: "Handmade mug",
  summary: "A ceramic mug",
  publishedAt: "1700000000",
  images: [],
  categories: [],
  location: "Online",
  price: 1000,
  currency: "sats",
  totalCost: 1000,
} as ProductData;

const renderModal = (productData: ProductData) =>
  render(
    <DisplayProductModal
      productData={productData}
      showModal
      handleModalToggle={jest.fn()}
      handleDelete={jest.fn()}
    />
  );

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("DisplayProductModal quantity", () => {
  it("shows the quantity when it is set", () => {
    renderModal({ ...baseProduct, quantity: 5 });

    expect(screen.getByText("Quantity:")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("shows a quantity of 0 instead of a stray 0", () => {
    renderModal({ ...baseProduct, quantity: 0 });

    // `{quantity && ...}` used to render a bare "0" and drop this row
    expect(screen.getByText("Quantity:")).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("shows no quantity row when the listing has no quantity", () => {
    renderModal(baseProduct);

    expect(screen.queryByText("Quantity:")).not.toBeInTheDocument();
  });
});
