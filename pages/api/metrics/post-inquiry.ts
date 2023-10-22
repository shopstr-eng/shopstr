import type { NextApiRequest, NextApiResponse } from 'next';
import { DateTime } from 'luxon';
import { v4 as uuid } from 'uuid';
import repo from '../../../utils/repo';
import { getLocationFromAddress, getLocationFromReqHeaders, locationToSqlGeo } from '@/utils/geo';

const parseRequestBody = (body: string) => {
  const parsedBody = typeof body === 'string' ? JSON.parse(body) : body;
  return parsedBody;
};

const PostMetric = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).json({});
  }

  const event = parseRequestBody(req.body);

  try {
    await repo()('inquiries').insert({
      id: uuid(),
      date_time: DateTime.now().toUTC().toSQL(),
      customer_id: event.customer_id,
      merchant_id: event.merchant_id,
      customer_location: locationToSqlGeo(await getLocationFromReqHeaders(req.headers)),
      listing_id: event.listing_id,
      relays: event.relays,
    });
  } catch (error: any) {
    console.error(error);
  }
  return res.status(201).json({});
};

export default PostMetric;
