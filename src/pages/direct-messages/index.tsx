import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { nip04, nip19, SimplePool } from 'nostr-tools';
import 'websocket-polyfill';
import { ArrowUturnLeftIcon, MinusCircleIcon } from '@heroicons/react/24/outline';
import * as CryptoJS from 'crypto-js';

const DirectMessages = () => {
  const [decryptedNpub, setDecryptedNpub] = useState("");
  const [encryptedPrivateKey, setEncryptedPrivateKey] = useState("");
  const [signIn, setSignIn] = useState("");
  const [relays, setRelays] = useState([]);
  
  const [chats, setChats] = useState([]);
  const [messages, setMessages] = useState([]);
  const [currentChat, setCurrentChat] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [message, setMessage] = useState("");

  const [enterPassphrase, setEnterPassphrase] = useState(false);
  const [passphrase, setPassphrase] = useState("");

  const [thisChat, setThisChat] = useState("");

  const bottomDivRef = useRef();
  
  useEffect(() => {
    bottomDivRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const npub = localStorage.getItem("npub");
      const { data } = nip19.decode(npub);
      setDecryptedNpub(data);
      const encrypted = localStorage.getItem("encryptedPrivateKey");
      setEncryptedPrivateKey(encrypted);
      const signIn = localStorage.getItem("signIn");
      setSignIn(signIn);
      const storedRelays = localStorage.getItem("relays");
      setRelays(storedRelays ? JSON.parse(storedRelays) : []);
      const storedChats = localStorage.getItem("chats");
      setChats(storedChats ? JSON.parse(storedChats) : []);
    }
  }, []);

  useEffect(() => {
    const pool = new SimplePool();
    setMessages([]);

    let subParams: { kinds: number[]; authors?: string[] } = {
      kinds: [4],
    };

    if (currentChat) {
      let { data: chatPubkey } = nip19.decode(currentChat);
      
      subParams["authors"] = [decryptedNpub, chatPubkey];
      
      let nip04Sub = pool.sub(relays, [subParams]);
    
      nip04Sub.on("event", async (event) => {
        let sender = event.pubkey;

        let tagPubkey = event.tags[0][1];

        let plaintext;
        if ((decryptedNpub === sender && tagPubkey === chatPubkey) || (chatPubkey === sender && tagPubkey === decryptedNpub)) {
          if (signIn === "extension") {
            plaintext = await window.nostr.nip04.decrypt(chatPubkey, event.content);
          } else {
            let nsec = CryptoJS.AES.decrypt(encryptedPrivateKey, passphrase).toString(CryptoJS.enc.Utf8);
            // add error handling and re-prompt for passphrase
            let { data } = nip19.decode(nsec);
            let sk2 = data;
            plaintext = await nip04.decrypt(sk2, chatPubkey, event.content);
          }
        };
        let created_at = event.created_at;

        setMessages((prevMessages) => 
          [...prevMessages, { plaintext: plaintext, createdAt: created_at, sender: sender }]
        );
        setMessages((prevMessages) => 
          prevMessages.sort((a, b) => a.createdAt - b.createdAt)
        );
      });
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

  const handleEnterNewChat = () => {
    const npubText = document.getElementById('pubkey') as HTMLTextAreaElement;
    const validNpub = /^npub[a-zA-Z0-9]{59}$/;

    if (validNpub.test(npubText.value)) {
      if (signIn != "extension") {
        if (CryptoJS.AES.decrypt(encryptedPrivateKey, passphrase).toString(CryptoJS.enc.Utf8)) {
          setChats([...chats, npubText.value]);
          setCurrentChat(npubText.value);
          setShowModal(!showModal);
        } else {
          alert("Invalid passphrase!");
        };
      } else {
        setChats([...chats, npubText.value]);
        setCurrentChat(npubText.value);
        setShowModal(!showModal);
      };
    } else {
      alert("Invalid pubkey!");
      npubText.value = "";
    };
  };

  const handleChange = (e) => {
    setMessage(e.target.value);
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (message.trim() !== "") {
      if (signIn === "extension") {
        const { data } = nip19.decode(currentChat);
        const event = {
          created_at: Math.floor(Date.now() / 1000),
          kind: 4,
          tags: [['p', data]],
          content: await window.nostr.nip04.encrypt(data, message),
        }
    
        const signedEvent = await window.nostr.signEvent(event);
  
        const pool = new SimplePool();
  
        // const relays = JSON.parse(storedRelays);
    
        await pool.publish(relays, signedEvent);
    
        let events = await pool.list(relays, [{ kinds: [0, signedEvent.kind] }]);
        let postedEvent = await pool.get(relays, {
          ids: [signedEvent.id],
        });
      } else {
        let nsec = CryptoJS.AES.decrypt(encryptedPrivateKey, passphrase).toString(CryptoJS.enc.Utf8);
        // add error handling and re-prompt for passphrase
        let { data: privkey } = nip19.decode(nsec);
        // request passphrase in popup or form and pass to api

        let { data: chatPubkey } = nip19.decode(currentChat);
        
        axios({
          method: 'POST',
          url: '/api/nostr/post-event',
          headers: {
            'Content-Type': 'application/json',
          },
          data: {
            pubkey: decryptedNpub,
            privkey: privkey,
            created_at: Math.floor(Date.now() / 1000),
            kind: 4,
            tags: [['p', chatPubkey]],
            content: message,
            relays: relays,
          }
        });
      };
      setMessage("");
    };
  };

  const handlePassphraseChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    if (name === "passphrase") {
      setPassphrase(value);
    };
  };

  const signInCheck = (chat: string) => {
    if (signIn != "extension") {
      handleEnterPassphrase(chat);
    } else {
      setCurrentChat(chat);
    }
  }

  const handleEnterPassphrase = (chat: string) => {
    setEnterPassphrase(!enterPassphrase);
    setThisChat(chat);
  };

  const handleSubmitPassphrase = () => {
    if (CryptoJS.AES.decrypt(encryptedPrivateKey, passphrase).toString(CryptoJS.enc.Utf8)) {
      setEnterPassphrase(false);
      setCurrentChat(thisChat);
    } else {
      alert("Invalid passphrase!");
    }
  };

  const deleteChat = (chatToDelete) => {
    setChats(chats.filter((chat) => chat !== chatToDelete));
  };

  if (!currentChat) {
    return (
      <div>
        <div className="mt-8 mb-8 overflow-y-scroll max-h-[70vh] bg-white rounded-md">
          {chats.map(chat => (
            <div key={chat} className="flex justify-between items-center mb-2">
              <div className="max-w-xsm truncate">
                {chat}
              </div>
              <button onClick={() => signInCheck(chat)}>
                Enter Chat
              </button>
              <MinusCircleIcon onClick={() => deleteChat(chat)} className="w-5 h-5 text-red-500 hover:text-yellow-700 cursor-pointer" />
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
                      {
                        signIn === 'nsec' && (
                          <>
                            <label htmlFor="passphrase" className="block mb-2 font-bold">
                              Passphrase:<span className="text-red-500">*</span>
                            </label>
                            <input
                              type="text"
                              id="passphrase"
                              name="passphrase"
                              value={passphrase}
                              required
                              onChange={handlePassphraseChange}
                              className="w-full p-2 border border-gray-300 rounded"
                            />
                          </>
                        )
                      }
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                <button
                  type="button"
                  className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-green-600 text-base font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 sm:ml-3 sm:w-auto sm:text-sm"
                  onClick={handleEnterNewChat}
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
        <div
          className={`fixed z-10 inset-0 overflow-y-auto ${
            enterPassphrase & signIn === 'nsec' ? "" : "hidden"
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
                      Enter Passphrase
                    </h3>
                    <div className="mt-2">
                      <form className="mx-auto" onSubmit={() => handleSubmitPassphrase()}>
                        <label htmlFor="t" className="block mb-2 font-bold">
                          Passphrase:<span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          id="passphrase"
                          name="passphrase"
                          value={passphrase}
                          required
                          onChange={handlePassphraseChange}
                          className="w-full p-2 border border-gray-300 rounded"
                        />
                      </form>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                <button
                  type="button"
                  className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-green-600 text-base font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 sm:ml-3 sm:w-auto sm:text-sm"
                  onClick={() => handleSubmitPassphrase()}
                >
                  Submit
                </button>
                <button
                  type="button"
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                  onClick={() => {
                    handleEnterPassphrase("");
                  }}
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
        <ArrowUturnLeftIcon className="w-5 h-5 text-yellow-100 hover:text-purple-700" onClick={handleGoBack}>Go Back</ArrowUturnLeftIcon>
        {currentChat}
      </h2>
      <div className="mt-8 mb-8 overflow-y-scroll max-h-[70vh] bg-white rounded-md">
        {messages.map((message, index) => (
          <div 
             key={index}
             className={`my-2 flex ${
               message.sender === decryptedNpub
                 ? 'justify-end'
                 : message.sender === currentChat
                 ? 'justify-start'
                 : ''}`
             }
           >
            <p
             className={`inline-block p-3 rounded-lg max-w-[100vh] break-words ${
               message.sender === decryptedNpub
                 ? 'bg-purple-200'
                 : message.sender === currentChat
                 ? 'bg-gray-300'
                 : ''}`
             }
            >
              {message.plaintext}
            </p>
          </div>
        ))}
        <div ref={bottomDivRef} />
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
