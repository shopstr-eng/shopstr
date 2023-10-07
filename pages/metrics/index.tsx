'use client';

import { Card, Metric, Text, Title, BarList, Flex, Grid, DateRangePicker, DateRangePickerValue } from '@tremor/react';
import Chart from './totalSalesCard';
import { ChartData, formatDataWithEmptyDateTime } from '@/utils/metrics';
import { DateTime } from 'luxon';
import { useState, useEffect } from 'react';
import TotalSalesCard from './totalSalesCard';
import UniqueCustomers from './uniqueCustomers';

const website = [
  { name: '/home', value: 1230 },
  { name: '/contact', value: 751 },
  { name: '/gallery', value: 471 },
  { name: '/august-discount-offer', value: 280 },
  { name: '/case-studies', value: 78 }
];

const shop = [
  { name: '/home', value: 453 },
  { name: '/imprint', value: 351 },
  { name: '/shop', value: 271 },
  { name: '/pricing', value: 191 }
];

const app = [
  { name: '/shop', value: 789 },
  { name: '/product-features', value: 676 },
  { name: '/about', value: 564 },
  { name: '/login', value: 234 },
  { name: '/downloads', value: 191 }
];

const data = [
  {
    category: 'Most Viewed',
    stat: '10,234',
    data: website
  },
  {
    category: 'Top Selling',
    stat: '12,543',
    data: shop
  },
  {
    category: 'Mobile App',
    stat: '2,543',
    data: app
  }
];

export default function MetricsPage() {

  const [value, setValue] = useState<DateRangePickerValue>({
    from: DateTime.now().minus({ days: 7 }).toJSDate(),
    to: DateTime.now().toJSDate(),
  });

  return (
    <main className="p-4 md:p-10 mx-auto max-w-7xl">
      {/* 
      1 day - 15 minute interval
      7 days - hourly interval
      30 days - daily interval
       */}
      <DateRangePicker
        className="max-w-md mx-auto"
        value={value}
        onValueChange={setValue}
        color="rose"
      ></DateRangePicker>
      <Grid numItemsSm={2} numItemsLg={3} className="gap-6">
        <TotalSalesCard
          startDate={DateTime.fromJSDate(value.from || new Date()).toISO() || ''}
          endDate={DateTime.fromJSDate(value.to || new Date()).toISO() || ''}
          interval='WEEK'
        ></TotalSalesCard>
        <UniqueCustomers
          startDate={DateTime.fromJSDate(value.from || new Date()).toISO() || ''}
          endDate={DateTime.fromJSDate(value.to || new Date()).toISO() || ''}
          interval='WEEK'
        ></UniqueCustomers>
        {/* {data.map((item) => (
          <Card key={item.category}>
            <Title>{item.category}</Title>
            <Flex
              justifyContent="start"
              alignItems="baseline"
              className="space-x-2"
            >
              <Metric>{item.stat}</Metric>
              <Text>Total views</Text>
            </Flex>
            <Flex className="mt-6">
              <Text>Pages</Text>
              <Text className="text-right">Views</Text>
            </Flex>
            <BarList
              data={item.data}
              valueFormatter={(number: number) =>
                Intl.NumberFormat('us').format(number).toString()
              }
              className="mt-2"
            />
          </Card>
        ))} */}
      </Grid>
    </main>
  );
}
