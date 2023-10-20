import { Avatar, avatar } from "@nextui-org/react";
import { useContext, useEffect, useState } from "react";
import { ProfileMapContext } from "../context";

export const ProfileAvatar = ({
  pubkey,
  npub,
  clickNPubkey,
}: {
  pubkey: string;
  npub: string;
  clickNPubkey: any;
}) => {
  const [pfp, setPfp] = useState("");
  const [displayName, setDisplayName] = useState("");
  const profileContext = useContext(ProfileMapContext);

  useEffect(() => {
    const profileMap = profileContext.profileData;
    const profile = profileMap.has(pubkey) ? profileMap.get(pubkey) : undefined;
    setPfp(
      profile && profile.content.picture
        ? profile.content.picture
        : `https://robohash.idena.io/${pubkey}`,
    );
    setDisplayName(
      profile && profile.content.name ? profile.content.name : npub,
    );
  }, [profileContext]);

  return (
    <>
      <Avatar
        src={pfp}
        size="lg"
        className="w-12 h-auto min-w-[40px] min-h-[40px] mr-5"
      />
      <span
        className="w-3/6 truncate hover:text-purple-600 rounded-md cursor-pointer"
        onClick={() => {
          clickNPubkey(npub);
        }}
      >
        {displayName}
      </span>
    </>
  );
};
