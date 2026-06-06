import { render, screen, act, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import Transactions from "../transactions";
import { getLocalStorageData } from "@/utils/nostr/nostr-helper-functions";
import { Transaction } from "@/utils/types/types";

jest.mock("@/utils/nostr/nostr-helper-functions", () => ({
  getLocalStorageData: jest.fn(() => ({ history: [] })),
}));

const mockedGetLocalStorageData = getLocalStorageData as jest.Mock;

describe("Transactions", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it("should render headers but no transactions when history is empty", () => {
    render(<Transactions />);
    expect(screen.getByText("TYPE")).toBeInTheDocument();
    expect(screen.getByText("AMOUNT")).toBeInTheDocument();
    expect(screen.getByText("DATE")).toBeInTheDocument();
    expect(screen.getByText("No transactions yet.")).toBeInTheDocument();
    // header row + empty-state row
    expect(screen.queryAllByRole("row")).toHaveLength(2);
  });

  it("should render transactions from localStorage on initial load", () => {
    const mockHistory: Transaction[] = [
      { type: 1, amount: 1000, date: 1721915400 }, // Deposit
      { type: 2, amount: 500, date: 1721915500 }, // Withdraw
    ];
    mockedGetLocalStorageData.mockReturnValue({ history: mockHistory });

    render(<Transactions />);

    expect(screen.getByText("1000 sats")).toBeInTheDocument();
    expect(screen.getByText("500 sats")).toBeInTheDocument();
    expect(screen.getByText("📥")).toBeInTheDocument();
    expect(screen.getByText("📤")).toBeInTheDocument();
  });

  it("should correctly render an icon for each transaction type", () => {
    const mockHistory: Transaction[] = [
      { type: 1, amount: 100, date: 1721915400 }, // Deposit
      { type: 2, amount: 100, date: 1721915400 }, // Withdraw
      { type: 3, amount: 100, date: 1721915400 }, // Nutsack
      { type: 4, amount: 100, date: 1721915400 }, // Lightning
      { type: 5, amount: 100, date: 1721915400 }, // Purchase
    ];
    mockedGetLocalStorageData.mockReturnValue({ history: mockHistory });

    render(<Transactions />);

    expect(screen.getByText("📥")).toBeInTheDocument();
    expect(screen.getByText("📤")).toBeInTheDocument();
    expect(screen.getByText("🥜")).toBeInTheDocument();
    expect(screen.getByText("⚡")).toBeInTheDocument();
    expect(screen.getByText("🛍️")).toBeInTheDocument();
  });

  it("should poll for new transactions and update the view", async () => {
    const initialHistory: Transaction[] = [
      { type: 1, amount: 100, date: 1721915400 },
    ];
    mockedGetLocalStorageData.mockReturnValue({ history: initialHistory });
    render(<Transactions />);

    expect(screen.getByText("100 sats")).toBeInTheDocument();
    expect(screen.queryByText("200 sats")).not.toBeInTheDocument();

    const updatedHistory: Transaction[] = [
      ...initialHistory,
      { type: 2, amount: 200, date: 1721915500 },
    ];
    mockedGetLocalStorageData.mockReturnValue({ history: updatedHistory });

    act(() => {
      jest.advanceTimersByTime(2100);
    });

    await waitFor(() => {
      expect(screen.getByText("200 sats")).toBeInTheDocument();
    });
    expect(mockedGetLocalStorageData).toHaveBeenCalledTimes(2);
  });

  it("should clean up the interval on component unmount", () => {
    const clearIntervalSpy = jest.spyOn(global, "clearInterval");

    const { unmount } = render(<Transactions />);

    unmount();

    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
  });
});
