import { Avatar, avatar } from "@nextui-org/react";
import { useContext } from "react";
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
  const profileMap = useContext(ProfileMapContext);

  const profile = profileMap.has(pubkey) ? profileMap.get(pubkey) : undefined;
  return (
    <>
      <Avatar
        src={
          profile && profile.content.picture
            ? profile.content.picture
            : `https://robohash.idena.io/${pubkey}`
        }
        size="lg"
        className="w-12 h-auto min-w-[40px] min-h-[40px] mr-5"
      />
      <span
        className="w-3/6 truncate hover:text-purple-600 rounded-md cursor-pointer"
        onClick={() => {
          clickNPubkey(npub);
        }}
      >
        {profile && profile.content.name ? profile.content.name : npub}
      </span>
    </>
  );
};
