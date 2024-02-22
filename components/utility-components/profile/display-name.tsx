import { ProfileMapContext } from "@/pages/context";
import { nip19 } from "nostr-tools";
import { useContext, useEffect, useState } from "react";

export const ProfileDisplayName = ({
  pubkey,
  onClickDisplayName,
}: {
  pubkey: string;
  onClickDisplayName?: (npub: string) => void;
}) => {
  const [displayName, setDisplayName] = useState("");
  const profileContext = useContext(ProfileMapContext);
  const npub = pubkey ? nip19.npubEncode(pubkey) : "";
  useEffect(() => {
    const profileMap = profileContext.profileData;
    const profile = profileMap.has(pubkey) ? profileMap.get(pubkey) : undefined;
    setDisplayName(
      profile && profile.content.name ? profile.content.name : npub,
    );
  }, [profileContext]);

  return (
    <span
      className={`max-w-[200px] truncate rounded-md font-semibold text-light-text hover:text-purple-600 dark:text-dark-text ${
        onClickDisplayName ? "cursor-pointer hover:opacity-50" : ""
      }`}
      onClick={(e) => {
        if (onClickDisplayName) {
          onClickDisplayName(npub);
          e.stopPropagation();
        }
      }}
    >
      {displayName}
    </span>
  );
};
