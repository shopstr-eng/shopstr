import {
  Fragment,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";
import type { FC } from "react";
import { Community, CommunityPost, NostrEvent } from "@/utils/types/types";
import {
  NostrContext,
  SignerContext,
} from "../utility-components/nostr-context-provider";
import {
  fetchCommunityPosts,
  fetchPendingPosts,
} from "@/utils/nostr/fetch-service";
import {
  Button,
  Textarea,
  Card,
  CardBody,
  Divider,
  Chip,
} from "@nextui-org/react";
import MilkMarketSpinner from "../utility-components/mm-spinner";
import {
  WHITEBUTTONCLASSNAMES,
  BLACKBUTTONCLASSNAMES,
} from "@/utils/STATIC-VARIABLES";
import {
  createCommunityPost,
  approveCommunityPost,
  retractApproval,
} from "@/utils/nostr/nostr-helper-functions";
import { ProfileWithDropdown } from "../utility-components/profile/profile-dropdown";
import { sanitizeUrl } from "@braintree/sanitize-url";
import FailureModal from "../utility-components/failure-modal";
import SuccessModal from "../utility-components/success-modal";

interface CommunityFeedProps {
  community: Community;
}

const isImage = (url: string) => /\.(jpeg|jpg|gif|png|webp)$/i.test(url);
const isVideo = (url: string) => /\.(mp4|webm|mov)$/i.test(url);
const isYouTube = (url: string) =>
  /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be)\/(?:watch\?v=)?(.+)/i.test(
    url
  );

const RenderContent = ({
  content,
  tags,
}: {
  content: string;
  tags: string[][];
}) => {
  const parts = content.split(/(\s+)/);
  const taggedImages = tags
    .filter((tag) => tag[0] === "image")
    .map((tag) => tag[1]);

  return (
    <div className="space-y-2">
      <p className="whitespace-pre-wrap text-white">
        {parts.map((part, index) => {
          if (isImage(part)) {
            return (
              <img
                key={index}
                src={sanitizeUrl(part)}
                alt="User content"
                className="mt-2 max-h-96 rounded-md border-2 border-black"
              />
            );
          }
          if (isVideo(part)) {
            return (
              <video
                key={index}
                src={sanitizeUrl(part)}
                controls
                className="mt-2 max-h-96 rounded-md border-2 border-black"
              />
            );
          }
          if (isYouTube(part)) {
            const videoId = part.match(
              /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be)\/(?:watch\?v=)?(.+)/i
            )?.[1];
            return (
              <iframe
                key={index}
                className="mt-2 aspect-video w-full rounded-md border-2 border-black"
                src={sanitizeUrl(`https://www.youtube.com/embed/${videoId}`)}
                title="YouTube video player"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              ></iframe>
            );
          }
          return part;
        })}
      </p>
      {taggedImages.length > 0 && (
        <div className="pt-2">
          {taggedImages.map((url, index) => (
            <img
              key={index}
              src={sanitizeUrl(url)}
              alt="Tagged media"
              className="mt-2 max-h-96 rounded-md border-2 border-black"
            />
          ))}
        </div>
      )}
    </div>
  );
};

const CommunityFeed: FC<CommunityFeedProps> = ({ community }) => {
  const { nostr } = useContext(NostrContext);
  const { signer, pubkey } = useContext(SignerContext);
  const [approvedPosts, setApprovedPosts] = useState<CommunityPost[]>([]);
  const [pendingPosts, setPendingPosts] = useState<NostrEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newPostContent, setNewPostContent] = useState("");

  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");

  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showFailureModal, setShowFailureModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [failureMessage, setFailureMessage] = useState("");

  const isModerator = pubkey ? community.moderators.includes(pubkey) : false;

  const loadPosts = useCallback(async () => {
    if (nostr) {
      setIsLoading(true);
      // fetch approved posts (annotated with approval metadata)
      const approved = (await fetchCommunityPosts(
        nostr,
        community,
        50
      )) as CommunityPost[];
      setApprovedPosts(approved);

      if (isModerator) {
        const pending = await fetchPendingPosts(nostr, community, 50);
        setPendingPosts(pending);
      }
      setIsLoading(false);
    }
  }, [community, nostr, isModerator]);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  const handlePost = async () => {
    if (!signer || !nostr || !newPostContent.trim()) return;
    try {
      const newPost = await createCommunityPost(
        signer,
        nostr,
        community,
        newPostContent
      );
      setNewPostContent("");
      // Optimistically add the new post to the pending list FIRST
      if (newPost) {
        setPendingPosts((prevPending) => [newPost, ...prevPending]);
      }
      setSuccessMessage(
        "Your post has been submitted for approval. It will appear once a moderator approves it."
      );
      setShowSuccessModal(true);
    } catch (error) {
      console.error("Failed to create post", error);
      setFailureMessage("Failed to create post.");
      setShowFailureModal(true);
    }
  };

  const handleReply = async (parentPost: NostrEvent) => {
    if (!signer || !nostr || !replyContent.trim()) return;
    try {
      const newReply = await createCommunityPost(
        signer,
        nostr,
        community,
        replyContent,
        { parentEvent: parentPost }
      );
      setReplyContent("");
      setReplyingTo(null);
      // Optimistically add the new reply to the pending list FIRST
      if (newReply) {
        setPendingPosts((prevPending) => [newReply, ...prevPending]);
      }
      setSuccessMessage(
        "Your reply has been submitted for approval. It will appear once a moderator approves it."
      );
      setShowSuccessModal(true);
    } catch (error) {
      console.error("Failed to submit reply", error);
      setFailureMessage("Failed to submit reply.");
      setShowFailureModal(true);
    }
  };

  const handleApprove = async (postToApprove: NostrEvent) => {
    if (!signer || !nostr) return;
    try {
      const signedApproval = await approveCommunityPost(
        signer,
        nostr,
        postToApprove,
        community
      );
      // optimistic: remove from pending, add to approved with approval metadata
      setPendingPosts((prev) => prev.filter((p) => p.id !== postToApprove.id));
      const ap: CommunityPost = {
        ...(postToApprove as CommunityPost),
        approved: true,
        approvalEventId: signedApproval?.id,
        approvedBy: signedApproval?.pubkey,
      };
      setApprovedPosts((prev) =>
        [ap, ...prev].sort((a, b) => b.created_at - a.created_at)
      );
    } catch (error) {
      console.error("Failed to approve post", error);
      setFailureMessage("Failed to approve post.");
      setShowFailureModal(true);
    }
  };

  const handleRetractApproval = async (approvalEventId?: string) => {
    if (!signer || !nostr || !approvalEventId) return;
    try {
      await retractApproval(
        signer,
        nostr,
        approvalEventId,
        "Retracted by moderator"
      );
      // optimistic: move that post from approved back to pending
      setApprovedPosts((prev) =>
        prev.filter((p) => p.approvalEventId !== approvalEventId)
      );
      // reload pending posts shortly
      const pending = await fetchPendingPosts(nostr, community, 50);
      setPendingPosts(pending);
    } catch (error) {
      console.error("Failed to retract approval", error);
      setFailureMessage("Failed to retract approval.");
      setShowFailureModal(true);
    }
  };

  // For display, combine pending and approved posts (approved have metadata)
  const { topLevelPosts, repliesByParentId } = useMemo(() => {
    const approvedIds = new Set(approvedPosts.map((p) => p.id));
    const allPosts = [
      ...approvedPosts,
      ...pendingPosts.filter((p) => !approvedIds.has(p.id)),
    ].sort((a, b) => b.created_at - a.created_at);

    const topLevelPosts: CommunityPost[] = [];
    const repliesByParentId = new Map<string, CommunityPost[]>();

    for (const post of allPosts) {
      const parentId = post.tags.find((tag) => tag[0] === "e")?.[1];

      if (parentId) {
        if (!repliesByParentId.has(parentId)) {
          repliesByParentId.set(parentId, []);
        }
        repliesByParentId.get(parentId)!.push(post);
      } else {
        // It's a top-level post
        topLevelPosts.push(post);
      }
    }

    for (const replies of repliesByParentId.values()) {
      replies.reverse();
    }

    return { topLevelPosts, repliesByParentId };
  }, [approvedPosts, pendingPosts]);

  return (
    <div className="space-y-6">
      {isModerator && (
        <Card className="rounded-lg border-4 border-black bg-white shadow-neo">
          <CardBody className="p-6">
            <h3 className="mb-4 text-lg font-bold text-black">
              Create an Announcement
            </h3>
            <Textarea
              value={newPostContent}
              onChange={(e) => setNewPostContent(e.target.value)}
              placeholder="What's on your mind?"
              minRows={3}
              classNames={{
                input: "text-black",
                inputWrapper:
                  "border-2 border-black shadow-none bg-white rounded-md",
              }}
            />
            <Button
              onClick={handlePost}
              className={`${BLACKBUTTONCLASSNAMES} mt-4 self-end`}
              disabled={!newPostContent.trim()}
            >
              Post
            </Button>
          </CardBody>
        </Card>
      )}

      {isLoading ? (
        <div className="flex justify-center py-8">
          <MilkMarketSpinner label="Loading posts..." />
        </div>
      ) : (
        <div className="space-y-6">
          {topLevelPosts.map((post: CommunityPost) => (
            <Fragment key={post.id}>
              <Card className="rounded-lg border-4 border-black bg-primary-blue shadow-neo">
                <CardBody className="p-6">
                  <div className="mb-4 flex items-center justify-between">
                    <ProfileWithDropdown
                      pubkey={post.pubkey}
                      baseClassname="justify-start hover:bg-black/10 pl-4 rounded-lg py-2 hover:scale-105 transition-transform"
                      dropDownKeys={["shop_profile", "copy_npub"]}
                      nameClassname="md:block text-white"
                      bg="dark"
                    />
                    {isModerator && !post.approved && (
                      <Chip
                        className="border-2 border-black bg-primary-yellow font-bold text-black"
                        variant="flat"
                      >
                        Pending Approval
                      </Chip>
                    )}
                  </div>
                  <div className="mb-4">
                    <RenderContent content={post.content} tags={post.tags} />
                  </div>
                  <Divider className="my-4 bg-white/30" />
                  <div className="flex items-center justify-end gap-3">
                    {isModerator && !post.approved && (
                      <Button
                        size="sm"
                        onClick={() => handleApprove(post)}
                        className="border-2 border-black bg-primary-yellow font-bold text-black shadow-neo hover:-translate-y-0.5"
                      >
                        Approve
                      </Button>
                    )}
                    {isModerator &&
                      post.approved &&
                      post.approvalEventId &&
                      post.approvedBy === pubkey && (
                        <Button
                          size="sm"
                          onClick={() =>
                            handleRetractApproval(post.approvalEventId)
                          }
                          className="border-2 border-black bg-red-500 font-bold text-white shadow-neo hover:-translate-y-0.5"
                        >
                          Retract Approval
                        </Button>
                      )}
                    <Button
                      size="sm"
                      onClick={() =>
                        setReplyingTo(replyingTo === post.id ? null : post.id)
                      }
                      className={`${WHITEBUTTONCLASSNAMES}`}
                    >
                      {replyingTo === post.id ? "Cancel" : "Reply"}
                    </Button>
                  </div>
                  {replyingTo === post.id && (
                    <div className="mt-4 rounded-md border-2 border-white bg-white p-4">
                      <Textarea
                        value={replyContent}
                        onChange={(e) => setReplyContent(e.target.value)}
                        placeholder={`Replying to ${post.pubkey.slice(
                          0,
                          8
                        )}...`}
                        minRows={2}
                        classNames={{
                          input: "text-black",
                          inputWrapper:
                            "border-2 border-black shadow-none bg-white rounded-md",
                        }}
                      />
                      <Button
                        onClick={() => handleReply(post)}
                        className={`${BLACKBUTTONCLASSNAMES} mt-2 self-end`}
                        disabled={!replyContent.trim()}
                        size="sm"
                      >
                        Submit Reply
                      </Button>
                    </div>
                  )}
                </CardBody>
              </Card>

              {/* Render Replies */}
              {repliesByParentId.has(post.id) && (
                <div className="ml-8 space-y-4 border-l-4 border-black pl-6">
                  {repliesByParentId
                    .get(post.id)!
                    .map((reply: CommunityPost) => (
                      <Card
                        key={reply.id}
                        className="rounded-lg border-4 border-black bg-primary-blue shadow-neo"
                      >
                        <CardBody className="p-6">
                          <div className="mb-4 flex items-center justify-between">
                            <ProfileWithDropdown
                              pubkey={reply.pubkey}
                              baseClassname="justify-start hover:bg-black/10 pl-4 rounded-lg py-2 hover:scale-105 transition-transform"
                              dropDownKeys={["shop_profile", "copy_npub"]}
                              nameClassname="md:block text-white"
                              bg="dark"
                            />
                            {isModerator && !reply.approved && (
                              <Chip
                                className="border-2 border-black bg-primary-yellow font-bold text-black"
                                variant="flat"
                              >
                                Pending Approval
                              </Chip>
                            )}
                          </div>
                          <div className="mb-4">
                            <RenderContent
                              content={reply.content}
                              tags={reply.tags}
                            />
                          </div>
                          <Divider className="my-4 bg-white/30" />
                          <div className="flex items-center justify-end gap-3">
                            {isModerator && !reply.approved && (
                              <Button
                                size="sm"
                                onClick={() => handleApprove(reply)}
                                className="border-2 border-black bg-primary-yellow font-bold text-black shadow-neo hover:-translate-y-0.5"
                              >
                                Approve
                              </Button>
                            )}
                            <Button
                              size="sm"
                              onClick={() =>
                                setReplyingTo(
                                  replyingTo === reply.id ? null : reply.id
                                )
                              }
                              className={`${WHITEBUTTONCLASSNAMES}`}
                            >
                              {replyingTo === reply.id ? "Cancel" : "Reply"}
                            </Button>
                          </div>
                          {replyingTo === reply.id && (
                            <div className="mt-4 rounded-md border-2 border-white bg-white p-4">
                              <Textarea
                                value={replyContent}
                                onChange={(e) =>
                                  setReplyContent(e.target.value)
                                }
                                placeholder={`Replying to ${reply.pubkey.slice(
                                  0,
                                  8
                                )}...`}
                                minRows={2}
                                classNames={{
                                  input: "text-black",
                                  inputWrapper:
                                    "border-2 border-black shadow-none bg-white rounded-md",
                                }}
                              />
                              <Button
                                onClick={() => handleReply(reply)}
                                className={`${BLACKBUTTONCLASSNAMES} mt-2 self-end`}
                                disabled={!replyContent.trim()}
                                size="sm"
                              >
                                Submit Reply
                              </Button>
                            </div>
                          )}
                        </CardBody>
                      </Card>
                    ))}
                </div>
              )}
            </Fragment>
          ))}
        </div>
      )}
      {!isLoading && topLevelPosts.length === 0 && (
        <div className="mt-10 text-center text-black">
          <p>No announcements yet. Check back soon!</p>
        </div>
      )}

      <SuccessModal
        bodyText={successMessage}
        isOpen={showSuccessModal}
        onClose={() => {
          setShowSuccessModal(false);
          setSuccessMessage("");
        }}
      />

      <FailureModal
        bodyText={failureMessage}
        isOpen={showFailureModal}
        onClose={() => {
          setShowFailureModal(false);
          setFailureMessage("");
        }}
      />
    </div>
  );
};

export default CommunityFeed;
