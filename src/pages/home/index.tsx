import React, { useState } from 'react';
import Link from 'next';
import axios from 'axios';
import DisplayEvents from '../components/display-events';
import DirectMessages from '../components/direct-messages';
import { EnvelopeIcon, HomeIcon, WalletIcon } from '@heroicons/react/24/outline';

const HomePage = () => {
  const [displayComponent, setDisplayComponent] = useState('home');

  return(
    <div className="flex flex-col h-screen justify-center items-center bg-yellow-100">
      <div className="w-10/12 lg:w-2/3 xl:w-1/2 bg-purple-500 rounded-md py-8 px-16">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-yellow-100">Shopstr</h1>
          <div className="flex space-x-2">
            <HomeIcon
              className={`w-6 h-6 hover:text-purple-700 ${displayComponent === 'home' ? 'text-yellow-100' : ''}`}
              onClick={() => setDisplayComponent('home')}
            />
            <EnvelopeIcon
              className={`w-6 h-6 hover:text-purple-700 ${displayComponent === 'messages' ? 'text-yellow-100' : ''}`}
              onClick={() => setDisplayComponent('messages')}
            />
            <WalletIcon
              className={`w-6 h-6 hover:text-purple-700 ${displayComponent === 'wallet' ? 'text-yellow-100' : ''}`}
              onClick={() => setDisplayComponent('wallet')}
            />
          </div>
        </div>
        {displayComponent === 'home' && <DisplayEvents />}
        {displayComponent === 'messages' && <DirectMessages />}
      </div>
    </div>
  );
};

export default HomePage;