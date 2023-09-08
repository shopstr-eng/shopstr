import { useState, useEffect } from 'react';
import axios from 'axios';
import { withRouter, NextRouter } from 'next/router';

const LoginPage = ({ router }: { router: NextRouter }) => {
  const [publicKey, setPublicKey] = useState<string>('');
  const [privateKey, setPrivateKey] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [disabled, setDisabled] = useState<boolean>(false);
  const [validPublicKey, setValidPublicKey] = useState<boolean>(false);
  const [validPrivateKey, setValidPrivateKey] = useState<boolean>(false);

  const handleSignIn = () => {
    if (validPublicKey && validPrivateKey) { // Check both key strings for validity
      // Store credentials in local storage
      localStorage.setItem('publicKey', publicKey);
      localStorage.setItem('privateKey', privateKey);

      // Redirect user to home page
      router.push('/marketplace');
    } else {
      // Handle authentication failure
      setErrorMessage('The public and/or private keys inputted were not valid. Generate a new key pair or try again.');
    }
  };

  const handleGenerateKeys = () => {
    setDisabled(true);
    axios({
      method: 'GET',
      url: '/api/nostr/generate-keys',
    })
      .then((response) => {
        setPublicKey(response.data.pk);
        setPrivateKey(response.data.sk);
        setErrorMessage(''); // Reset error message
        setDisabled(true); // Re-enable button
        alert('Make sure to write down and save your public and private keys in a secure format!');
      })
      .catch((error) => {
        console.error(error);
        setDisabled(false); // Re-enable button on error
      });
  };

  const startExtensionLogin = async () => {
    try {
      // @ts-ignore
      var pubkey = await window.nostr.getPublicKey();
      setPublicKey(pubkey);
      router.push("/marketplace");
      let successStr = "signed in as " + pubkey;
      alert(successStr);
    } catch (error) {
      alert("Nostr extension sign on failed");
    }
  };

  useEffect(() => {
    startExtensionLogin();
  }, []);

  useEffect(() => {
    const validKeyString = /[a-f0-9]{64}/;

    setValidPublicKey(publicKey.match(validKeyString) !== null);
    setValidPrivateKey(privateKey.match(validKeyString) !== null);
  }, [publicKey, privateKey]);

  return (
    <div className="flex flex-col h-full justify-center items-center bg-yellow-100 rounded-md">
      <div className="w-10/12 lg:w-2/3 xl:w-1/2 bg-purple-500 rounded-md py-8 px-16">
        <h1 className="text-3xl font-bold text-center text-yellow-100 mb-8">Shopstr</h1>
        {errorMessage && (
          <div className="bg-red-500 text-white py-2 px-4 rounded mb-4">{errorMessage}</div>
        )}
        <div className="flex flex-col mb-4">
          <label className="text-xl text-yellow-100">Public Key</label>
          <input
            type="text"
            className="border-b-2 border-yellow-100 bg-purple-900 focus:outline-none focus:border-purple-900 text-yellow-100 text-xl"
            value={publicKey}
            onChange={(e) => setPublicKey(e.target.value)}
            style={{ borderColor: validPublicKey ? 'green' : 'red' }}
          />
        </div>
        <div className="flex flex-col mb-4">
          <label className="text-xl text-yellow-100">Private Key</label>
          <input
            type="text"
            className="border-b-2 border-yellow-100 bg-purple-900 focus:outline-none focus:border-purple-900 text-yellow-100 text-xl"
            value={privateKey}
            onChange={(e) => setPrivateKey(e.target.value)}
            style={{ borderColor: validPrivateKey ? 'green' : 'red' }}
          />
        </div>
        <div className="flex justify-between">
          <button
            className="bg-yellow-100 hover:bg-purple-700 text-purple-500 font-bold py-2 px-4 rounded"
            onClick={handleGenerateKeys}
            disabled={disabled}
          >
            Generate Keys
          </button>
          <button
            className="bg-yellow-100 hover:bg-purple-700 text-purple-500 font-bold py-2 px-4 rounded"
            onClick={startExtensionLogin}
          >
            Sign In with Nostr Extension
          </button>
          <button
            className="bg-yellow-100 hover:bg-purple-700 text-purple-500 font-bold py-2 px-4 rounded"
            onClick={handleSignIn}
            disabled={!validPublicKey || !validPrivateKey} // Disable the button only if both key strings are invalid or the button has already been clicked
          >
            Sign In
          </button>
        </div>
      </div>
    </div>
  );
};

export default withRouter(LoginPage);
