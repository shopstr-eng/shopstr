import React, { useState } from 'react';
import axios from 'axios';
import DisplayEvents from '../components/display-events';

const HomePage = () => {
  const [showModal, setShowModal] = useState(false);
  
  const handleModalToggle = () => {
    setShowModal(!showModal);
  };
  
  const handlePostListing = () => {
    const eventContent = document.getElementById('eventContent') as HTMLTextAreaElement;
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
        kind: 1,
        tags: [],
        content: eventContent.value,
      }
    });
    setShowModal(false);
  };

  return(
    <div className="flex flex-col h-screen justify-center items-center bg-yellow-100">
      <div className="w-10/12 lg:w-2/3 xl:w-1/2 bg-purple-500 rounded-md py-8 px-16">
        <h1 className="text-3xl font-bold text-yellow-100 mb-8">Shopstr</h1>
        <DisplayEvents />
        <div className="flex justify-between">
          <button
            className="bg-yellow-100 hover:bg-purple-700 text-purple-500 font-bold py-2 px-4 rounded"
            onClick={handleModalToggle}
          >
            Add new listing
          </button>
        </div>
        <div className={`fixed z-10 inset-0 overflow-y-auto ${showModal ? "" : "hidden"}`}>
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity" aria-hidden="true">
              <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
            </div>
            <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <div className="sm:flex sm:items-start">
                  <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-green-100 sm:mx-0 sm:h-10 sm:w-10">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
                    </svg>
                  </div>
                  <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                    <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                      Add New Listing
                    </h3>
                    <div className="mt-2">
                      <textarea id="eventContent" className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md mb-2" placeholder="Enter event content here"></textarea>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                <button
                  type="button"
                  className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-green-600 text-base font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 sm:ml-3 sm:w-auto sm:text-sm"
                  onClick={handlePostListing}
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
      </div>
    </div>
  );
};

export default HomePage;