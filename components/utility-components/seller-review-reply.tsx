import { useState, useContext } from "react";
import { ReviewsContext, ReviewReply } from "@/utils/context/context";
import {
  SignerContext,
  NostrContext,
} from "@/components/utility-components/nostr-context-provider";
import { publishReviewReply } from "@/utils/nostr/nostr-helper-functions";
import { ProfileWithDropdown } from "@/components/utility-components/profile/profile-dropdown";
import { Button, Textarea } from "@nextui-org/react";

interface SellerReviewReplyProps {
  reviewEventId: string | undefined;
  reviewerPubkey: string;
  merchantPubkey: string;
  compact?: boolean;
}

export default function SellerReviewReply({
  reviewEventId,
  reviewerPubkey,
  merchantPubkey,
  compact = false,
}: SellerReviewReplyProps) {
  const { signer, pubkey: userPubkey } = useContext(SignerContext);
  const { nostr } = useContext(NostrContext);
  const reviewsContext = useContext(ReviewsContext);

  const [replyText, setReplyText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showReplyInput, setShowReplyInput] = useState(false);

  const replies: ReviewReply[] = reviewEventId
    ? reviewsContext.reviewReplies.get(reviewEventId) || []
    : [];

  const isSeller = userPubkey === merchantPubkey;
  const canReply = isSeller && signer && nostr && reviewEventId;

  const handleSubmitReply = async () => {
    if (!replyText.trim() || !canReply) return;

    setIsSubmitting(true);
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
      }

      setReplyText("");
      setShowReplyInput(false);
    } catch (error) {
      console.error("Failed to submit reply:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={compact ? "mt-2" : "mt-3"}>
      {replies.length > 0 && (
        <div
          className={`space-y-2 ${
            compact ? "ml-4" : "ml-6"
          } border-l-2 border-gray-200 pl-3`}
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
                  <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">
                    Seller
                  </span>
                </div>
                <p
                  className={`${compact ? "text-sm" : "text-base"} text-black`}
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
          } mt-1 font-medium text-blue-600 hover:text-blue-800`}
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
              inputWrapper:
                "border-2 border-gray-300 rounded-lg bg-white shadow-none",
            }}
            variant="bordered"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              color="primary"
              isLoading={isSubmitting}
              isDisabled={!replyText.trim()}
              onClick={handleSubmitReply}
              className="rounded-lg border-2 border-black bg-blue-500 font-bold text-white shadow-neo"
            >
              Send Reply
            </Button>
            <Button
              size="sm"
              variant="light"
              onClick={() => {
                setShowReplyInput(false);
                setReplyText("");
              }}
              className="font-bold text-gray-500"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
