
import { NextApiRequest, NextApiResponse } from 'next';
import knex from '../../../knex';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { npub } = req.query;

    if (!npub) {
      return res.status(400).json({ error: 'npub is required' });
    }

    const subscription = await knex('subscriptions')
      .where('npub', npub)
      .where('active', true)
      .orderBy('next_payment_date', 'desc')
      .first();

    return res.status(200).json({ subscription });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
