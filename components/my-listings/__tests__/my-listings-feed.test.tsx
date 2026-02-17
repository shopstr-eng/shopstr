import { render, screen, fireEvent, act } from "@testing-library/react";
import "@testing-library/jest-dom";
import MyListingsFeed from "../my-listings-feed";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";

jest.mock("../my-listings", () => {
  const MockMyListingsPage = () => <div data-testid="my-listings-page-mock" />;
  MockMyListingsPage.displayName = "MyListingsPage";
  return MockMyListingsPage;
});

jest.mock("../../product-form", () => {
  const MockProductForm = ({
    showModal,
    handleModalToggle,
  }: {
    showModal: boolean;
    handleModalToggle: () => void;
  }) => (
    <div data-testid="product-form-mock">
      {showModal && <div data-testid="modal-content">Modal is Open</div>}
      <button onClick={handleModalToggle}>Close Modal</button>
    </div>
  );
  MockProductForm.displayName = "ProductForm";
  return MockProductForm;
});

const mockRouterPush = jest.fn();
jest.mock("next/router", () => ({
  useRouter: () => ({
    push: mockRouterPush,
  }),
}));

const mockSearchParams = {
  has: jest.fn(),
};
jest.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams,
}));

const renderComponent = (isLoggedIn: boolean, hasQueryParam: boolean) => {
  mockSearchParams.has.mockReturnValue(hasQueryParam);
  return render(
    <SignerContext.Provider
      value={{
        isLoggedIn,
        login: jest.fn(),
        logout: jest.fn(),
        nostrUser: null,
      }}
    >
      <MyListingsFeed />
    </SignerContext.Provider>
  );
};

describe("MyListingsFeed", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("renders child components and modal is initially closed", () => {
    renderComponent(false, false);

    expect(screen.getByTestId("my-listings-page-mock")).toBeInTheDocument();
    expect(screen.getByTestId("product-form-mock")).toBeInTheDocument();

    expect(screen.queryByTestId("modal-content")).not.toBeInTheDocument();
  });

  test("shows modal on load if user is logged in and 'addNewListing' param is present", () => {
    renderComponent(true, true);

    expect(screen.getByTestId("modal-content")).toBeInTheDocument();
    expect(screen.getByText("Modal is Open")).toBeInTheDocument();
  });

  test("does not show modal if user is not logged in, even with param", () => {
    renderComponent(false, true);

    expect(screen.queryByTestId("modal-content")).not.toBeInTheDocument();
  });

  test("does not show modal if user is logged in but param is absent", () => {
    renderComponent(true, false);

    expect(screen.queryByTestId("modal-content")).not.toBeInTheDocument();
  });

  test("hides modal and calls router.push when toggle handler is invoked", () => {
    renderComponent(true, true);
    expect(screen.getByTestId("modal-content")).toBeInTheDocument();

    const closeButton = screen.getByText("Close Modal");

    act(() => {
      fireEvent.click(closeButton);
    });

    expect(mockRouterPush).toHaveBeenCalledWith("");
    expect(mockRouterPush).toHaveBeenCalledTimes(1);

    expect(screen.queryByTestId("modal-content")).not.toBeInTheDocument();
  });
});
