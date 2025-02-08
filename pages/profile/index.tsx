
import React, { useEffect, useState } from 'react';
import AddProfileForm from '@/components/utility-components/add-profile-form';
import { Button } from '@nextui-org/react';
import axios from 'axios';
import { getLocalStorageData } from '@/components/utility/nostr-helper-functions';

export default function ProfilePage() {
  const [subscription, setSubscription] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { userNPub } = getLocalStorageData();

  useEffect(() => {
    const fetchSubscription = async () => {
      try {
        const response = await axios.get(`/api/nostr/check-subscription?npub=${userNPub}`);
        setSubscription(response.data.subscription);
      } catch (error) {
        console.error('Failed to fetch subscription:', error);
      } finally {
        setLoading(false);
      }
    };

    if (userNPub) {
      fetchSubscription();
    } else {
      setLoading(false);
    }
  }, [userNPub]);

  if (loading) {
    return <div className="min-h-screen bg-light-bg pt-24 dark:bg-dark-bg">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-light-bg pt-24 dark:bg-dark-bg">
      <div className="container mx-auto px-4">
        <h1 className="mb-8 text-2xl font-bold text-light-text dark:text-dark-text">
          Profile Management
        </h1>
        
        {subscription ? (
          <div className="rounded-lg bg-light-fg p-6 dark:bg-dark-fg">
            <h2 className="mb-4 text-xl font-semibold text-light-text dark:text-dark-text">
              Active Subscription
            </h2>
            <div className="mb-2 text-light-text dark:text-dark-text">
              Name: {subscription.name}
            </div>
            <div className="mb-2 text-light-text dark:text-dark-text">
              Next Payment: {new Date(subscription.next_payment_date).toLocaleDateString()}
            </div>
            <div className="mb-4 text-light-text dark:text-dark-text">
              Status: {subscription.active ? 'Active' : 'Inactive'}
            </div>
          </div>
        ) : (
          <div className="rounded-lg bg-light-fg p-6 dark:bg-dark-fg">
            <h2 className="mb-4 text-xl font-semibold text-light-text dark:text-dark-text">
              Add Your Profile
            </h2>
            <AddProfileForm />
          </div>
        )}
      </div>
    </div>
  );
}
