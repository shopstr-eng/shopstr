import { useEffect, useRef } from "react";
import { DisputeData, NostrMessageEvent } from "../../utils/types/types";
import { timeSinceMessageDisplayText } from "../../utils/messages/utils";

interface DisputeButtonProps {
  disputeData: DisputeData;
  openedDisputeId: string;
  handleClickDispute: (disputeId: string) => void;
}

const DisputeButton = ({
  disputeData,
  openedDisputeId,
  handleClickDispute,
}: DisputeButtonProps) => {
  const { disputeId, orderId, status, messages } = disputeData;

  // get most recent message, if any
  const lastMessage: NostrMessageEvent | undefined =
    messages && messages.length > 0
      ? messages[messages.length - 1]
      : undefined;

  const divRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (disputeId === openedDisputeId) {
      divRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [openedDisputeId, disputeId]);

  return (
    <div
      key={disputeId}
      ref={divRef}
      className={`mx-3 mb-2 flex cursor-pointer items-center justify-between gap-4 rounded-md border-2 px-3 py-2 hover:opacity-80 dark:border-dark-fg ${
        disputeId === openedDisputeId
          ? "bg-[#ccccccb9] dark:bg-[#444444b9]"
          : "border-light-fg bg-light-fg dark:border-dark-fg dark:bg-dark-fg"
      }`}
      onClick={() => handleClickDispute(disputeId)}
    >
      <div className="flex flex-col">
        <span className="font-medium text-light-text dark:text-dark-text">
          Order: <code>{orderId}</code>
        </span>
        <span className="text-sm text-gray-600 dark:text-gray-400">
          Status: <span className="capitalize">{status.replace("-", " ")}</span>
        </span>
        {lastMessage && (
          <p className="mt-1 line-clamp-1 text-sm italic text-gray-500 dark:text-gray-300">
            “{lastMessage.content}”
          </p>
        )}
      </div>
      <div className="flex flex-col items-end text-right">
        {lastMessage ? (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {timeSinceMessageDisplayText(lastMessage.created_at).short}
          </span>
        ) : (
          <span className="text-xs text-gray-400">no messages</span>
        )}
      </div>
    </div>
  );
};

export default DisputeButton;
