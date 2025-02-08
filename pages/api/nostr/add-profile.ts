
import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';
import { nip19 } from 'nostr-tools';
import { CashuMint, CashuWallet } from '@cashu/cashu-ts';
import { v4 as uuidv4 } from 'uuid';
import knex from '../../../knex';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { npub, name, proofs, mint } = req.body;

    // Validate payment amount (e.g., 1000 sats)
    const requiredAmount = 1000;
    const wallet = new CashuWallet(new CashuMint(mint));
    
    // Verify proofs
    const totalAmount = proofs.reduce((sum: number, proof: any) => sum + proof.amount, 0);
    if (totalAmount < requiredAmount) {
      return res.status(400).json({ error: 'Insufficient payment' });
    }

    // Verify and receive tokens
    const proofsResponse = await wallet.receive(proofs);
    if (!proofsResponse) {
      return res.status(400).json({ error: 'Invalid proofs' });
    }

    // Decode npub to hex format
    const { data: pubkey } = nip19.decode(npub);

    // Read existing nostr.json
    const nostrFilePath = path.join(process.cwd(), 'public', '.well-known', 'nostr.json');
    const nostrData = JSON.parse(fs.readFileSync(nostrFilePath, 'utf8'));

    // Add new profile
    nostrData.names[name] = pubkey;

    // Write updated file
    fs.writeFileSync(nostrFilePath, JSON.stringify(nostrData, null, 2));

    // Create subscription record
    const now = new Date();
    const nextPaymentDate = new Date(now.setMonth(now.getMonth() + 1));
    
    await knex('subscriptions').insert({
      id: uuidv4(),
      npub,
      name,
      start_date: new Date(),
      last_payment_date: new Date(),
      next_payment_date: nextPaymentDate,
      amount: requiredAmount,
      active: true
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
