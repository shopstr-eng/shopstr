const DisplayProduct = ({ product }: any) => {
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
  } = product;
  console.log(product);
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
    </div>
  );
};

export default DisplayProduct;
