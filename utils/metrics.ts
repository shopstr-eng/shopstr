import { range, sortBy } from 'lodash';
import { DateTime, Interval } from 'luxon';

export type ChartData = {
  bucket: string;
  value: number;
}

const DATE_FORMAT = 'yyyy-MM-dd';

const sortByDate = (data: ChartData[]) => {
  return data.sort((a, b) => (DateTime.fromISO(a.bucket).toMillis() - DateTime.fromISO(b.bucket).toMillis()))
};

const createDaysFromRange = (interval: Interval) => {
  if (!interval.start || !interval.end) throw Error('Invalid interval start/end')

  const days: string[] = [];

  for (let i = interval.start; i < interval.end; i = i.plus({ days: 1 })) {
    days.push(i.toFormat(DATE_FORMAT));
  }

  return days;
};

const formatDataWithEmptyHours = (data: ChartData[], interval: Interval) => {
  if (!interval.start || !interval.end) throw Error('Invalid interval start/end')
  const newData: ChartData[] = [...data.map(x => ({ ...x, bucket: DateTime.fromISO(x.bucket).toFormat(DATE_FORMAT) }))];
  const currentDate = interval.start.toFormat(DATE_FORMAT);
  const finalHour = DateTime.now().hour;
  for (let i = 0; i <= finalHour; i++) {
    if (!newData.some((chartData) => DateTime.fromISO(chartData.bucket).hour === i)) {
      const dateTime = DateTime.fromISO(`${currentDate}T${i.toString().padStart(2, '0')}:00:00.000Z`);
      if (dateTime) {
        newData.push({
          bucket: dateTime.toFormat(DATE_FORMAT),
          value: 0,
        });
      }
    }
  }
  return newData;
};

const formatDataWithEmptyDays = (data: ChartData[], interval: Interval) => {
  console.log('hey')
  const newData: ChartData[] = [...data.map(x => ({ ...x, bucket: DateTime.fromISO(x.bucket).toFormat(DATE_FORMAT) }))];
  const dates = createDaysFromRange(interval);
  console.log(dates)
  for (let i = 0; i < dates.length; i++) {
    if (!newData.some((chartData) => chartData.bucket === dates[i])) {
      newData.push({
        bucket: dates[i],
        value: 0,
      });
    }
  }
  console.log(newData)

  return newData;
};

export const formatDataWithEmptyDateTime = (data: ChartData[], startDate: string, endDate: string) => {
  const start = DateTime.fromISO(startDate).toUTC().startOf('day');
  const end = DateTime.fromISO(endDate).toUTC().endOf('day');
  const interval = Interval.fromDateTimes(start, end);

  const totalDays = interval.count('days');

  if (totalDays <= 1) {
    return sortByDate(formatDataWithEmptyHours(data, interval));
  }

  return sortByDate(formatDataWithEmptyDays(data, interval));
}