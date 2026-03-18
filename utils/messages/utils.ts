import { ChatsMap } from "../context/context";
import { NostrMessageEvent } from "../types/types";

export const timeSinceMessageDisplayText = (
  timeSent: number
): { long: string; short: string; dateTime: string } => {
  // Calculate the time difference in milliseconds
  const timeDifference = new Date().getTime() - timeSent * 1000;
  // Convert milliseconds to minutes
  const minutes = Math.floor(timeDifference / (1000 * 60));

  // Convert minutes to hours, days, or weeks as needed
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);

  const dateTimeText = new Date(timeSent * 1000).toLocaleString();

  // Output the result
  if (weeks > 0) {
    return {
      long: `${weeks} weeks ago`,
      short: `${weeks}w`,
      dateTime: dateTimeText,
    };
  } else if (days > 0) {
    return {
      long: `${days} days ago`,
      short: `${days}d`,
      dateTime: dateTimeText,
    };
  } else if (hours > 0) {
    return {
      long: `${hours} hours ago`,
      short: `${hours}h`,
      dateTime: dateTimeText,
    };
  } else {
    return {
      long: `${minutes} minutes ago`,
      short: `${minutes}m`,
      dateTime: dateTimeText,
    };
  }
};

export const countNumberOfUnreadMessagesFromChatsContext = async (
  chatsMap: ChatsMap
) => {
  let numberOfUnread = 0;
  for (const entry of chatsMap) {
    const chat = entry[1] as NostrMessageEvent[];
    chat.forEach((messageEvent: NostrMessageEvent) => {
      if (messageEvent.read !== true) {
        numberOfUnread++;
      }
    });
  }
  return numberOfUnread;
};

export const constructTags = (
  subject: string,
  productAddress: string,
  additionalData: { [key: string]: any }
) => {
  const tags: string[][] = [
    ["subject", subject],
    ["a", productAddress],
  ];

  for (const [key, value] of Object.entries(additionalData)) {
    if (value !== undefined && value !== null && value !== "") {
      // Handle payment tag specially to ensure it's properly formatted
      if (key === "payment" || key === "paymentProof") {
        tags.push([key, String(value)]);
      } else {
        tags.push([key, String(value)]);
      }
    }
  }

  return tags;
};
