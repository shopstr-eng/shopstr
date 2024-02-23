import Repo from "@/utils/repo";
import { Knex } from "knex";
import { DateTime } from "luxon";
import type { NextApiRequest, NextApiResponse } from "next";

let repo: Knex | null = null;
if (!repo) {
  repo = Repo();
}

type Data = {
  label: string;
  category: Category;
};

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
};

const getParamsFromURI = (uri: string) => {
  // Get everything after the `?`
  const [, paramString] = uri.split("?");

  return new URLSearchParams(paramString);
};

export default async function GetMetrics(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const params = getParamsFromURI(req.url || "");
  const startDate = params.get("startDate");
  const endDate = params.get("endDate");
  let merchantId = params.get("merchantId");

  if (!startDate || !endDate) {
    return res.status(400).json({ error: "Missing startDate and/or endDate" });
  }

  const start = DateTime.fromISO(startDate).toSQL();
  const end = DateTime.fromISO(endDate).toSQL();
  const tz =
    DateTime.fromISO(startDate).zone.name ||
    DateTime.fromISO(endDate).zone.name;
  const isToday = DateTime.fromISO(endDate).hasSame(
    DateTime.fromISO(startDate),
    "day",
  );
  const bucket = isToday ? "1 hour" : "1 day";

  const label = isToday
    ? DateTime.fromISO(startDate).toFormat("yyyy LLL dd")
    : `${DateTime.fromISO(startDate).toFormat(
        "yyyy LLL dd",
      )} - ${DateTime.fromISO(endDate).toFormat("yyyy LLL dd")}`;

  // TODO: USE ONE SQL QUERY TO GET ALL DATA INSTEAD OF MULTIPLE QUERIES

  const salesMetricsPromise = repo?.raw<{ rows: Metrics[] }>(`
    SELECT time_bucket('${bucket}', date_time, '${tz}') AS period, cast(sum(total) AS INTEGER) AS "${label}"
    FROM transactions
    WHERE date_time BETWEEN '${start}' AND '${end}'
    GROUP BY period
    ORDER BY period DESC;`);

  const shoppersMetricsPromise = repo?.raw<{ rows: Metrics[] }>(`
    SELECT time_bucket('${bucket}', date_time, '${tz}') AS period, cast(count(distinct(shopper_id)) AS INTEGER) AS "${label}"
    FROM shoppers
    WHERE date_time BETWEEN '${start}' AND '${end}'
    GROUP BY period
    ORDER BY period DESC;`);

  const listingsMetricsPromise = repo?.raw<{ rows: Metrics[] }>(`
    SELECT time_bucket('${bucket}', date_time, '${tz}') AS period, cast(count(distinct(listing_id)) AS INTEGER) AS "${label}"
    FROM listings
    WHERE date_time BETWEEN '${start}' AND '${end}'
    GROUP BY period
    ORDER BY period DESC;`);

  const inquiriesMetricsPromise = repo?.raw<{ rows: Metrics[] }>(`
    SELECT time_bucket('${bucket}', date_time, '${tz}') AS period, cast(count(id) AS INTEGER) AS "${label}"
    FROM inquiries
    WHERE date_time BETWEEN '${start}' AND '${end}'
    GROUP BY period
    ORDER BY period DESC;`);

  const invoicesMetricsPromise = repo?.raw<{ rows: Metrics[] }>(`
    SELECT time_bucket('${bucket}', date_time, '${tz}') AS period, cast(count(id) AS INTEGER) AS "${label}"
    FROM invoices
    WHERE date_time BETWEEN '${start}' AND '${end}'
    GROUP BY period
    ORDER BY period DESC;`);

  const ordersMetricsPromise = repo?.raw<{ rows: Metrics[] }>(`
    SELECT time_bucket('${bucket}', date_time, '${tz}') AS period, cast(count(id) AS INTEGER) AS "${label}"
    FROM transactions
    WHERE date_time BETWEEN '${start}' AND '${end}'
    GROUP BY period
    ORDER BY period DESC;`);

  const [
    salesMetrics,
    shoppersMetrics,
    listingsMetrics,
    inquiriesMetrics,
    invoicesMetrics,
    ordersMetrics,
  ] = await Promise.allSettled([
    salesMetricsPromise,
    shoppersMetricsPromise,
    listingsMetricsPromise,
    inquiriesMetricsPromise,
    invoicesMetricsPromise,
    ordersMetricsPromise,
  ]);

  let salesData: Data | null = null;
  if (salesMetrics.status === "fulfilled" && salesMetrics.value) {
    salesData = {
      label,
      category: {
        title: "Total Sales",
        subtitle: "Sales Over Time",
        total: salesMetrics.value.rows.reduce(
          (prev, curr) => prev + curr[label],
          0,
        ),
        symbol: "sat",
        metrics: salesMetrics.value.rows,
      },
    };
  }
  let shoppersData: Data | null = null;
  if (shoppersMetrics.status === "fulfilled" && shoppersMetrics.value) {
    shoppersData = {
      label,
      category: {
        title: "Total Shoppers",
        subtitle: "Shoppers Over Time",
        total: shoppersMetrics.value.rows.reduce(
          (prev, curr) => prev + curr[label],
          0,
        ),
        symbol: "",
        metrics: shoppersMetrics.value.rows,
      },
    };
  }
  let listingsData: Data | null = null;
  if (listingsMetrics.status === "fulfilled" && listingsMetrics.value) {
    listingsData = {
      label,
      category: {
        title: "Total Listings Posted",
        subtitle: "Listings Over Time",
        total: listingsMetrics.value.rows.reduce(
          (prev, curr) => prev + curr[label],
          0,
        ),
        symbol: "",
        metrics: listingsMetrics.value.rows,
      },
    };
  }
  let inquiriesData: Data | null = null;
  if (inquiriesMetrics.status === "fulfilled" && inquiriesMetrics.value) {
    inquiriesData = {
      label,
      category: {
        title: "Total Inquiries Sent",
        subtitle: "Inquiries Over Time",
        total: inquiriesMetrics.value.rows.reduce(
          (prev, curr) => prev + curr[label],
          0,
        ),
        symbol: "",
        metrics: inquiriesMetrics.value.rows,
      },
    };
  }
  let invoicesData: Data | null = null;
  if (invoicesMetrics.status === "fulfilled" && invoicesMetrics.value) {
    invoicesData = {
      label,
      category: {
        title: "Total Invoices Created",
        subtitle: "Invoices Over Time",
        total: invoicesMetrics.value.rows.reduce(
          (prev, curr) => prev + curr[label],
          0,
        ),
        symbol: "",
        metrics: invoicesMetrics.value.rows,
      },
    };
  }
  let ordersData: Data | null = null;
  if (ordersMetrics.status === "fulfilled" && ordersMetrics.value) {
    ordersData = {
      label,
      category: {
        title: "Total Orders",
        subtitle: "Orders Over Time",
        total: ordersMetrics.value.rows.reduce(
          (prev, curr) => prev + curr[label],
          0,
        ),
        symbol: "",
        metrics: ordersMetrics.value.rows,
      },
    };
  }

  return res
    .status(200)
    .json(
      [
        salesData,
        shoppersData,
        listingsData,
        inquiriesData,
        invoicesData,
        ordersData,
      ].filter((n) => n),
    );
}
