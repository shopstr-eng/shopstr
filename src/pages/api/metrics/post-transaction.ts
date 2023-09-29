import type { NextApiRequest, NextApiResponse } from 'next';
import knex from 'knex';

export interface PostTransactionRequest {
    id: string;
    time: string;
    total: number;
    sub_total: number;
    tip_total: number;
    shipping_total: number;
    discount_total: number;
    fee_total: number;
    tax_total: number;
    currency: string;
    status: string;
    funding_source: string;
    notes: string;
    customer_id: string;
    merchant_id: string;
};

const parseRequestBody = (body: string) => {
  const parsedBody = typeof body === 'string' ? JSON.parse(body) : body;
  return parsedBody;
};

const PostTransaction = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).json({});
  }
  try {
    const event = parseRequestBody(req.body);

    await knex({
      client: 'pg',
      connection: {
        connectionString: process.env['DATABASE_URL'],
        ssl: { rejectUnauthorized: false, },
      },
      pool: {
        min: 2,
        max: 10
      },
      migrations: {
        tableName: 'knex_migrations'
      }
    })('transactions').insert(event);

    return res.status(200).json({});
  } catch (error) {
    console.error(error);
    return res.status(500).json({});
  }
};

export default PostTransaction;