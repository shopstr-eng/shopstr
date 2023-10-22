import type { NextApiRequest, NextApiResponse } from 'next';
import { DateTime } from 'luxon';
import { v4 as uuid } from 'uuid';
import repo from '../../../utils/repo';
import { getLocationFromReqHeaders, locationToSqlGeo } from '@/utils/geo';

const parseRequestBody = (body: string) => {
  const parsedBody = typeof body === 'string' ? JSON.parse(body) : body;
  return parsedBody;
};

const PostShopper = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).json({});
  }

  const event = parseRequestBody(req.body);

  try {
    await repo()('shoppers').insert({
      id: uuid(),
      shopper_id: event.id,
      date_time: DateTime.now().toUTC().toSQL(),
      shopper_location: locationToSqlGeo(await getLocationFromReqHeaders(req.headers)),
    });
  } catch (error: any) {
    console.error(error);
  }
  return res.status(201).json({});
};

export default PostShopper;
