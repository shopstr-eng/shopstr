import { useState, useEffect } from 'react';
import { MinusCircleIcon } from '@heroicons/react/24/outline';

const Relays = () => {
  const [relays, setRelays] = useState([]);
  // make initial state equal to proprietary relay
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedRelays = localStorage.getItem("relays");
      setRelays(storedRelays ? JSON.parse(storedRelays) : []);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("relays", JSON.stringify(relays));
  }, [relays]);

  const handleToggleModal = () => {
    setShowModal(!showModal);
  };

  const addRelay = () => {
    const relay = document.getElementById("relay") as HTMLTextAreaElement;
    handleToggleModal();
    setRelays([...relays, relay.value]);
  };

  const deleteRelay = (relayToDelete) => {
    setRelays(relays.filter(relay => relay !== relayToDelete));
  };
  
  return (
    <div>
      <div className="mt-8 mb-8 overflow-y-scroll max-h-96 bg-white rounded-md">
        {relays.map(relay => (
          <div key={relay} className="flex justify-between items-center mb-2">
            <div className="max-w-xsm truncate">
              {relay}
            </div>
            <MinusCircleIcon onClick={() => deleteRelay(relay)} className="w-5 h-5 text-red-500 hover:text-yellow-700 cursor-pointer" />
          </div>
        ))}
      </div>
      <button
        className="bg-yellow-100 hover:bg-purple-700 text-purple-500 font-bold py-2 px-4 rounded"
        onClick={handleToggleModal}
      >
        Add New Relay
      </button>
      <div className={`fixed z-10 inset-0 overflow-y-auto ${showModal ? "" : "hidden"}`}>
        <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
          <div className="fixed inset-0 transition-opacity" aria-hidden="true">
            <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
          </div>
          <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
          <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
            <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
              <div className="sm:flex sm:items-start">
                <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                  <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                    Add New Relay
                  </h3>
                  <div className="mt-2">
                    <textarea id="relay" className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md mb-2" placeholder="Enter relay here..."></textarea>
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
              <button
                type="button"
                className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-green-600 text-base font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 sm:ml-3 sm:w-auto sm:text-sm"
                onClick={addRelay}
              >
                Add Relay
              </button>
              <button
                type="button"
                className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                onClick={handleToggleModal}
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

export default Relays;
