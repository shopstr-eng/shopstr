import React, { useState, useEffect } from 'react';
import { 
  BoltIcon,
  TrashIcon
} from '@heroicons/react/24/outline';
import { withRouter, NextRouter, useRouter } from 'next/router';
import axios from "axios";
import requestMint from "../api/cashu/request-mint";
import { CashuMint, CashuWallet, getEncodedToken } from '@cashu/cashu-ts';
import { nip19, SimplePool } from 'nostr-tools';
import 'websocket-polyfill';
import * as CryptoJS from 'crypto-js';

const DisplayProduct = ({ tags, eventId, pubkey, handleDelete }: { tags: [][], eventId: string, pubkey: string, handleDelete: (productId: string, passphrase: string) => void }) => {
  const router = useRouter();

  const [decryptedNpub, setDecryptedNpub] = useState("");
  const [encryptedPrivateKey, setEncryptedPrivateKey] = useState("");
  const [signIn, setSignIn] = useState("");
  const [relays, setRelays] = useState([]);
  
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [publishedAt, setPublishedAt] = useState("");
  const [images, setImages] = useState([]);
  const [currentImage, setCurrentImage] = useState<number>(0);
  const [category, setCategory] = useState("");
  const [location, setLocation] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("");
  
  const [checkout, setCheckout] = useState(false);
  const [invoice, setInvoice] = useState("");
  const [qrCodeUrl, setQrCodeUrl] = useState<string|null>(null);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);

  const [enterPassphrase, setEnterPassphrase] = useState(false);
  const [passphrase, setPassphrase] = useState("");

  const [use, setUse] = useState("");
  
  // const {
  //   id,
  //   stall_id,
  //   name,
  //   description,
  //   images,
  //   currency,
  //   price,
  //   quantity,
  //   specs,
  // } = content;

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const npub = localStorage.getItem("npub");
      const { data } = nip19.decode(npub);
      setDecryptedNpub(data);
      const encrypted = localStorage.getItem("encryptedPrivateKey");
      setEncryptedPrivateKey(encrypted);
      const signIn = localStorage.getItem("signIn");
      setSignIn(signIn);
      const storedRelays = localStorage.getItem("relays");
      setRelays(storedRelays ? JSON.parse(storedRelays) : []);
    }
  }, []);
  
  useEffect(() => {
    let tmpImages = []; 
    tags.forEach(tag => {
      const [key, ...values] = tag;
      switch(key) {
        case "title":
          setTitle(values[0]);
          break;
        case "summary":
          setSummary(values[0]);
          break;
        case "published_at":
          setPublishedAt(values[0]);
          break;
        case "image":
          tmpImages.push(values[0]);
          break;
        case "t":
          setCategory(values[0]);
          break;
        case "location":
          setLocation(values[0]);
          break;
        case "price":
          const [amount, currency] = values;
          setPrice(amount);
          setCurrency(currency);
          break;
        default:
          return;
      }
    });
    setImages(tmpImages);
  }, [tags]);

  const sendTokens = async (pk: string, token: string) => {
    if (signIn === "extension") {
      const event = {
        created_at: Math.floor(Date.now() / 1000),
        kind: 4,
        tags: [['p', pk]],
        content: await window.nostr.nip04.encrypt(decryptedNpub, token),
      }
  
      const signedEvent = await window.nostr.signEvent(event);

      const pool = new SimplePool();

      // const relays = JSON.parse(storedRelays);
  
      await pool.publish(relays, signedEvent);
  
      let events = await pool.list(relays, [{ kinds: [0, signedEvent.kind] }]);
      let postedEvent = await pool.get(relays, {
        ids: [signedEvent.id],
      });
    } else {
      let nsec = CryptoJS.AES.decrypt(encryptedPrivateKey, passphrase).toString(CryptoJS.enc.Utf8);
      // add error handling and re-prompt for passphrase
      let { data } = nip19.decode(nsec);
      axios({
        method: 'POST',
        url: '/api/nostr/post-event',
        headers: {
          'Content-Type': 'application/json',
        },
        data: {
          pubkey: decryptedNpub,
          privkey: data,
          created_at: Math.floor(Date.now() / 1000),
          kind: 4,
          tags: [['p', pk]],
          content: token,
          relays: relays,
        }
      });
    };
  };

  async function invoiceHasBeenPaid(pk: string, wallet: object, price: number, hash: string) {
    let encoded;
    while (true) {
      try {
        const { proofs } = await wallet.requestTokens(price, hash);

        // Encoded proofs can be spent at the mint
        encoded = getEncodedToken({
          token: [{ mint: "https://legend.lnbits.com/cashu/api/v1/AptDNABNBXv8gpuywhx6NV", proofs }]
        });

        if (encoded) {
          sendTokens(pk, encoded);
          setPaymentConfirmed(true);
          setQrCodeUrl(null);
          setTimeout(() => {
            router.push("/marketplace");
          }, 1900);
          break;
        }
      } catch (error) {
        console.error(error);
              
        /* wait for 2 sec before try again */
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  };

  const handlePayment = async (pk: string, price: number) => {
    const wallet = new CashuWallet(new CashuMint("https://legend.lnbits.com/cashu/api/v1/AptDNABNBXv8gpuywhx6NV"));

    const { pr, hash } = await wallet.requestMint(price);

    setInvoice(pr);

    const QRCode = require('qrcode')
    
    QRCode.toDataURL(pr)
      .then(url => {
        setQrCodeUrl(url);
      })
      .catch(err => {
        console.error(err)
      })

    setCheckout(true);
    
    invoiceHasBeenPaid(pk, wallet, price, hash);
  };

  const handleCheckout = (productId: string, pk: string, price: number) => {
    if (window.location.pathname.includes("checkout")) {
      if (signIn != "extension"){
        setEnterPassphrase(!enterPassphrase);
        setUse("pay");
      } else {
        handlePayment(pk, price);
      }
    } else {
      router.push(`/checkout/${productId}`);
    }
  };

  const handleCancel = () => {
    setCheckout(false);
  };

  const nextImage = () => {
    setCurrentImage((currentImage + 1) % images.length);
  };
  
  const prevImage = () => {
    setCurrentImage((currentImage - 1 + images.length) % images.length);
  };

  const handlePassphraseChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    if (name === "passphrase") {
      setPassphrase(value);
    };
  };

  const handleDeleteWithPassphrase = () => {
    if (signIn != "extension"){
        setEnterPassphrase(!enterPassphrase);
        setUse("delete");
      } else {
        handleDelete(eventId, "");
      }
  };

  const handleSubmitPassphrase = () => {
    if (CryptoJS.AES.decrypt(encryptedPrivateKey, passphrase).toString(CryptoJS.enc.Utf8)) {
      setEnterPassphrase(false);
      if (use === "pay") {
        handlePayment(pubkey, price);
      } else if (use === "delete") {
        handleDelete(eventId, passphrase);
      }
      setUse("");
    } else {
      alert("Invalid passphrase!");
    }
  };

  const handleCopyInvoice = () => {
    navigator.clipboard.writeText(invoice);
    // navigator.clipboard.writeText(invoiceString);
    alert('Invoice copied to clipboard!');
  };
  
  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-2xl font-bold mb-4">{title}</h2>
      <p className="text-gray-700 mb-4">{summary}</p>

      <div className="flex flex-wrap -mx-4 mb-4">
        {images.length > 1 && (
          <div className="relative">
            <img
              src={images[currentImage]}
              alt={`Product Image ${currentImage + 1}`}
              className="w-full object-cover h-72"
            />
            <button
              style={{ right: "10px" }}
              className="absolute top-1/2 p-2 rounded bg-white text-black"
              onClick={nextImage}
            >
              {'>'}
            </button>
            <button
              style={{ left: "10px" }}
              className="absolute top-1/2 p-2 rounded bg-white text-black"
              onClick={prevImage}
            >
              {'<'}
            </button>
          </div>
        )}
      </div>

      <div className="mb-4">
        <p>
          <strong className="font-semibold">Category:</strong> {category}
        </p>
        <p>
          <strong className="font-semibold">Location:</strong> {location}
        </p>
        <p>
          <strong className="font-semibold">Price:</strong> {price} {currency}
        </p>
        {/* <p>
          <strong className="font-semibold">Quantity:</strong> {quantity}
        </p> */}
      </div>
      {/* {specs?.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-2">Specifications</h3>
          <ul>
            {specs?.map(([key, value], index) => (
              <li key={index} className="text-gray-700 mb-1">
                <strong className="font-semibold">{key}:</strong> {value}
              </li>
            ))}
          </ul>
        </div>
      )} */}
      <div className="flex justify-center">
        <BoltIcon 
          className="w-6 h-6 hover:text-yellow-500"
          onClick={() => handleCheckout(eventId, pubkey, price)}
        />
        {
         decryptedNpub === pubkey ? (
            <TrashIcon 
              className="w-6 h-6 hover:text-yellow-500"
              onClick={() => handleDeleteWithPassphrase()}
            />
          ) : undefined
        }
      </div>
      {(checkout) && (
        <div
          className="fixed z-10 inset-0 overflow-y-auto flex items-center justify-center"
        >
          <div className="flex items-end justify-center min-h-screen text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity" aria-hidden="true">
              <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
            </div>
            <span
              className="hidden sm:inline-block sm:align-middle sm:h-screen"
              aria-hidden="true"
            >
              &#8203;
            </span>
            {(!paymentConfirmed) ? (<div className="inline-block align-bottom bg-white rounded-lg overflow-hidden shadow-xl transform transition-all sm:align-middle sm:max-w-lg sm:w-full">
              <h3 className="text-lg leading-6 font-medium text-gray-900 mt-3">
                Scan this invoice:
              </h3>
              <img src={qrCodeUrl} alt="QR Code" />
              <div className="flex justify-center">
                <p className="inline-block rounded-lg max-w-[48vh] break-words text-center" onClick={handleCopyInvoice}>
                  {invoice.length > 30 
                    ? `${invoice.substring(0, 15)}...${invoice.substring(invoice.length - 15, invoice.length)}`
                    : invoice
                  }
                </p>
              </div>
              <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                <div className="mt-3 w-full inline-flex justify-center">
                  <button
                    type="button"
                    className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 text-base font-medium text-white bg-red-500 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                    onClick={handleCancel}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
            ) : (
              <div className="inline-block align-bottom bg-white rounded-lg overflow-hidden shadow-xl transform transition-all sm:align-middle sm:max-w-lg sm:w-full">
                <h3 className="text-lg leading-6 font-medium text-gray-900 mt-3">
                  Payment confirmed!
                </h3>
                <img src="../payment-confirmed.gif" alt="Payment Confirmed" />
              </div>
            )}
          </div>
        </div>
      )}
      <div
        className={`fixed z-10 inset-0 overflow-y-auto ${
          enterPassphrase & signIn === 'nsec' ? "" : "hidden"
        }`}
      >
        <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
          <div className="fixed inset-0 transition-opacity" aria-hidden="true">
            <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
          </div>
          <span
            className="hidden sm:inline-block sm:align-middle sm:h-screen"
            aria-hidden="true"
          >
            &#8203;
          </span>
          <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
            <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
              <div className="sm:flex sm:items-start">
                <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                  <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                    Enter Passphrase
                  </h3>
                  <div className="mt-2">
                    <form className="mx-auto" onSubmit={() => handleSubmitPassphrase()}>
                      <label htmlFor="t" className="block mb-2 font-bold">
                        Passphrase:<span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        id="passphrase"
                        name="passphrase"
                        value={passphrase}
                        required
                        onChange={handlePassphraseChange}
                        className="w-full p-2 border border-gray-300 rounded"
                      />
                      <p className="mt-2 text-red-500 text-sm">* required field</p>
                    </form>
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
              <button
                type="button"
                className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-green-600 text-base font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 sm:ml-3 sm:w-auto sm:text-sm"
                onClick={() => handleSubmitPassphrase()}
              >
                Submit
              </button>
              <button
                type="button"
                className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                onClick={() => setEnterPassphrase(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DisplayProduct;
