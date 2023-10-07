import { useCallback, useState, useEffect, useRef } from "react";
import { ProductFormValues } from "../api/post-event";
import * as CryptoJS from "crypto-js";
import {
  PostListing,
  getNsecWithPassphrase,
  getPrivKeyWithPassphrase,
  nostrBuildUploadImage,
} from "../nostr-helpers";
import { nip19, finishEvent } from "nostr-tools";
import { PhotoIcon, TrashIcon } from "@heroicons/react/24/outline";

interface ProductFormProps {
  handleModalToggle: () => void;
  showModal: boolean;
}

const ProductForm = ({ showModal, handleModalToggle }: ProductFormProps) => {
  const [encryptedPrivateKey, setEncryptedPrivateKey] = useState("");
  const [signIn, setSignIn] = useState("");
  const [formValues, setFormValues] = useState<ProductFormValues>([]);
  const [images, setImages] = useState<string[]>([]);
  const [passphrase, setPassphrase] = useState("");

  const [showAddedCostInput, setShowAddedCostInput] = useState(false);

  const [currencyVal, setCurrencyVal] = useState("");

  const fileInput = useRef(null);

  const initFormValues = () => {
    setFormValues([]);
    setImages([]);
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      const encrypted = localStorage.getItem("encryptedPrivateKey");
      setEncryptedPrivateKey(encrypted);
      const signIn = localStorage.getItem("signIn");
      setSignIn(signIn);
    }
  }, []);

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value } = e.target;
    if (name === "passphrase") {
      setPassphrase(value);
      console.log(passphrase);
    } else {
      setFormValues((prevValues) => {
        // Handles when the name is 'currency'
        if (name === "currency") {
          setCurrencyVal(value);
          return prevValues.map(([key, ...rest]) => {
            if (key === "price") {
              let price = rest[0];
              return [key, price, value];
            } else if (key === "shipping") {
              let type = rest[0];
              if (rest[1]) {
                return [key, type, rest[1], value];
              }
              return [key, type, "", value];
            } else {
              return [key, ...rest];
            }
          });
        }

        if (value === "Shipping option") {
          setShowAddedCostInput(false);
          return prevValues.filter(([key]) => key !== "shipping"); // filter out "shipping"
        } else if (value === "Added cost") {
          setShowAddedCostInput(true);
        } else if (
          value === "Free" ||
          value === "Pickup" ||
          value === "Free/pickup"
        ) {
          setShowAddedCostInput(false);
          if (prevValues.find(([key]) => key === "shipping") === undefined) {
            return [...prevValues, [name, value, "0", currencyVal]];
          } else {
            return prevValues.map(([key, ...rest]) => {
              if (key === "shipping") {
                return [key, value, "0", currencyVal];
              } else {
                return [key, ...rest]; // return the original value for other keys
              }
            });
          }
        }

        if (name === "Added cost") {
          return prevValues.map((formValue) => {
            const [key, value] = formValue;
            // Handle "shipping" key
            if (key === "shipping") {
              // Set new value for "Added cost"
              return [key, "Added cost", e.target.value, currencyVal];
            }
            // Handle "price" key
            if (key === "price") {
              // Keep existing currency value
              return [key, value, currencyVal];
            }
            // Return all other keys without modification
            return formValue;
          });
        }

        // Checks to see if key exists and updates it rather than duplicating
        for (const [key, ...rest] of prevValues) {
          if (key === name) {
            return prevValues.map((item) =>
              item[0] === name ? [name, value] : item
            );
          }
        }
        // Adds the new key if does not exist already
        return [...prevValues, [name, value]];
      });
    }
  };
  console.log(formValues);
  const handlePostListing = async (values) => {
    await PostListing(values, passphrase);
  };

  const handleSubmit = () => {
    if (
      !formValues.find(([key]) => key === "title") ||
      !formValues.find(([key]) => key === "summary") ||
      !formValues.find(([key]) => key === "location") ||
      !formValues.find(([key]) => key === "price")
    ) {
      alert("Missing required fields!");
      return;
    }
    if (
      formValues.find(([key]) => key === "price").length < 3 || // check all fields exist for price
      formValues.find(([key]) => key === "price")?.[1] === "" || // check that price is not empty
      formValues.find(([key]) => key === "price")?.[2] === "Select currency" // check that currency is not empty
    ) {
      alert("Missing required fields!");
      return;
    }
    // here we know that added shipping is not empty
    if (
      formValues.find(([key]) => key === "shipping") != undefined &&
      formValues.find(([key]) => key === "shipping")?.[1] === "Added cost" &&
      formValues.find(([key]) => key === "shipping").length < 4
    ) {
      alert("Missing shipping option!");
      return;
    }
    // here we know that added shipping is a valid number and greater than 0
    if (
      (formValues.find(([key]) => key === "shipping") === "Shipping option" ||
        formValues.find(([key]) => key === "shipping") === "Added cost") &&
      (Number(formValues.find(([key]) => key === "shipping")?.[2]) <= 0 ||
        isNaN(Number(formValues.find(([key]) => key === "shipping")?.[2])))
    ) {
      alert("Missing shipping cost!");
      return;
    }

    const updatedFormValues = [
      ...formValues,
      ...images.map((image) => ["image", image]),
    ];

    if (signIn === "nsec") {
      // checks that the passphrase is correct
      if (!getNsecWithPassphrase(passphrase)) {
        alert("Invalid passphrase!");
        return;
      }
    }
    handleModalToggle();
    initFormValues();
    setShowAddedCostInput(false);
    handlePostListing(updatedFormValues);
  };

  const getFormValue = (key: string) => {
    if (key === "currency") {
      const currency = formValues?.find(([k]) => k === "price")?.[2] || "";
      return currency;
    }
    if (key === "shipping") {
      const value = formValues?.find(([k]) => k === key)?.[1] || "";
      return value;
    }
    if (key === "Added cost") {
      const value = formValues?.find(([k]) => k === "shipping")?.[2] || "";
      return value;
    }
    const value = formValues?.find(([k]) => k === key)?.[1] || "";
    return value;
  };

  const handleAddImage = () => {
    setImages((prevValues) => [...prevValues, ""]);
  };

  const handleDeleteImage = (index: number) => {
    setImages((prevValues) => {
      const updatedImages = [...prevValues];
      updatedImages.splice(index, 1);
      return updatedImages;
    });
  };

  const uploadImage = async (imageFile: File, index: number) => {
    try {
      if (!imageFile.type.includes("image"))
        throw new Error("Only images are supported");

      let response;

      if (signIn === "nsec") {
        console.log("passphrase", passphrase);
        if (!getNsecWithPassphrase(passphrase))
          throw new Error("Invalid passphrase!");

        const privkey = getPrivKeyWithPassphrase(passphrase);
        response = await nostrBuildUploadImage(imageFile, (e) =>
          finishEvent(e, privkey)
        );
      } else if (signIn === "extension") {
        response = await nostrBuildUploadImage(
          imageFile,
          async (e) => await window.nostr.signEvent(e)
        );
      }

      const imageUrl = response.url;

      setImages((prevValues) => {
        const updatedImages = [...prevValues];
        updatedImages[index] = imageUrl;
        return updatedImages;
      });
    } catch (e) {
      if (e instanceof Error) alert("Failed to upload image! " + e.message);
    }
  };

  return (
    <div
      className={`fixed z-10 inset-0 overflow-y-auto ${
        showModal ? "" : "hidden"
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
                  Add New Listing
                </h3>
                <div className="mt-2">
                  <form className="mx-auto" onSubmit={handleSubmit}>
                    <label htmlFor="title" className="block mb-2 font-bold">
                      Title:<span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      id="title"
                      name="title"
                      value={getFormValue("title")}
                      onChange={handleChange}
                      required
                      className="w-full p-2 border border-gray-300 rounded"
                    />

                    <label
                      htmlFor="description"
                      className="block my-2 font-bold"
                    >
                      Summary:<span className="text-red-500">*</span>
                    </label>
                    <textarea
                      id="summary"
                      name="summary"
                      value={getFormValue("summary")}
                      onChange={handleChange}
                      required
                      className="w-full p-2 border border-gray-300 rounded"
                    />

                    <div className="flex items-center mb-2">
                      <label
                        htmlFor="images"
                        className="block my-2 font-bold pr-3"
                      >
                        Images:
                      </label>
                      <button
                        type="button"
                        onClick={handleAddImage}
                        className="bg-blue-500 text-white px-2 py-1 rounded"
                      >
                        Add Image
                      </button>
                    </div>
                    {images.map((image, index) => (
                      <div key={index} className="flex items-center mb-2">
                        <input
                          type="file"
                          accept="image/*"
                          id={`image-${index}`}
                          name={`image-${index}`}
                          placeholder="Image Url"
                          ref={fileInput}
                          onChange={(e) => {
                            uploadImage(e.target.files[0], index);
                            e.target.value = "";
                          }}
                          className="w-1/2 p-2 border border-gray-300 rounded hidden"
                        />
                        {image ? (
                          <a
                            href={image}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {image.substring(0, 20) + "..."}
                          </a>
                        ) : (
                          <PhotoIcon
                            className="w-8 h-8 hover:text-purple-700"
                            onClick={() => fileInput.current.click()}
                          />
                        )}
                        <TrashIcon
                          className="w-8 h-8 ml-auto hover:text-red-500"
                          onClick={() => handleDeleteImage(index)}
                        />
                      </div>
                    ))}

                    <label htmlFor="location" className="block my-2 font-bold">
                      Location:<span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      id="location"
                      name="location"
                      value={getFormValue("location")}
                      onChange={handleChange}
                      required
                      className="w-full p-2 border border-gray-300 rounded"
                    />

                    <label htmlFor="price" className="block my-2 font-bold">
                      Price:<span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      id="price"
                      step="0.01"
                      name="price"
                      value={getFormValue("price")}
                      onChange={handleChange}
                      required
                      className="w-full p-2 border border-gray-300 rounded"
                    />

                    <label htmlFor="currency" className="block my-2 font-bold">
                      Currency:<span className="text-red-500">*</span>
                    </label>
                    <select
                      id="currency"
                      name="currency"
                      value={getFormValue("currency")}
                      onChange={handleChange}
                      required
                      className="w-full p-2 border border-gray-300 rounded"
                    >
                      <option value="Select currency">(Select currency)</option>
                      <option value="Sat(s)">Sat(s)</option>
                      <option value="USD">USD</option>
                    </select>

                    <label htmlFor="shipping" className="block my-2 font-bold">
                      Shipping:
                    </label>
                    <select
                      id="shipping"
                      name="shipping"
                      value={getFormValue("shipping")}
                      onChange={handleChange}
                      required
                      className="w-full p-2 border border-gray-300 rounded"
                    >
                      <option value="Shipping option">(Shipping option)</option>
                      <option value="Added cost">Added cost</option>
                      <option value="Free">Free</option>
                      <option value="Pickup">Pickup</option>
                      <option value="Free/pickup">Free/pickup</option>
                    </select>
                    <div className="relative">
                      {showAddedCostInput && (
                        <input
                          type="number"
                          id="Added cost"
                          name="Added cost"
                          value={getFormValue("Added cost")}
                          onChange={handleChange}
                          className="w-full p-2 pl-6 border border-gray-300 rounded"
                        />
                      )}
                      {showAddedCostInput && (
                        <span className="absolute right-8 top-2">
                          {currencyVal}
                        </span>
                      )}
                    </div>

                    <label htmlFor="t" className="block my-2 font-bold">
                      Category:
                    </label>
                    <input
                      type="text"
                      id="t"
                      name="t"
                      value={getFormValue("t")}
                      onChange={handleChange}
                      className="w-full p-2 border border-gray-300 rounded"
                    />

                    {signIn === "nsec" && (
                      <>
                        <label
                          htmlFor="passphrase"
                          className="block mb-2 font-bold"
                        >
                          Passphrase:<span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          id="passphrase"
                          name="passphrase"
                          value={passphrase}
                          required
                          onChange={handleChange}
                          className="w-full p-2 border border-gray-300 rounded"
                        />
                      </>
                    )}
                    <p className="mt-2 text-red-500 text-sm">
                      * required field
                    </p>
                  </form>
                </div>
              </div>
            </div>
          </div>
          <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
            <button
              type="button"
              className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-green-600 text-base font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 sm:ml-3 sm:w-auto sm:text-sm"
              onClick={handleSubmit}
            >
              Add Listing
            </button>
            <button
              type="button"
              className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
              onClick={() => {
                initFormValues();
                handleModalToggle();
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductForm;
