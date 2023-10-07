import type { NextApiRequest, NextApiResponse } from 'next';
import knex from 'knex';
import { DateTime } from 'luxon';
import { v4 as uuid } from 'uuid';
import { CashuMint, CashuWallet } from '@cashu/cashu-ts';
import repo from '../../../utils/repo';

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

const wallet = new CashuWallet(
  new CashuMint(
    "https://legend.lnbits.com/cashu/api/v1/4gr9Xcmz3XEkUNwiBiQGoC"
  )
);

const PostTransaction = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).json({});
  }

  const event = parseRequestBody(req.body);

  try {
    const response = await repo()('invoices').select('hash', 'total').where({ id: event.id });
    const hash = response[0].hash;
    const total = response[0].total;

    await wallet.requestTokens(total, hash);

  } catch (error: any) {
    console.error(error);

    if (error.message === 'Tokens already issued for this invoice.') {
      console.log('invoice has been paid')
      await repo()('invoices').where({ id: event.id }).update({
        status: 'PAID'
      });
    }
  }
  return res.status(201).json({});
};

export default PostTransaction;