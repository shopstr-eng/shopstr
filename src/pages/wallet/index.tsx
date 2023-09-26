import Link from 'next/link';

const Wallet = () => {
  const mintUrl = 'https://legend.lnbits.com/cashu/api/v1/AptDNABNBXv8gpuywhx6N';
  
  const handleCopyInvoice = () => {
    navigator.clipboard.writeText(mintUrl);
    alert('Mint URL copied to clipboard!');
  };
  
  return (
    <div className="flex items-center justify-center h-max mt-[40vh]">
      <p className="text-3xl text-yellow-100">
        A native wallet is coming soon! For now, you can claim your tokens for Bitcoin on 
        <Link href="https://wallet.nutstash.app/" className="hover:text-purple-700">
          {' '}Nutstash{' '}
        </Link>
        using
        <span className="hover:text-purple-700" onClick={handleCopyInvoice}>{' '}{mintUrl}{' '}</span>
        as the mint URL.
      </p>
    </div>
  );
};
export default Wallet;
