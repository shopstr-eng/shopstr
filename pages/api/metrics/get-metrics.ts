import Repo from '@/utils/repo';
import { Knex } from 'knex';
import { DateTime, Interval } from 'luxon';
import type { NextApiRequest, NextApiResponse } from 'next'

let repo: Knex | null = null;
if (!repo) {
  repo = Repo();
}

type Data = {
  label: string;
  category: Category;
}

type Category = {
  title: string;
  subtitle: string;
  total: number;
  symbol: string;
  metrics: Metrics[];
};

type Metrics = {
  period: string;
} & {
  [label: string]: number;
}

const getParamsFromURI = (uri: string) => {
  // Get everything after the `?`
  const [, paramString] = uri.split('?');

  // Return parameters
  console.log(paramString)

  return new URLSearchParams(paramString);
};

export default async function GetMetrics(req: NextApiRequest, res: NextApiResponse) {
  const params = getParamsFromURI(req.url || '');
  const startDate = params.get('startDate')
  const endDate = params.get('endDate')
  let merchantId = params.get('merchantId')

  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'Missing startDate and/or endDate' })
  }

  const start = DateTime.fromISO(startDate).toSQL();
  const end = DateTime.fromISO(endDate).toSQL();
  const tz = DateTime.fromISO(startDate).zone.name || DateTime.fromISO(endDate).zone.name;
  const isToday = DateTime.fromISO(endDate).hasSame(DateTime.fromISO(startDate), 'day')
  console.log('isToday', isToday)
  const bucket = isToday ? '1 hour' : '1 day';

  const label = isToday ? DateTime.fromISO(startDate).toFormat('yyyy LLL dd') :
    `${DateTime.fromISO(startDate).toFormat('yyyy LLL dd')} - ${DateTime.fromISO(endDate).toFormat('yyyy LLL dd')}`

  console.log([bucket, label, start, end])

  // TODO: USE ONE SQL QUERY TO GET ALL DATA INSTEAD OF MULTIPLE QUERIES

  const salesMetricsPromise = repo?.raw<{ rows: Metrics[] }>(`
    SELECT time_bucket('${bucket}', time, '${tz}') AS period, cast(sum(total) AS INTEGER) AS "${label}"
    FROM invoices
    WHERE time BETWEEN '${start}' AND '${end}'
    AND status = 'PAID'
    GROUP BY period
    ORDER BY period DESC;`)

  const usersMetricsPromise = repo?.raw<{ rows: Metrics[] }>(`
    SELECT time_bucket('${bucket}', time, '${tz}') AS period, cast(count(distinct(user_id)) AS INTEGER) AS "${label}"
    FROM users
    WHERE time BETWEEN '${start}' AND '${end}'
    GROUP BY period
    ORDER BY period DESC;`)

  const productsMetricsPromise = repo?.raw<{ rows: Metrics[] }>(`
    SELECT time_bucket('${bucket}', time, '${tz}') AS period, cast(count(id) AS INTEGER) AS "${label}"
    FROM products
    WHERE time BETWEEN '${start}' AND '${end}'
    GROUP BY period
    ORDER BY period DESC;`)

  const messagesMetricsPromise = repo?.raw<{ rows: Metrics[] }>(`
    SELECT time_bucket('${bucket}', time, '${tz}') AS period, cast(count(id) AS INTEGER) AS "${label}"
    FROM messages
    WHERE time BETWEEN '${start}' AND '${end}'
    GROUP BY period
    ORDER BY period DESC;`)

  const [
    salesMetrics,
    usersMetrics,
    productsMetrics,
    messagesMetrics
  ] = await Promise.allSettled([
    salesMetricsPromise,
    usersMetricsPromise,
    productsMetricsPromise,
    messagesMetricsPromise
  ]);

  console.log(salesMetrics)
  console.log(usersMetrics)
  console.log(productsMetrics)
  console.log(messagesMetrics)

  let salesData: Data | null = null;
  if (salesMetrics.status === 'fulfilled' && salesMetrics.value) {
    console.log(salesMetrics.value)
    salesData = {
      label,
      category: {
        title: 'Total Sales',
        subtitle: 'Sales Over Time',
        total: salesMetrics.value.rows.reduce((prev, curr) => prev + curr[label], 0),
        symbol: 'sat',
        metrics: salesMetrics.value.rows
      }
    }
  }
  let usersData: Data | null = null;
  if (usersMetrics.status === 'fulfilled' && usersMetrics.value) {
    usersData = {
      label,
      category: {
        title: 'Total Users',
        subtitle: 'Users Over Time',
        total: usersMetrics.value.rows.reduce((prev, curr) => prev + curr[label], 0),
        symbol: '',
        metrics: usersMetrics.value.rows
      }
    }
  }
  let productsData: Data | null = null;
  if (productsMetrics.status === 'fulfilled' && productsMetrics.value) {
    productsData = {
      label,
      category: {
        title: 'Total Products Listed',
        subtitle: 'Products Over Time',
        total: productsMetrics.value.rows.reduce((prev, curr) => prev + curr[label], 0),
        symbol: '',
        metrics: productsMetrics.value.rows
      }
    }
  }
  let messagesData: Data | null = null;
  if (messagesMetrics.status === 'fulfilled' && messagesMetrics.value) {
    messagesData = {
      label,
      category: {
        title: 'Total Messages Sent',
        subtitle: 'Messages Over Time',
        total: messagesMetrics.value.rows.reduce((prev, curr) => prev + curr[label], 0),
        symbol: '',
        metrics: messagesMetrics.value.rows
      }
    }
  }

  const data = []
  if (salesData != null) data.push(salesData)
  if (usersData != null) data.push(usersData)
  if (productsData != null) data.push(productsData)
  if (messagesData != null) data.push(messagesData)

  return res.status(200).json(data)
}
