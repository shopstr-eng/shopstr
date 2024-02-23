import { range, sortBy } from "lodash";
import { DateTime, Interval } from "luxon";

type Metrics = {
  period: string;
} & {
  [metric: string]: number;
};

const DATE_FORMAT = "yyyy-MM-dd";
const HOUR_FORMAT = "H:00";

const sortByDate = (data: Metrics[]) => {
  return data.sort(
    (a, b) =>
      DateTime.fromISO(a.period).toMillis() -
      DateTime.fromISO(b.period).toMillis(),
  );
};

const createDaysFromRange = (startDate: string, endDate: string) => {
  const days: string[] = [];

  for (
    let i = DateTime.fromISO(startDate);
    i < DateTime.fromISO(endDate);
    i = i.plus({ days: 1 })
  ) {
    days.push(i.toFormat(DATE_FORMAT));
  }

  return days;
};

const formatDataWithEmptyHours = (
  data: Metrics[],
  label: string,
  startDate: string,
) => {
  let newData = data.map((x) => ({ ...x })) as Metrics[];
  const finalHour = DateTime.now().hour;
  for (let i = 0; i <= finalHour; i++) {
    if (!newData.some((d) => DateTime.fromISO(d.period).hour === i)) {
      const dateTime = DateTime.fromISO(startDate).set({
        hour: i,
        minute: 0,
        millisecond: 0,
      });
      newData.push({
        period: dateTime.toISO(),
        [label]: 0,
      } as Metrics);
    }
  }
  newData = sortByDate(newData);
  newData = newData.map((x) => ({
    ...x,
    period: DateTime.fromISO(x.period).toFormat(HOUR_FORMAT),
  })) as Metrics[];
  return newData;
};

const formatDataWithEmptyDays = (
  data: Metrics[],
  label: string,
  startDate: string,
  endDate: string,
) => {
  const newData = [
    ...data.map((x) => ({
      ...x,
      period: DateTime.fromISO(x.period).toFormat(DATE_FORMAT),
    })),
  ] as Metrics[];
  const dates = createDaysFromRange(startDate, endDate);
  for (let i = 0; i < dates.length; i++) {
    if (!newData.some((chartData) => chartData.period === dates[i])) {
      newData.push({
        period: dates[i],
        [label]: 0,
      } as Metrics);
    }
  }

  return sortByDate(newData) as Metrics[];
};

export const formatDataWithEmptyDateTime = (
  data: Metrics[],
  label: string,
  startDate: string,
  endDate: string,
) => {
  const isToday = DateTime.fromISO(endDate).hasSame(
    DateTime.fromISO(startDate),
    "day",
  );

  const start = DateTime.fromISO(startDate).startOf("day").toISO()!;
  const end = DateTime.fromISO(endDate).endOf("day").toISO()!;

  if (isToday) {
    return formatDataWithEmptyHours(data, label, start);
  }

  return formatDataWithEmptyDays(data, label, start, end);
};
