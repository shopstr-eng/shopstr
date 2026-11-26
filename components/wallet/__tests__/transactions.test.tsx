import { render, screen, act } from "@testing-library/react";
import "@testing-library/jest-dom";
import Transactions from "../transactions";
import { Transaction } from "@/utils/types/types";
import { storage, STORAGE_KEYS } from "@/utils/storage";

jest.mock("@heroicons/react/24/outline", () => ({
  ArrowDownTrayIcon: () => <div data-testid="icon-deposit" />,
  ArrowUpTrayIcon: () => <div data-testid="icon-withdraw" />,
  BanknotesIcon: () => <div data-testid="icon-nutsack" />,
  BoltIcon: () => <div data-testid="icon-lightning" />,
  ShoppingBagIcon: () => <div data-testid="icon-purchase" />,
}));

// No more mocks needed for getLocalStorageData as we use StorageManager now

describe("Transactions", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    window.localStorage.clear();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it("should render headers but no transactions when history is empty", () => {
    render(<Transactions />);
    expect(screen.getByText("Type")).toBeInTheDocument();
    expect(screen.getByText("Amount")).toBeInTheDocument();
    expect(screen.getByText("Date")).toBeInTheDocument();
    expect(screen.queryAllByRole("row")).toHaveLength(1);
  });

  it("should render transactions from localStorage on initial load", () => {
    const mockHistory: Transaction[] = [
      { type: 1, amount: 1000, date: 1721915400 }, // Deposit
      { type: 2, amount: 500, date: 1721915500 }, // Withdraw
    ];
    window.localStorage.setItem("history", JSON.stringify(mockHistory));

    render(<Transactions />);

    expect(screen.getByText("1000 sats")).toBeInTheDocument();
    expect(screen.getByText("500 sats")).toBeInTheDocument();
    expect(screen.getByTestId("icon-deposit")).toBeInTheDocument();
    expect(screen.getByTestId("icon-withdraw")).toBeInTheDocument();
  });

  it("should correctly render an icon for each transaction type", () => {
    const mockHistory: Transaction[] = [
      { type: 1, amount: 100, date: 1721915400 }, // Deposit
      { type: 2, amount: 100, date: 1721915400 }, // Withdraw
      { type: 3, amount: 100, date: 1721915400 }, // Nutsack
      { type: 4, amount: 100, date: 1721915400 }, // Lightning
      { type: 5, amount: 100, date: 1721915400 }, // Purchase
    ];
    window.localStorage.setItem("history", JSON.stringify(mockHistory));

    render(<Transactions />);

    expect(screen.getByTestId("icon-deposit")).toBeInTheDocument();
    expect(screen.getByTestId("icon-withdraw")).toBeInTheDocument();
    expect(screen.getByTestId("icon-nutsack")).toBeInTheDocument();
    expect(screen.getByTestId("icon-lightning")).toBeInTheDocument();
    expect(screen.getByTestId("icon-purchase")).toBeInTheDocument();
  });

  it("should update the view when new transactions are written to storage", () => {
    const initialHistory: Transaction[] = [
      { type: 1, amount: 100, date: 1721915400 },
    ];
    storage.setJson(STORAGE_KEYS.HISTORY, initialHistory);
    render(<Transactions />);

    expect(screen.getByText("100 sats")).toBeInTheDocument();
    expect(screen.queryByText("200 sats")).not.toBeInTheDocument();

    const updatedHistory: Transaction[] = [
      ...initialHistory,
      { type: 2, amount: 200, date: 1721915500 },
    ];

    act(() => {
      storage.setJson(STORAGE_KEYS.HISTORY, updatedHistory);
    });

    expect(screen.getByText("200 sats")).toBeInTheDocument();
  });

  it("should clean up storage listeners on component unmount", () => {
    const removeEventListenerSpy = jest.spyOn(window, "removeEventListener");

    const { unmount } = render(<Transactions />);

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      "storage",
      expect.any(Function)
    );
  });
});
