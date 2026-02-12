import React, { useEffect, useState } from "react";
import {
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  BanknotesIcon,
  BoltIcon,
  ShoppingBagIcon,
} from "@heroicons/react/24/outline";
import { getLocalStorageData } from "@/utils/nostr/nostr-helper-functions";
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
    return date.toLocaleString("en-US", options);
  };

  return (
    <div className="relative mt-4 w-full overflow-x-auto rounded-2xl border border-white/5">
      <div className="max-h-[50vh] w-full min-w-[320px]">
        <table className="w-full text-left text-sm text-gray-400">
          <thead className="bg-[#1a1a1a] text-xs font-bold uppercase tracking-widest text-gray-500">
            <tr>
              <th scope="col" className="px-3 pb-3 pt-5 md:px-6">
                Type
              </th>
              <th scope="col" className="px-3 pb-3 pt-5 md:px-6">
                Amount
              </th>
              <th scope="col" className="px-3 pb-3 pt-5 text-right md:px-6">
                Date
              </th>
            </tr>
          </thead>
          <tbody>
            {history.map((transaction: Transaction, index) => (
              <tr
                key={index}
                className="border-b border-white/5 bg-transparent transition-colors hover:bg-white/5"
              >
                <td className="px-3 py-4 md:px-6">
                  <div className="flex items-center">
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
                  </div>
                </td>
                <td className="whitespace-nowrap px-3 py-4 font-mono font-bold text-white md:px-6">
                  {transaction.amount} sats
                </td>
                <td className="px-3 py-4 text-right font-mono text-[10px] leading-tight md:px-6 md:text-xs">
                  {formatDate(transaction.date)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Transactions;
