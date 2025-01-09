import React, { useEffect, useState } from "react";
import {
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  BanknotesIcon,
  BoltIcon,
  ShoppingBagIcon,
} from "@heroicons/react/24/outline";
import { getLocalStorageData } from "../../components/utility/nostr-helper-functions";
import { Transaction } from "@/utils/types/types";

// add found proofs as nutsack deposit with different icon

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
    <div className="relative mt-4 overflow-x-auto rounded-lg shadow-md">
      <div className="max-h-[50vh]">
        <table className="w-full min-w-[50vw] text-left text-sm text-gray-500 dark:text-gray-400">
          <thead className="bg-gray-50 text-xs uppercase text-gray-700 dark:bg-gray-700 dark:text-gray-400">
            <tr>
              <th scope="col" className="px-6 py-3">
                Type
              </th>
              <th scope="col" className="px-6 py-3">
                Amount
              </th>
              <th scope="col" className="px-6 py-3">
                Date
              </th>
            </tr>
          </thead>
          <tbody>
            {history.map((transaction: Transaction, index) => (
              <tr
                key={index}
                className="border-b bg-white dark:border-gray-700 dark:bg-gray-800"
              >
                <td className="flex items-center px-6 py-4">
                  {transaction.type === 1 ? (
                    <ArrowDownTrayIcon className="mr-2 h-5 w-5 text-green-500" />
                  ) : transaction.type === 2 ? (
                    <ArrowUpTrayIcon className="mr-2 h-5 w-5 text-red-500" />
                  ) : transaction.type === 3 ? (
                    <BanknotesIcon className="mr-2 h-5 w-5 text-green-500" />
                  ) : transaction.type === 4 ? (
                    <BoltIcon className="mr-2 h-5 w-5 text-red-500" />
                  ) : transaction.type === 5 ? (
                    <ShoppingBagIcon className="mr-2 h-5 w-5 text-shopstr-purple-light dark:text-shopstr-yellow-light" />
                  ) : null}
                </td>
                <td className="px-6 py-4">{transaction.amount} sats</td>
                <td className="px-6 py-4">{formatDate(transaction.date)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Transactions;
