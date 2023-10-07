import repo from '@/utils/repo';
import { DateTime } from 'luxon';
import type { NextApiRequest, NextApiResponse } from 'next'

const getParamsFromURI = (uri: string) => {
  // Get everything after the `?`
  const [, paramString] = uri.split('?');

  // Return parameters
  console.log(paramString)

  return new URLSearchParams(paramString);
};

export default async function GetTotalSales(req: NextApiRequest, res: NextApiResponse) {

  console.log('hiiii')
  const params = getParamsFromURI(req.url || '');
  let startDate = params.get('startDate') 
  let endDate = params.get('endDate')
  let merchantId = params.get('merchantId')

  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'Missing startDate and/or endDate' })
  }

  startDate = DateTime.fromISO(startDate).toUTC().toSQL();
  console.log(startDate)
  endDate = DateTime.fromISO(endDate).toUTC().toSQL();
  console.log(endDate)


  // console.log(repo.raw(`SELECT time_bucket('5 minutes', time) AS five_min, avg(total) FROM invoices WHERE time BETWEEN '${startDate}' AND '${endDate}' AND status = 'PAID' GROUP BY five_min ORDER BY five_min DESC;`).toQuery())
  const transactions = await repo().raw(`SELECT time_bucket('1 day', time) AS bucket, sum(total) AS value FROM invoices WHERE time BETWEEN '${startDate}' AND '${endDate}' AND status = 'PAID' AND merchant_id = '${merchantId}' GROUP BY bucket ORDER BY value DESC LIMIT 5;`)
  // const transactions = await repo().raw(`SELECT time_bucket('1 day', time) AS five_min, sum(total), count(id) FROM invoices WHERE time BETWEEN '2023-09-19 06:53:52.035' AND '2023-10-08 06:53:52.034' AND status = 'PAID' GROUP BY five_min ORDER BY five_min DESC;`)

  console.log(transactions)
  console.log(transactions.rows)
  return res.status(200).json(transactions.rows)
}
