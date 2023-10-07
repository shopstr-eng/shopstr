import Link from 'next/link';

const Wallet = () => {
  const mintUrl = 'https://legend.lnbits.com/cashu/api/v1/4gr9Xcmz3XEkUNwiBiQGoC';
  
  const handleCopyInvoice = () => {
    navigator.clipboard.writeText(mintUrl);
    alert('Mint URL copied to clipboard!');
  };
  
  return (
    <div className="flex items-center justify-center h-max m-[20vh]">
      <p className="text-3xl text-yellow-100 max-w-[48vh] break-words text-center">
        A native wallet is coming soon! For now, you can claim your tokens for Bitcoin on 
        <Link href="https://wallet.nutstash.app/" className="text-yellow-500 hover:text-purple-700">
          {' '}Nutstash{' '}
        </Link>
        using
        <span className="text-yellow-500 hover:text-purple-700" onClick={handleCopyInvoice}>{' '}{mintUrl}{' '}</span>
        as the mint URL.
      </p>
    </div>
  );
};
export default Wallet;
