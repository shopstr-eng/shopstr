// 'use client';

import { formatDataWithEmptyDateTime, ChartData } from '@/utils/metrics';
import { Card, LineChart, Title, Text, DateRangePicker, Flex, Metric, AreaChart } from '@tremor/react';
import { DateTime } from 'luxon';
import { nip19 } from 'nostr-tools';
import { useEffect, useState } from 'react';



export default function UniqueCustomers({ startDate, endDate, interval }:
  { startDate: string, endDate: string, interval: string }) {

  console.log(startDate)
  console.log(endDate)
  const [data, setData] = useState<any[]>([]);
  const [uniqueCustomersCount, setUniqueCustomersCount] = useState<number>(0);

  // const [setTimeRange, setT]
  const [label, setLabel] = useState<string>('');

  const formatDataWithLabel = (lol: ChartData[], label: string) => {
    console.log('te ', label)
    return lol.map((row) => ({
      bucket: row.bucket,
      [label]: row.value,
    }))
  }

  const getIntervalFormat = () => {
    if (interval === 'DAY') {
      return 'LLL dd'
    }
    if (interval === 'WEEK') {
      return 'LLL dd'
    }
    if (interval === 'MONTH') {
      return 'LLL'
    }
    if (interval === 'YEAR') {
      return 'LLL'
    }
  }

  useEffect(() => {
    const { data: merchantId } = nip19.decode(localStorage.getItem("npub"));
    fetch(`/api/metrics/get-uniqueCustomers?startDate=${startDate}&endDate=${endDate}&merchantId=${merchantId}`)
      .then((res) => res.json())
      .then((data) => {
        console.log(JSON.stringify(data))
        const formattedData = formatDataWithEmptyDateTime(data, startDate, endDate)
        console.log(JSON.stringify(formattedData))

        setUniqueCustomersCount(formattedData.reduce((acc, curr) => acc + Number(curr.value), 0))
        const format = getIntervalFormat();
        setLabel(`${DateTime.fromISO(startDate).toFormat(format || '')} - ${DateTime.fromISO(endDate).toFormat(format || '')}`)

        // const formattedDataWithLabel = formatDataWithLabel(formattedData, label);
        // console.log('esfsfsdf', JSON.stringify(formattedDataWithLabel))

        // setData(formattedDataWithLabel)
        setData(formattedData)
      })
  }, [startDate, endDate, interval])

  return (
    <Card>
      <Title>Unique Customers</Title>
      <Flex
        justifyContent="start"
        alignItems="baseline"
        className="space-x-2"
      >
        <Metric>{uniqueCustomersCount} customers</Metric>
      </Flex>
      <Text>Unique Customers Over Time</Text>
      <LineChart
        className="mt-4 h-80"
        data={data}
        categories={['value']}
        index="bucket"
        colors={['indigo', 'fuchsia']}
        valueFormatter={(number: number) =>
          `${number.toString()}`
          // `$ ${Intl.NumberFormat('us').format(number).toString()}`
        }
        yAxisWidth={60}
      />
    </Card>
  );
}
