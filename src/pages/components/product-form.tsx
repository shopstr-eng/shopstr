import { use, useState } from "react";
import { ProductFormValues } from "../api/post-event";

interface ProductFormProps {
  handlePostListing: (product: ProductFormValues, passphrase: string) => void;
  handleModalToggle: () => void;
  showModal: boolean;
};

const ProductForm = ({
  handlePostListing,
  showModal,
  handleModalToggle,
}: ProductFormProps) => {
  const [formValues, setFormValues] = useState<ProductFormValues>([]);
  const [images, setImages] = useState<string[]>([]);
  const [passphrase, setPassphrase] = useState("");

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    if (name === "passphrase") {
      setPassphrase(value);
    } else {
      setFormValues((prevValues) => {
        // Handles when the name is 'currency'
        if (name === 'currency') {
          return prevValues.map(([key, price, _]) => 
            key === 'price' ? [key, price, value] : [key, price]
          );
        }
        // Checks to see if key exists and updates it rather than duplicating
        for(const [key, ...rest] of prevValues) {
          if(key === name) {
            return prevValues.map((item) => item[0] === name ? [name, value] : item);
          }
        }
        // Adds the new key if does not exist already
        return [...prevValues, [name, value]];
      });
    };
  };
  
  const handleImageChange = (value: string, index: number) => {
    setImages((prevValues) => {
      const updatedImages = [...prevValues];
      updatedImages[index] = value;
      return updatedImages;
    });
  };

  const handleAddImage = () => {
    setImages((prevValues) => [...prevValues, ""]);
  };

  const handleDeleteImage = (index: number) => {
    setImages(prevValues => {
      const updatedImages = [...prevValues];
      updatedImages.splice(index, 1);
      return updatedImages;
    });
  };
  
  const handleSubmit = () => {
    // integrate image urls into formValues
    const updatedFormValues = [...formValues, ...images.map((image) => ["image", image])];

    handleModalToggle();
    initFormValues();
    handlePostListing(updatedFormValues, passphrase);
  };

  const initFormValues = () => {
    setFormValues([]);
    setImages([]);
  }

  const getFormValue = (key: string) => {
    if (key === 'currency') {
      const currency = formValues.find(([k]) => k === 'price')?.[2] || "";
      return currency;
    }
    const value = formValues.find(([k]) => k === key)?.[1] || "";
    return value;
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
                    <label 
                      htmlFor="title" 
                      className="block mb-2 font-bold"
                    >
                      Title:
                    </label>
                    <input
                      type="text"
                      id="title"
                      name="title"
                      value={getFormValue('title')}
                      onChange={handleChange}
                      required
                      className="w-full p-2 border border-gray-300 rounded"
                    />

                    <label
                      htmlFor="description"
                      className="block mb-2 font-bold"
                    >
                      Summary:
                    </label>
                    <textarea
                      id="summary"
                      name="summary"
                      value={getFormValue('summary')}
                      onChange={handleChange}
                      required
                      className="w-full p-2 border border-gray-300 rounded"
                    />
                    
                    <div className="flex items-center mb-2">
                      <label
                        htmlFor="images"
                        className="block mb-2 font-bold pr-3"
                      >
                        Images:
                      </label>
                      <button
                        type="button"
                        onClick={handleAddImage}
                        className="bg-blue-500 text-white px-4 py-2 rounded"
                      >
                        Add Image Url
                      </button>
                    </div>
                    {images.map((image, index) => (
                      <div key={index} className="flex items-center mb-2">
                        <input
                          type="text"
                          id={`image-${index}`}
                          name={`image-${index}`}
                          placeholder="Image Url"
                          value={image}
                          onChange={(e) => handleImageChange(e.target.value, index)}
                          className="w-1/2 p-2 border border-gray-300 rounded"
                        />
                        <button
                          onClick={() => handleDeleteImage(index)}
                        >
                          Delete
                        </button>
                      </div>
                    ))}

                    <label htmlFor="location" className="block mb-2 font-bold">
                      Location:
                    </label>
                    <input
                      type="text"
                      id="location"
                      name="location"
                      value={getFormValue('location')}
                      onChange={handleChange}
                      required
                      className="w-full p-2 border border-gray-300 rounded"
                    />

                    <label htmlFor="price" className="block mb-2 font-bold">
                      Price:
                    </label>
                    <input
                      type="number"
                      id="price"
                      step="0.01"
                      name="price"
                      value={getFormValue('price')}
                      onChange={handleChange}
                      required
                      className="w-full p-2 border border-gray-300 rounded"
                    />

                    <label htmlFor="currency" className="block mb-2 font-bold">
                      Currency:
                    </label>
                    <input
                      type="text"
                      id="currency"
                      name="currency"
                      value={getFormValue('currency')}
                      onChange={handleChange}
                      required
                      className="w-full p-2 border border-gray-300 rounded"
                    />

                    <label htmlFor="t" className="block mb-2 font-bold">
                      Category:
                    </label>
                    <input
                      type="text"
                      id="t"
                      name="t"
                      value={getFormValue('t')}
                      placeholder="Optional"
                      onChange={handleChange}
                      className="w-full p-2 border border-gray-300 rounded"
                    />

                    <label htmlFor="t" className="block mb-2 font-bold">
                      Passphrase:
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