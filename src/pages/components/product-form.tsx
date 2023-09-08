import { useState } from "react";
import { ProductFormValues } from "../api/post-event";
// import { v4 as uuidv4 } from "uuid";

// export interface ProductFormValues {
//   id: string;
//   stall_id: string;
//   name: string;
//   description?: string;
//   images: string[];
//   currency: string;
//   price: number;
//   quantity: number;
//   specs: [string, string][];
// };

// type ProductFormValue = [key: string, ...values: string[]];
// export type ProductFormValues = ProductFormValue[];

// [
//  ["title","title"],
//  ["summary", "short description"],
//  ["published_at", "timestamp"],
//  ["location", "Seattle"]
//  ["price", "1", "USD"]
// ]

interface ProductFormProps {
  handlePostListing: (product: ProductFormValues) => void;
  handleModalToggle: () => void;
  showModal: boolean;
};

const ProductForm = ({
  handlePostListing,
  showModal,
  handleModalToggle,
}: ProductFormProps) => {
  // const [formValues, setFormValues] = useState<ProductFormValues>({
  //   id: "",
  //   stall_id: "",
  //   name: "",
  //   description: "",
  //   images: [],
  //   currency: "",
  //   price: 0,
  //   quantity: 1,
  //   specs: [],
  // });

  // const initialFormValues: ProductFormValues = [
  //   ["title",""],
  //   ["summary", ""],
  //   ["published_at", ""],
  //   ["location", ""],
  //   ["price", "", ""]
  // ];
  
  const [formValues, setFormValues] = useState<ProductFormValues>([]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
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
  
  const handleImageChange = (value: string) => {
    setFormValues((prevValues) => {
      const updatedImages = [
        ...prevValues,
        ['image', value]
      ];
      return updatedImages;
    });
  };
  
  const handleSubmit = () => {
    // const idValue: ProductFormValue = ["id", uuidv4()];
    // const updatedFormValues = [...formValues, idValue];
    handleModalToggle();
    handlePostListing(formValues);
  };

  // const handleChange = (
  //   e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  // ) => {
  //   const { name, value } = e.target;
  //   if (name === "price" || name === "quantity") {
  //     setFormValues((prevValues) => ({
  //       ...prevValues,
  //       [name]: parseInt(value),
  //     }));
  //     return;
  //   }
  //   setFormValues((prevValues) => ({
  //     ...prevValues,
  //     [name]: value,
  //   }));
  // };

  // const handleSpecChange = (index: number, key: string, value: string) => {
  //   setFormValues((prevValues) => {
  //     const updatedSpecs = [...prevValues.specs];
  //     updatedSpecs[index] = [key, value];
  //     return {
  //       ...prevValues,
  //       specs: updatedSpecs,
  //     };
  //   });
  // };

  // const handleImageChange = (index: number, value: string) => {
  //   setFormValues((prevValues) => {
  //     const updatedImages = [...prevValues.images];
  //     updatedImages[index] = value;
  //     return {
  //       ...prevValues,
  //       images: updatedImages,
  //     };
  //   });
  // };

  // const handleSubmit = () => {
  //   formValues.id = uuidv4();
  //   handlePostListing(formValues);
  // };

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
                  {/* <textarea
                        id="eventContent"
                        className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md mb-2"
                        placeholder="Enter event content here"
                      ></textarea> */}
                  <form className="mx-auto" onSubmit={handleSubmit}>
                    {/* <label htmlFor="id" className="block mb-2 font-bold">
                        ID:
                      </label>
                      <input
                        type="text"
                        id="id"
                        name="id"
                        value={formValues.id}
                        onChange={handleChange}
                        required
                        className="w-full p-2 border border-gray-300 rounded"
                      />
                      <label htmlFor="stall_id" className="block mb-2 font-bold">
                        Stall ID:
                      </label>
                      <input
                        type="text"
                        id="stall_id"
                        name="stall_id"
                        value={formValues.stall_id}
                        onChange={handleChange}
                        required
                        className="w-full p-2 border border-gray-300 rounded"
                      /> */}
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
                      value={formValues.title}
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
                      value={formValues.summary}
                      onChange={handleChange}
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
                        onClick={() => handleImageChange("")}
                        className="bg-blue-500 text-white px-4 py-2 rounded"
                      >
                        Add Image Url
                      </button>
                    </div>
                    {formValues.filter(([key]) => key === 'image').map(([_key, image], index) => (
                      <div key={index} className="flex items-center mb-2">
                        <input
                          type="text"
                          id={`image-${index}`}
                          name={`image-${index}`}
                          placeholder="Image Url"
                          value={image}
                          onChange={(e) => handleImageChange(e.target.value)}
                          className="w-1/2 p-2 border border-gray-300 rounded"
                        />
                        <button
                          onClick={() => {
                            setFormValues(prevValues => {
                              const filteredImages = prevValues.filter(([_key], imgIndex) => imgIndex !== index);
                              return filteredImages;
                            });
                          }}
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
                      value={formValues.location}
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
                      value={formValues.price}
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
                      value={formValues.currency}
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
                      value={formValues.t}
                      placeholder="Optional"
                      onChange={handleChange}
                      className="w-full p-2 border border-gray-300 rounded"
                    />

                    {/* <label htmlFor="quantity" className="block mb-2 font-bold">
                      Quantity:
                    </label>
                    <input
                      type="number"
                      id="quantity"
                      name="quantity"
                      value={formValues.quantity}
                      onChange={handleChange}
                      required
                      className="w-full p-2 border border-gray-300 rounded"
                    /> */}

                    {/* <div className="specs-container">
                      <label className="block mb-2 font-bold">
                        Specifications:
                      </label>
                      {formValues.specs.map((spec, index) => (
                        <div key={index} className="flex items-center mb-2">
                          <input
                            type="text"
                            placeholder="Key"
                            value={spec[0]}
                            onChange={(e) =>
                              handleSpecChange(index, e.target.value, spec[1])
                            }
                            className="w-1/2 p-2 border border-gray-300 rounded"
                          />
                          <input
                            type="text"
                            placeholder="Value"
                            value={spec[1]}
                            onChange={(e) =>
                              handleSpecChange(index, spec[0], e.target.value)
                            }
                            className="w-1/2 p-2 border border-gray-300 rounded"
                          />
                          <button
                            onClick={() => {
                              let temp = formValues.specs;
                              temp.splice(index, 1);
                              setFormValues((prevValues) => ({
                                ...prevValues,
                                specs: temp,
                              }));
                            }}
                          >
                            delete
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() =>
                          setFormValues((prevValues) => ({
                            ...prevValues,
                            specs: [...prevValues.specs, ["", ""]],
                          }))
                        }
                        className="bg-blue-500 text-white px-4 py-2 rounded"
                      >
                        Add Specification
                      </button>
                    </div> */}
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
              onClick={handleModalToggle}
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