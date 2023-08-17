import React from 'react';
import { 
  BoltIcon
} from '@heroicons/react/24/outline';
import { withRouter, NextRouter, useRouter } from 'next/router';

const DisplayProduct = ({ content }: any) => {
  const router = useRouter();
  
  const {
    id,
    stall_id,
    name,
    description,
    images,
    currency,
    price,
    quantity,
    specs,
  } = content;

    // Define a new function for alternate checkout behavior
  const handleAlternateCheckout = (productId: string) => {
    // Execute a different function for alternate checkout behavior
    // For example, you may want to redirect to a different page or show a different message
    console.log("Alternate checkout behavior");
  };

  // Choose which checkout function to execute based on the current page
  // Modify this condition as per your requirement, currently checking the page name for 'checkout'
  const handleCheckout = (productId: string) => {
    if (window.location.pathname.includes("checkout")) {
      handleAlternateCheckout(productId);
    } else {
      router.push(`/checkout/${productId}`);
    }
  };
  
  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-2xl font-bold mb-4">{name}</h2>
      <p className="text-gray-700 mb-4">{description}</p>

      <div className="flex flex-wrap -mx-4 mb-4">
        {images?.map((image, index) => (
          <img
            key={index}
            src={image}
            alt={`Product Image ${index + 1}`}
            className="w-1/3 px-4 mb-4"
          />
        ))}
      </div>

      <div className="mb-4">
        <p>
          <strong className="font-semibold">Product ID:</strong> {id}
        </p>
        <p>
          <strong className="font-semibold">Stall ID:</strong> {stall_id}
        </p>
        <p>
          <strong className="font-semibold">Price:</strong> {currency} {price}
        </p>
        <p>
          <strong className="font-semibold">Quantity:</strong> {quantity}
        </p>
      </div>
      {specs?.length > 0 && (
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
      )}
      <div className="flex justify-center">
        <BoltIcon 
          className="w-6 h-6 hover:text-yellow-500"
          onClick={() => handleCheckout(id)}
        />
      </div>
    </div>
  );
};

export default DisplayProduct;