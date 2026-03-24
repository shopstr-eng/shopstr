import { useEffect, useState } from "react";
import {
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  BanknotesIcon,
  BoltIcon,
  ShoppingBagIcon,
} from "@heroicons/react/24/outline";
import { getLocalStorageData } from "@/utils/nostr/nostr-helper-functions";
import { Transaction } from "@/utils/types/types";

const Transactions = () => {
  const [history, setHistory] = useState([]);

  useEffect(() => {
    // Function to fetch and update transactions
    const fetchAndUpdateTransactions = () => {
      const localData = getLocalStorageData();
      if (localData && localData.history) {
        setHistory(localData.history);
      }
    };
    // Initial fetch
    fetchAndUpdateTransactions();
    // Set up polling with setInterval
    const interval = setInterval(() => {
      fetchAndUpdateTransactions();
    }, 2100); // Polling every 2100 milliseconds (2.1 seconds)
    // Clean up on component unmount
    return () => clearInterval(interval);
  }, []);

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    const options: Intl.DateTimeFormatOptions = {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    };
    return `${date.toLocaleDateString("en-US", options)}`;
  };

  return (
    <div className="w-full">
      <div className="max-h-[50vh] overflow-auto">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 border-b-2 border-white/20 bg-primary-blue text-xs uppercase text-white">
            <tr>
              <th scope="col" className="px-6 py-4 font-bold">
                TYPE
              </th>
              <th scope="col" className="px-6 py-4 font-bold">
                AMOUNT
              </th>
              <th scope="col" className="px-6 py-4 font-bold">
                DATE
              </th>
            </tr>
          </thead>
          <tbody>
            {history.length > 0 ? (
              history.map((transaction: Transaction, index) => (
                <tr
                  key={index}
                  className="border-b border-white/10 bg-primary-blue text-white transition-colors hover:bg-primary-blue/90"
                >
                  <td className="flex items-center px-6 py-4">
                    {transaction.type === 1 ? (
                      <ArrowDownTrayIcon className="mr-2 h-5 w-5 text-green-400" />
                    ) : transaction.type === 2 ? (
                      <ArrowUpTrayIcon className="mr-2 h-5 w-5 text-red-400" />
                    ) : transaction.type === 3 ? (
                      <BanknotesIcon className="mr-2 h-5 w-5 text-green-400" />
                    ) : transaction.type === 4 ? (
                      <BoltIcon className="mr-2 h-5 w-5 text-red-400" />
                    ) : transaction.type === 5 ? (
                      <ShoppingBagIcon className="mr-2 h-5 w-5 text-white" />
                    ) : null}
                  </td>
                  <td className="px-6 py-4">{transaction.amount} sats</td>
                  <td className="px-6 py-4 text-sm">
                    {formatDate(transaction.date)}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={3} className="px-6 py-8 text-center text-white/70">
                  No transactions yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Transactions;
