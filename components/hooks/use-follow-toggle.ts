import { useCallback, useContext, useState } from "react";
import { addToast } from "@heroui/react";
import { FollowsContext } from "@/utils/context/context";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import type { FollowMutationResult } from "@/utils/nostr/nostr-helper-functions";

type UseFollowToggleOptions = {
  onRequireSignIn?: () => void;
  onSuccess?: () => void;
};

function showFollowFailureToast(result: FollowMutationResult) {
  if (result.ok) return;

  addToast({
    title:
      result.reason === "unverified-contact-list"
        ? "Could not verify your follow list — please try again."
        : "Follow action failed. Please try again.",
    color: "danger",
  });
}

export function useFollowToggle(
  pubkey: string,
  { onRequireSignIn, onSuccess }: UseFollowToggleOptions = {}
) {
  const followsContext = useContext(FollowsContext);
  const { addFollow, removeFollow } = followsContext;
  const { isLoggedIn } = useContext(SignerContext);
  const [isLoading, setIsLoading] = useState(false);
  const isFollowing = followsContext.directFollowList.includes(pubkey);

  const toggle = useCallback(async (): Promise<boolean> => {
    if (!pubkey) return false;

    if (!isLoggedIn) {
      onRequireSignIn?.();
      return false;
    }

    setIsLoading(true);
    try {
      const result = isFollowing
        ? await removeFollow(pubkey)
        : await addFollow(pubkey);

      if (!result.ok) {
        showFollowFailureToast(result);
        return false;
      }

      addToast({
        title: isFollowing ? "Unfollowed merchant" : "Following",
        color: isFollowing ? "default" : "success",
      });
      onSuccess?.();

      return true;
    } catch (error) {
      console.error("Follow action failed:", error);
      addToast({
        title: "Follow action failed. Please try again.",
        color: "danger",
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [
    addFollow,
    removeFollow,
    isFollowing,
    isLoggedIn,
    onRequireSignIn,
    onSuccess,
    pubkey,
  ]);

  return {
    isFollowing,
    isLoading,
    toggle,
  };
}
