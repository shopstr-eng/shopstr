'use client';

import { Card, Metric, Text, Title, BarList, Flex, Grid, DateRangePicker, DateRangePickerValue, LineChart, DateRangePickerItem } from '@tremor/react';
import { formatDataWithEmptyDateTime } from '@/utils/metrics';
import { DateTime } from 'luxon';
import { useState, useEffect } from 'react';
import { nip19 } from 'nostr-tools';

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

export default function MetricsPage() {

  const [date, setDate] = useState<DateRangePickerValue>({
    from: DateTime.now().minus({ days: 7 }).toJSDate(),
    to: DateTime.now().toJSDate(),
  });
  const [data, setData] = useState<Data[]>([]);

  useEffect(() => {
    const { data: merchantId } = nip19.decode(localStorage.getItem("npub"));

    const startDate = DateTime.fromJSDate(date.from!).toISO();
    const endDate = DateTime.fromJSDate(date.to!).toISO();

    if (!startDate || !endDate || !merchantId) return;

    fetch(`/api/metrics/get-metrics?startDate=${startDate}&endDate=${endDate}&merchantId=${merchantId}`)
      .then((res) => res.json())
      .then((data: Data[]) => {
        console.log(JSON.stringify(data))

        const formattedData = data.map(data => {
          const formattedMetrics =
            formatDataWithEmptyDateTime(data.category.metrics, data.label, startDate, endDate) || [];
          console.log('hhhh ', formattedMetrics);
          return {
            label: data.label,
            category: {
              ...data.category,
              metrics: formattedMetrics,
            }
          }
        })

        setData(formattedData);
      })
  }, [date])

  const wut = (a) => {
    console.log(a)
  }

  return (
    <main className="p-4 md:p-10 mx-auto max-w-7xl">
      <DateRangePicker
      className='my-5'
        value={date}
        onValueChange={setDate}
        color="rose"
      >
        <DateRangePickerItem
          key="today"
          value="today"
          from={DateTime.now().startOf('day').toJSDate()}
          to={DateTime.now().toJSDate()}>
          Today
        </DateRangePickerItem>
        <DateRangePickerItem
          key="sevenDats"
          value="sevenDats"
          from={DateTime.now().minus({ days: 7 }).toJSDate()}
          to={DateTime.now().toJSDate()}>
          Last 7 Days
        </DateRangePickerItem>
        <DateRangePickerItem
          key="thirtyDats"
          value="thirtyDats"
          from={DateTime.now().minus({ days: 30 }).toJSDate()}
          to={DateTime.now().toJSDate()}>
          Last 30 Days
        </DateRangePickerItem>
        <DateRangePickerItem
          key="mtd"
          value="ytd"
          from={DateTime.now().startOf('month').toJSDate()}
          to={DateTime.now().toJSDate()}>
          Month to Date
        </DateRangePickerItem>
        <DateRangePickerItem
          key="ytd"
          value="ytd"
          from={DateTime.now().startOf('year').toJSDate()}
          to={DateTime.now().toJSDate()}>
          Year to Date
        </DateRangePickerItem>
      </DateRangePicker>
      <Grid numItemsSm={2} numItemsLg={3} className="gap-6">
        {data.map((item) => (
          <Card key={item.category.title}>
            <Title>{item.category.title}</Title>
            <Flex
              justifyContent="start"
              alignItems="baseline"
              className="space-x-2"
            >
              <Metric>{item.category.total} {item.category.symbol}</Metric>
            </Flex>
            <Text>{item.category.subtitle}</Text>
            <LineChart
              className="mt-4 h-80"
              data={item.category.metrics}
              categories={[item.label]}
              index='period'
              colors={['indigo', 'fuchsia']}
              valueFormatter={(number: number) =>
                `${number.toString()} ${item.category.symbol}`
                // `$ ${Intl.NumberFormat('us').format(number).toString()}`
              }
              yAxisWidth={60}
            />
          </Card>
        ))}
      </Grid>
    </main>
  );
}