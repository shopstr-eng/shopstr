
import React, { useState } from 'react';
import { Button, Input } from "@nextui-org/react";
import { SHOPSTRBUTTONCLASSNAMES } from "@/components/utility/STATIC-VARIABLES";
import { getLocalStorageData } from "@/components/utility/nostr-helper-functions";
import axios from 'axios';

export default function AddProfileForm() {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const { mints, tokens } = getLocalStorageData();

  const handleSubmit = async () => {
    try {
      setLoading(true);
      const { userNPub } = getLocalStorageData();
      
      const response = await axios.post('/api/nostr/add-profile', {
        npub: userNPub,
        name,
        proofs: tokens,
        mint: mints[0]
      });

      if (response.data.success) {
        alert('Profile added successfully!');
        setName('');
      }
    } catch (error) {
      alert('Failed to add profile');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Input
        label="Profile Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Enter your preferred name"
      />
      <Button
        className={SHOPSTRBUTTONCLASSNAMES}
        onClick={handleSubmit}
        disabled={loading || !name}
      >
        Pay 1000 sats to Add Profile
      </Button>
    </div>
  );
}
