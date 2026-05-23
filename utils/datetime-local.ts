type DateTimeLocalParts = Pick<
  Date,
  "getFullYear" | "getMonth" | "getDate" | "getHours" | "getMinutes"
>;

const padDateTimePart = (value: number) => value.toString().padStart(2, "0");

export const formatDateTimeLocalValue = (date: DateTimeLocalParts) => {
  const year = date.getFullYear();
  const month = padDateTimePart(date.getMonth() + 1);
  const day = padDateTimePart(date.getDate());
  const hours = padDateTimePart(date.getHours());
  const minutes = padDateTimePart(date.getMinutes());

  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

export const formatUnixTimestampAsDateTimeLocalValue = (unixSeconds: number) =>
  formatDateTimeLocalValue(new Date(unixSeconds * 1000));

export const formatCurrentDateTimeLocalValue = (now = new Date()) =>
  formatDateTimeLocalValue(now);
