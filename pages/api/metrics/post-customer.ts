import type { NextApiRequest, NextApiResponse } from 'next';
import { DateTime } from 'luxon';
import { v4 as uuid } from 'uuid';
import repo from '../../../utils/repo';

const parseRequestBody = (body: string) => {
  const parsedBody = typeof body === 'string' ? JSON.parse(body) : body;
  return parsedBody;
};

const PostCustomer = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).json({});
  }

  const event = parseRequestBody(req.body);

  try {
    await repo()('customers').insert({
      id: uuid(),
      time: DateTime.now().toUTC().toSQL(),
      customer_id: event.customer_id,
      merchant_id: event.merchant_id,
    });
    return res.status(201).json({});
  } catch (error: any) {
    console.error(error);
  }
};

export default PostCustomer;