import React from 'react';
import axios from 'axios';

const HomePage = () => {
  const handlePostListing = () => {
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
        content: 'hello world',
      }
    });
  };

  return(
    <div className="flex flex-col h-screen justify-center items-center bg-yellow-100">
      <div className="w-10/12 lg:w-2/3 xl:w-1/2 bg-purple-500 rounded-md py-8 px-16">
        <h1 className="text-3xl font-bold text-yellow-100 mb-8">Shopstr</h1>
        <div className="flex justify-between">
          <button
            className="bg-yellow-100 hover:bg-purple-700 text-purple-500 font-bold py-2 px-4 rounded"
            onClick={handlePostListing}
          >
            Add new listing
          </button>
        </div>
      </div>
    </div>
  );
};

export default HomePage;