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
  const [isNip05Verified, setIsNip05Verified] = useState(false);
  const profileContext = useContext(ProfileMapContext);
  const npub = pubkey ? nip19.npubEncode(pubkey) : "";
  useEffect(() => {
    const profileMap = profileContext.profileData;
    const profile = profileMap.has(pubkey) ? profileMap.get(pubkey) : undefined;
    setDisplayName(() => {
      let name = profile && profile.content.name ? profile.content.name : npub;
      if (profile?.content?.nip05 && profile.nip05Verified) {
        name = profile.content.nip05;
      }
      name = name.length > 20 ? name.slice(0, 20) + "..." : name;
      return name;
    });

    setPfp(
      profile && profile.content.picture
        ? profile.content.picture
        : `https://robohash.org/${pubkey}`
    );
    setIsNip05Verified(profile?.nip05Verified || false);
  }, [profileContext, pubkey, npub]);

  return (
    <User
      avatarProps={{
        src: pfp,
      }}
      className={"transition-transform"}
      classNames={{
        name: `overflow-hidden text-ellipsis whitespace-nowrap text-light-text dark:text-dark-text hidden block ${
          isNip05Verified ? "text-shopstr-purple dark:text-shopstr-yellow" : ""
        }`,
        base: `${baseClassname}`,
        description: `${descriptionClassname}`,
        wrapper: `${wrapperClassname}`,
      }}
      name={displayName}
      description={description}
    />
  );
};
