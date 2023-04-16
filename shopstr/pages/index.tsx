import React, { useState } from 'react';
import axios from 'axios';

function LoginPage() {
  const [publicKey, setPublicKey] = useState('');
  const [privateKey, setPrivateKey] = useState('');

  const handleSignIn = () => {
    // Sign in logic goes here
  }

  const handleGenerateKeys = () => {
    axios.get('/api/nostr/generate-keys')
      .then(response => {
        setPublicKey(response.data.pk);
        setPrivateKey(response.data.sk);
      })
      .catch(error => {
        console.error(error);
      });
  }

  return (
    <div className="flex flex-col h-screen justify-center items-center bg-yellow-100">
      <div className="w-1/2 bg-purple-500 rounded-md py-8 px-16">
        <h1 className="text-3xl font-bold text-center text-yellow-100 mb-8">Login</h1>
        <label className="text-xl text-yellow-100">Public Key</label>
        <input
          type="text"
          className="border-b-2 border-yellow-100 mb-4 bg-purple-500 focus:outline-none focus:border-purple-900 text-white text-xl"
          value={publicKey}
          onChange={(e) => setPublicKey(e.target.value)}
        />
        <label className="text-xl text-yellow-100">Private Key</label>
        <input
          type="text"
          className="border-b-2 border-yellow-100 mb-4 bg-purple-500 focus:outline-none focus:border-purple-900 text-white text-xl"
          value={privateKey}
          onChange={(e) => setPrivateKey(e.target.value)}
        />
        <div className="flex justify-center">
          <button
            className="rounded-full py-2 px-6 bg-yellow-100 text-purple-500 font-bold text-xl mr-4"
            onClick={handleGenerateKeys}
          >Generate</button>
          <button
            className="rounded-full py-2 px-6 bg-purple-900 text-yellow-100 font-bold text-xl"
            onClick={handleSignIn}
          >Sign In</button>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
