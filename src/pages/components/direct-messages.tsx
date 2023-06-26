import { useState, useEffect } from 'react';
import axios from 'axios';
import { relayInit, nip04, getPublicKey, generatePrivateKey } from 'nostr-tools';

const DirectMessages = () => {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [showModal, setShowModal] = useState(false);

  const sk1 = localStorage.getItem('privateKey');
  const pk1 = localStorage.getItem('publicKey');

  const sk2 = generatePrivateKey();
  const pk2 = getPublicKey(sk2);

  useEffect(() => {
    const relayUrl = 'wss://relay.damus.io';
    const relay = relayInit(relayUrl);

    relay.on('connect', () => {
      console.log(`connected to ${relay.url}`);
    });
    relay.on('error', () => {
      console.log(`failed to connect to ${relay.url}`);
    });

    relay.connect();

    relay.sub([{ kinds: [4], authors: [pk1, pk2] }]).on('event', (event) => {
      let sender = event.pubkey;
      pk1 === sender;
      let plaintext = nip04.decrypt(localStorage.getItem('privateKey'), pk1, event.content);
    });

    return () => {
      relay.close();
    };
  }, []);

  const handleModalToggle = () => {
    setShowModal(!showModal);
  };

  const handleSendMessage = () => {
    axios({
      method: 'POST',
      url: '/api/nostr/post-event',
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        pubkey: pk1,
        privkey: sk1,
        created_at: Math.floor(Date.now() / 1000),
        kind: 4,
        tags: [['p', pk2]],
        content: inputValue,
      }
    });
    setInputValue('');
    setShowModal(false);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        {messages.map((message, index) => (
          <div
            key={index}
            className={`p-2 bg-gray-100 mb-2 rounded-md ${
              pk2 ? 'justify-end self-end' : 'justify-start self-start'
            }`}
          >
            <p className={`text-gray-700 ${pk2 ? 'text-right' : 'text-left'}`}>{message}</p>
          </div>
        ))}
      </div>
      <div className="flex items-center border-t border-gray-200 p-2">
        <input
          type="text"
          className="flex-grow mr-2 border border-gray-200 p-2 rounded-md"
          placeholder="Type a message..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
        />
        <button
          className="px-4 py-2 rounded-md bg-blue-500 hover:bg-blue-600 text-white"
          onClick={handleSendMessage}
        >
          Send
        </button>
      </div>
    </div>
  );
};

export default DirectMessages;
