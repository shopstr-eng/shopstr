import React from "react";
import { WalletTx } from "lwk_wasm";
import { shortenString } from "../utility/wallet-helper";

const Transactions = ({ transactions }: { transactions: WalletTx[]}) => {

    // convert a unix timestamp to human readable elapsed time, like "1 day ago"
  function elapsedFrom(unixTs: any) {
    const currentUnixTs = new Date().getTime() / 1000.0
    const delta = currentUnixTs - unixTs

    const secondsPer = [31536000, 2592000, 604800, 86400, 3600, 60, 1];
    const namesPer = ["year", "month", "week", "day", "hour", "minute", "second"];

    function numberEnding(number: any) {
        return (number > 1) ? 's' : ''
    }

    for (let i = 0; i < secondsPer.length; i++) {
        let current = Math.floor(delta / secondsPer[i])
        if (current) {
            return current + ' ' + namesPer[i] + numberEnding(current) + ' ago'

        }
    }

    return 'now';
  }
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

  const txs = transactions?.map((tx) => {
    return {
      txIdUnblindedUrl: tx.unblindedUrl("https://blockstream.info/liquidtestnet/"),
      txId: tx.txid().toString(),
      txAmount: tx.balance().values().next().value as bigint,
      txDate: (typeof tx.timestamp() === 'undefined') ? "unconfirmed" : elapsedFrom(tx.timestamp())
    }
  });

  return (
    <div className="relative mt-4 overflow-x-auto rounded-lg shadow-md">
      <div className="max-h-[50vh] px-3">
        <table className="w-full min-w-[50vw] text-left text-sm text-gray-500 dark:text-gray-400 max-w-3xl">
          <thead className="bg-gray-50 text-xs uppercase text-gray-700 dark:bg-gray-700 dark:text-gray-400">
            <tr>
              <th scope="col" className="px-6 py-3">
                Amount
              </th>
              <th scope="col" className="px-6 py-3">
                txid
              </th>
              <th scope="col" className="px-6 py-3">
                Date
              </th>
            </tr>
          </thead>
          <tbody className="px-0 mx-0 text-xs lg:text-md">
            {txs?.map((tx, index) => (
              <tr
                key={index}
                className="border-b bg-white dark:border-gray-700 dark:bg-gray-800 px-0 mx-0"
              >
                <td className={`px-6 py-4 ${tx.txAmount > 0 ? 'text-lime-200' : 'text-red-200'}`}>
                  {tx.txAmount > 0 ? `+ ${tx.txAmount.toLocaleString()}` : `- ${tx.txAmount.toLocaleString()}`} Sats
                </td>
                <td className="px-6 py-4">
                  <a href={`${tx.txIdUnblindedUrl}`} className="text-cyan-300" target="_blank">{shortenString(tx.txId, 6, 6)}</a>
                </td>
                <td className="px-6 py-4 break-word">{tx.txDate}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Transactions;
