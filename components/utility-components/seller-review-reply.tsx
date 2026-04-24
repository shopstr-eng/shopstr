import { useState, useContext } from "react";
import { ReviewsContext, ReviewReply } from "@/utils/context/context";
import {
  SignerContext,
  NostrContext,
} from "@/components/utility-components/nostr-context-provider";
import { publishReviewReply } from "@/utils/nostr/nostr-helper-functions";
import { ProfileWithDropdown } from "@/components/utility-components/profile/profile-dropdown";
import { Button, Textarea } from "@heroui/react";

interface SellerReviewReplyProps {
  reviewEventId: string | undefined;
  reviewerPubkey: string;
  merchantPubkey: string;
  compact?: boolean;
  colorScheme?: {
    text?: string;
    accent?: string;
    secondary?: string;
    background?: string;
  };
}

export default function SellerReviewReply({
  reviewEventId,
  reviewerPubkey,
  merchantPubkey,
  compact = false,
  colorScheme,
}: SellerReviewReplyProps) {
  const { signer, pubkey: userPubkey } = useContext(SignerContext);
  const { nostr } = useContext(NostrContext);
  const reviewsContext = useContext(ReviewsContext);

  const [replyText, setReplyText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showReplyInput, setShowReplyInput] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const replies: ReviewReply[] = reviewEventId
    ? reviewsContext.reviewReplies.get(reviewEventId) || []
    : [];

  const isSeller = userPubkey === merchantPubkey;
  const hasSellerReply = replies.some((r) => r.pubkey === merchantPubkey);
  const canReply =
    isSeller && signer && nostr && reviewEventId && !hasSellerReply;

  const handleSubmitReply = async () => {
    if (!replyText.trim() || !canReply) return;

    setIsSubmitting(true);
    setErrorMessage("");
    try {
      const signedEvent = await publishReviewReply(
        nostr!,
        signer!,
        replyText.trim(),
        reviewEventId!,
        reviewerPubkey
      );

      if (signedEvent) {
        reviewsContext.addReviewReply(reviewEventId!, {
          pubkey: userPubkey!,
          content: replyText.trim(),
          created_at: Math.floor(Date.now() / 1000),
          eventId: signedEvent.id,
        });
        setReplyText("");
        setShowReplyInput(false);
      } else {
        setErrorMessage("Reply could not be published. Please try again.");
      }
    } catch (error) {
      console.error("Failed to submit reply:", error);
      setErrorMessage("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const themed = !!colorScheme;
  const borderColor = themed ? colorScheme.text + "33" : undefined;
  const textColor = themed ? colorScheme.text + "cc" : undefined;
  const accentColor = themed ? colorScheme.accent : undefined;
  const badgeBg = themed ? colorScheme.accent + "22" : undefined;
  const badgeText = themed ? colorScheme.accent : undefined;
  const inputBorderColor = themed ? colorScheme.text + "40" : undefined;
  const inputBg = themed ? colorScheme.background : undefined;

  return (
    <div className={compact ? "mt-2" : "mt-3"}>
      {replies.length > 0 && (
        <div
          className={`space-y-2 ${compact ? "ml-4" : "ml-6"} border-l-2 pl-3`}
          style={themed ? { borderColor } : { borderColor: "#e5e7eb" }}
        >
          {replies
            .sort((a, b) => a.created_at - b.created_at)
            .map((reply) => (
              <div key={reply.eventId} className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <ProfileWithDropdown
                    pubkey={reply.pubkey}
                    dropDownKeys={["shop", "copy_npub"]}
                  />
                  <span
                    className="rounded px-1.5 py-0.5 text-[10px] font-bold"
                    style={
                      themed
                        ? { backgroundColor: badgeBg, color: badgeText }
                        : { backgroundColor: "#dbeafe", color: "#1d4ed8" }
                    }
                  >
                    Vendor
                  </span>
                </div>
                <p
                  className={compact ? "text-sm" : "text-base"}
                  style={themed ? { color: textColor } : { color: "#000000" }}
                >
                  {reply.content}
                </p>
              </div>
            ))}
        </div>
      )}

      {canReply && !showReplyInput && (
        <button
          type="button"
          onClick={() => setShowReplyInput(true)}
          className={`${
            compact ? "ml-4 text-xs" : "ml-6 text-sm"
          } mt-1 font-medium`}
          style={themed ? { color: accentColor } : { color: "#2563eb" }}
        >
          Reply
        </button>
      )}

      {canReply && showReplyInput && (
        <div className={`${compact ? "ml-4" : "ml-6"} mt-2 space-y-2`}>
          <Textarea
            placeholder="Write a reply..."
            minRows={2}
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            classNames={{
              inputWrapper: themed
                ? "border-2 rounded-lg shadow-none"
                : "border-2 border-gray-300 rounded-lg bg-white shadow-none",
            }}
            style={
              themed
                ? {
                    borderColor: inputBorderColor,
                    backgroundColor: inputBg,
                    color: colorScheme.text,
                  }
                : undefined
            }
            variant="bordered"
          />
          {errorMessage && (
            <p className="text-sm font-medium text-red-500">{errorMessage}</p>
          )}
          <div className="flex gap-2">
            <Button
              size="sm"
              color="primary"
              isLoading={isSubmitting}
              isDisabled={!replyText.trim()}
              onClick={handleSubmitReply}
              className={
                themed
                  ? "rounded-lg font-bold text-white"
                  : "shadow-neo rounded-lg border-2 border-black bg-blue-500 font-bold text-white"
              }
              style={themed ? { backgroundColor: accentColor } : undefined}
            >
              Send Reply
            </Button>
            <Button
              size="sm"
              variant="light"
              onClick={() => {
                setShowReplyInput(false);
                setReplyText("");
                setErrorMessage("");
              }}
              className="font-bold"
              style={
                themed
                  ? { color: colorScheme.text + "80" }
                  : { color: "#6b7280" }
              }
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
