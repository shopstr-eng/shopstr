import React, { useState, useEffect } from 'react';
import { 
  BoltIcon
} from '@heroicons/react/24/outline';
import { withRouter, NextRouter, useRouter } from 'next/router';
import axios from "axios";
import requestMint from "../api/cashu/request-mint";
import { CashuMint, CashuWallet, getEncodedToken } from '@cashu/cashu-ts';

const DisplayProduct = ({ tags, eventId, pubkey }: { tags: [][], eventId: string, pubkey: string }) => {
  const router = useRouter();
  
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [publishedAt, setPublishedAt] = useState("");
  const [images, setImages] = useState([]);
  const [currentImage, setCurrentImage] = useState<number>(0);
  const [category, setCategory] = useState("");
  const [location, setLocation] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("");
  
  const [checkout, setCheckout] = useState(null);
  const [invoice, setInvoice] = useState("");
  const [qrCodeUrl, setQrCodeUrl] = useState<string|null>(null);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  
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
    axios({
      method: 'POST',
      url: '/api/nostr/post-event',
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        pubkey: localStorage.getItem('publicKey'),
        privkey: localStorage.getItem('privateKey'),
        created_at: Math.floor(Date.now() / 1000),
        kind: 4,
        tags: [['p', pk]],
        content: token,
        relays: JSON.parse(localStorage.getItem("relays")),
      }
    });
  }

  async function invoiceHasBeenPaid(pk: string, wallet: object, price: number, hash: string) {
    let encoded;
    while (true) {
      try {
        const { proofs } = await wallet.requestTokens(price, hash);

        // Encoded proofs can be spent at the mint
        encoded = getEncodedToken({
          token: [{ mint: "https://legend.lnbits.com/cashu/api/v1/4gr9Xcmz3XEkUNwiBiQGoC", proofs }]
        });

        if (encoded) {
          sendTokens(pk, encoded);
          setPaymentConfirmed(true);
          setQrCodeUrl(null);
          setTimeout(() => {
            router.push("/home");
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
    const wallet = new CashuWallet(new CashuMint("https://legend.lnbits.com/cashu/api/v1/4gr9Xcmz3XEkUNwiBiQGoC"));

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
      handlePayment(pk, price);
    } else {
      router.push(`/checkout/${productId}`);
    }
  };

  const handleCancel = () => {
    setCheckout(null);
  };

  const nextImage = () => {
    setCurrentImage((currentImage + 1) % images.length);
  };
  
  const prevImage = () => {
    setCurrentImage((currentImage - 1 + images.length) % images.length);
  };
  
  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-2xl font-bold mb-4">{title}</h2>
      <p className="text-gray-700 mb-4">{summary}</p>

      <div className="flex flex-wrap -mx-4 mb-4">
        {images.length > 0 && (
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
    </div>
  );
};

export default DisplayProduct;
