import { Avatar } from "@nextui-org/react";
import { useContext, useEffect, useState } from "react";
import { ProfileMapContext } from "../../../pages/context";
import { nip19 } from "nostr-tools";
import { ProfileDisplayName } from "./display-name";

export const ProfileAvatar = ({
  pubkey,
  className,
  includeDisplayName,
  onClickPfp,
  onClickDisplayName,
}: {
  pubkey: string;
  className?: string; // expects a tailwindcss width class
  includeDisplayName?: boolean;
  onClickPfp?: (npub: string) => void;
  onClickDisplayName?: (npub: string) => void;
}) => {
  const [pfp, setPfp] = useState("");
  const profileContext = useContext(ProfileMapContext);
  const npub = pubkey ? nip19.npubEncode(pubkey) : "";
  useEffect(() => {
    const profileMap = profileContext.profileData;
    const profile = profileMap.has(pubkey) ? profileMap.get(pubkey) : undefined;
    setPfp(
      profile && profile.content.picture
        ? profile.content.picture
        : `https://robohash.idena.io/${pubkey}`,
    );
  }, [profileContext, pubkey]);

  const componentWidth = className ? className : " w-full";
  return (
    <div className={"flex h-auto flex-row items-center " + componentWidth}>
      <Avatar
        src={pfp}
        size="lg"
        className={`aspect-square h-auto min-h-[40px] w-12 min-w-[40px] ${
          onClickPfp ? "cursor-pointer hover:opacity-50" : ""
        }`}
        onClick={(e) => {
          // TODO Perhaps have a drop down here with options: Start chat, View profile, View Shop, Copy NPubkey
          if (onClickPfp) {
            onClickPfp(npub);
            e.stopPropagation();
          }
        }}
      />
      {includeDisplayName && (
        <>
          <div className="mr-5 "></div>
          <ProfileDisplayName
            pubkey={pubkey}
            onClickDisplayName={onClickDisplayName}
          />
        </>
      )}
    </div>
  );
};
