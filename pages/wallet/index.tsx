import Link from "next/link";

const Wallet = () => {
  const mintUrl =
    "https://legend.lnbits.com/cashu/api/v1/AptDNABNBXv8gpuywhx6NV";

  const handleCopyInvoice = () => {
    navigator.clipboard.writeText(mintUrl);
    alert("Mint URL copied to clipboard!");
  };

  return (
    <div className="m-[20vh] flex h-max items-center justify-center">
      <p className="max-w-[48vh] break-words text-center text-3xl text-light-text dark:text-dark-text">
        A native wallet is coming soon! For now, you can claim your tokens for
        Bitcoin on
        <Link
          href="https://wallet.nutstash.app/"
          className="text-accent-light-text hover:text-purple-700 dark:text-accent-dark-text"
        >
          {" "}
          Nutstash{" "}
        </Link>
        using
        <span
          className="text-accent-light-text hover:text-purple-700 dark:text-accent-dark-text"
          onClick={handleCopyInvoice}
        >
          {" "}
          {mintUrl}{" "}
        </span>
        as the mint URL.
      </p>
    </div>
  );
};
export default Wallet;
