import { useCallback, useContext, useState } from "react";
import { addToast } from "@heroui/react";
import { FollowsContext } from "@/utils/context/context";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";

type UseFollowToggleOptions = {
  onRequireSignIn?: () => void;
  onSuccess?: () => void;
};

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
      const success = isFollowing
        ? await removeFollow(pubkey)
        : await addFollow(pubkey);

      if (success) {
        addToast({
          title: isFollowing ? "Unfollowed merchant" : "Following",
          color: isFollowing ? "default" : "success",
        });
        onSuccess?.();
      }

      return success;
    } catch (error) {
      console.error("Follow action failed:", error);
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
