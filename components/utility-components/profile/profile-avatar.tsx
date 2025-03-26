import { ProfileMapContext } from "@/utils/context/context";
import { User } from "@nextui-org/react";
import { nip19 } from "nostr-tools";
import { useContext, useEffect, useState } from "react";

export const ProfileAvatar = ({
  pubkey,
  description,
  baseClassname,
  descriptionClassname,
  wrapperClassname,
}: {
  pubkey: string;
  description?: string;
  descriptionClassname?: string;
  baseClassname?: string;
  wrapperClassname?: string;
}) => {
  const [pfp, setPfp] = useState("");
  const [displayName, setDisplayName] = useState("");
  const profileContext = useContext(ProfileMapContext);
  const npub = pubkey ? nip19.npubEncode(pubkey) : "";
  useEffect(() => {
    const profileMap = profileContext.profileData;
    const profile = profileMap.has(pubkey) ? profileMap.get(pubkey) : undefined;
    setDisplayName(() => {
      let displayName =
        profile && profile.content.name ? profile.content.name : npub;
      displayName =
        displayName.length > 20
          ? displayName.slice(0, 20) + "..."
          : displayName;
      return displayName;
    });

    setPfp(
      profile && profile.content.picture
        ? profile.content.picture
        : `https://robohash.org/${pubkey}`
    );
  }, [profileContext, pubkey, npub]);

  return (
    <User
      avatarProps={{
        src: pfp,
      }}
      className={"transition-transform"}
      classNames={{
        name: "overflow-hidden text-ellipsis whitespace-nowrap text-light-text dark:text-dark-text hidden block",
        base: `${baseClassname}`,
        description: `${descriptionClassname}`,
        wrapper: `${wrapperClassname}`,
      }}
      name={displayName}
      description={description}
    />
  );
};
