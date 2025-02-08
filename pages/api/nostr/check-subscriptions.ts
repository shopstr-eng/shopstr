
import { NextApiRequest, NextApiResponse } from 'next';
import knex from '../../../knex';
import fs from 'fs';
import path from 'path';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get expired subscriptions
    const expiredSubs = await knex('subscriptions')
      .where('next_payment_date', '<=', new Date())
      .where('active', true);

    // Remove expired profiles from nostr.json
    const nostrFilePath = path.join(process.cwd(), 'public', '.well-known', 'nostr.json');
    const nostrData = JSON.parse(fs.readFileSync(nostrFilePath, 'utf8'));

    for (const sub of expiredSubs) {
      delete nostrData.names[sub.name];
      await knex('subscriptions')
        .where('id', sub.id)
        .update({ active: false });
    }

    fs.writeFileSync(nostrFilePath, JSON.stringify(nostrData, null, 2));

    return res.status(200).json({ success: true, deactivated: expiredSubs.length });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
