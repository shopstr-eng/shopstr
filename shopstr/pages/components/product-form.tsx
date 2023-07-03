import { useState } from "react";
import { v4 as uuidv4 } from "uuid";

export interface ProductFormValues {
  id: string;
  stall_id: string;
  name: string;
  description?: string;
  images: string[];
  currency: string;
  price: number;
  quantity: number;
  specs: [string, string][];
}

interface ProductFormProps {
  handlePostListing: (product: ProductFormValues) => void;
  handleModalToggle: () => void;
  showModal: boolean;
}
const ProductForm = ({
  handlePostListing,
  showModal,
  handleModalToggle,
}: ProductFormProps) => {
  const [formValues, setFormValues] = useState<ProductFormValues>({
    id: "",
    stall_id: "",
    name: "",
    description: "",
    images: [],
    currency: "",
    price: 0,
    quantity: 1,
    specs: [],
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    if (name === "price" || name === "quantity") {
      setFormValues((prevValues) => ({
        ...prevValues,
        [name]: parseInt(value),
      }));
      return;
    }
    setFormValues((prevValues) => ({
      ...prevValues,
      [name]: value,
    }));
  };

  const handleSpecChange = (index: number, key: string, value: string) => {
    setFormValues((prevValues) => {
      const updatedSpecs = [...prevValues.specs];
      updatedSpecs[index] = [key, value];
      return {
        ...prevValues,
        specs: updatedSpecs,
      };
    });
  };

  const handleImageChange = (index: number, value: string) => {
    setFormValues((prevValues) => {
      const updatedImages = [...prevValues.images];
      updatedImages[index] = value;
      return {
        ...prevValues,
        images: updatedImages,
      };
    });
  };

  console.log(formValues);

  const handleSubmit = () => {
    formValues.id = uuidv4();
    console.log(formValues);
    handlePostListing(formValues);
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
              <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-green-100 sm:mx-0 sm:h-10 sm:w-10">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-6 w-6 text-green-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                  ></path>
                </svg>
              </div>
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
                    <label htmlFor="name" className="block mb-2 font-bold">
                      Product Name:
                    </label>
                    <input
                      type="text"
                      id="name"
                      name="name"
                      value={formValues.name}
                      onChange={handleChange}
                      required
                      className="w-full p-2 border border-gray-300 rounded"
                    />

                    <label
                      htmlFor="description"
                      className="block mb-2 font-bold"
                    >
                      Product Description:
                    </label>
                    <textarea
                      id="description"
                      name="description"
                      value={formValues.description}
                      onChange={handleChange}
                      className="w-full p-2 border border-gray-300 rounded"
                    />
                    <div className="flex items-center mb-2">
                      <label
                        htmlFor="images"
                        className="block mb-2 font-bold pr-3"
                      >
                        Product Images:
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          setFormValues((prevValues) => ({
                            ...prevValues,
                            images: [...prevValues.images, ""],
                          }))
                        }
                        className="bg-blue-500 text-white px-4 py-2 rounded"
                      >
                        Add Image Url
                      </button>
                    </div>
                    {formValues.images.map((image, index) => (
                      <div key={index} className="flex items-center mb-2">
                        <input
                          type="text"
                          id="images"
                          name="images"
                          placeholder="Image Url"
                          value={image}
                          onChange={(e) =>
                            handleImageChange(index, e.target.value)
                          }
                          className="w-1/2 p-2 border border-gray-300 rounded"
                        />
                        <button
                          onClick={() => {
                            let temp = formValues.images;
                            temp.splice(index, 1);
                            setFormValues((prevValues) => ({
                              ...prevValues,
                              images: temp,
                            }));
                          }}
                        >
                          delete
                        </button>
                      </div>
                    ))}

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

                    <label htmlFor="quantity" className="block mb-2 font-bold">
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
                    />

                    <div className="specs-container">
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
                    </div>
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
