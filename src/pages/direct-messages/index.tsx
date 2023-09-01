import { useState, useEffect } from 'react';
import axios from 'axios';
import { relayInit, nip04, getPublicKey, generatePrivateKey } from 'nostr-tools';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import getRelay from "../api/nostr/relays";

const DirectMessages = () => {
  const [chats, setChats] = useState(() => {
    const storedValue = localStorage.getItem("chats");
    return storedValue ? JSON.parse(storedValue) : [];
  });
  const [messages, setMessages] = useState<string[]>([]);
  const [currentChat, setCurrentChat] = useState(false);
  const [newPubKey, setNewPubKey] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const relay = getRelay();
    setMessages([]);

    relay.on('connect', () => {
      console.log(`connected to ${relay.url}`);
    });
    relay.on('error', () => {
      console.log(`failed to connect to ${relay.url}`);
    });

    relay.connect();

    let subParams: { kinds: number[]; authors?: string[] } = {
      kinds: [4],
    };

    if (currentChat) {
      subParams["authors"] = [localStorage.getItem('publicKey'), currentChat];
      // subParams["tags"] = [['p', currentChat], ['p', localStorage.getItem('publicKey')]];
      
      let nip04Sub = relay.sub([subParams]);
    
      nip04Sub.on("event", (event) => {
        let sk2 = localStorage.getItem("privateKey");
        let sender = event.pubkey;
        console.log(sender)
        console.log(event)
        let tagPubkey = event.tags[0][1];
        console.log(tagPubkey)
        let decrypt = async () => {
          try {
            if ((localStorage.getItem('publicKey') === sender && tagPubkey === currentChat) || (currentChat === sender && tagPubkey === localStorage.getItem('publicKey'))) {
              console.log(sender)
              console.log(event)
              return await nip04.decrypt(sk2, sender, event.content);
            };
          } catch (error) {
            console.error("Decryption error:", error);
            return ""; // Return an empty string or handle the error case appropriately for your application
          }
        };
        decrypt().then((plaintext) => {
          setMessages((messages) => [...messages, plaintext]);
        });
      });
    };

    return () => {
      relay.close();
    };
  }, [currentChat]);

  useEffect(() => {
    localStorage.setItem("chats", JSON.stringify(chats));
  }, [chats]);
  
  const handleToggleModal = () => {
    setShowModal(!showModal);
  };
  
  const handleGoBack = () => {
    setCurrentChat(false);
  };

  const handleEnterChat = () => {
    const pubkey = document.getElementById('pubkey') as HTMLTextAreaElement;
    setChats([...chats, pubkey.value]);
    setCurrentChat(pubkey.value);
  };

  const handleChange = (e) => {
    setMessage(e.target.value);
  };
  
  const handleSubmit = (e) => {
    e.preventDefault();
    if (message.trim() !== "") {
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
          kind: 4,
          tags: [['p', currentChat]],
          content: message,
        }
      });
      setMessage("");
    }
  };

  if (!currentChat) {
    return (
      <div>
        <div className="mt-8 mb-8 overflow-y-scroll max-h-96 bg-white rounded-md">
          {chats.map(chat => (
            <div key={chat} className="flex justify-between items-center mb-2">
              <div className="max-w-xsm truncate">{chat}</div>
              <div>{chat > 0 ? chat.messages[chat.messages.length - 1] : "No messages"}</div>
              <button onClick={() => setCurrentChat(chat)}>Enter Chat</button>
            </div>
          ))}
        </div>
        <button className="bg-yellow-100 hover:bg-purple-700 text-purple-500 font-bold py-2 px-4 rounded" onClick={handleToggleModal}>Start New Chat</button>
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
                      Start New Chat
                    </h3>
                    <div className="mt-2">
                      <textarea id="pubkey" className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md mb-2" placeholder="Enter pubkey here..."></textarea>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                <button
                  type="button"
                  className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-green-600 text-base font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 sm:ml-3 sm:w-auto sm:text-sm"
                  onClick={handleEnterChat}
                >
                  Enter Chat
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

  return (
    <div>
      <h2 className="flex flex-row items-center w-fit pr-2 align-middle text-yellow-500 hover:bg-purple-600 rounded-md cursor-pointer">
        <ArrowLeftIcon className="w-5 h-5 text-yellow-100 hover:text-purple-700" onClick={handleGoBack}>Go Back</ArrowLeftIcon>
        {currentChat}
      </h2>
    <div className="mt-8 mb-8 overflow-y-scroll max-h-96 bg-white rounded-md">
      {messages.map((message, index) => (
        <div key={index}>{message}</div>
      ))}
    </div>
      <form className="flex items-center" onSubmit={handleSubmit}>
        <input
          type="text"
          className="rounded-md py-1 px-2 mr-2 bg-gray-200 focus:outline-none focus:bg-white flex-grow"
          placeholder="Type your message..."
          value={message}
          onChange={handleChange}
        />
        <button
          type="submit"
          className="bg-yellow-100 hover:bg-purple-700 text-purple-500 font-bold rounded-md py-1 px-2"
        >
          Send
        </button>
      </form>
    </div>
  );
};

export default DirectMessages;
