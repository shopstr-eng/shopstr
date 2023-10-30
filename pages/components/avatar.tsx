import { Avatar } from "@nextui-org/react";
import { useContext, useEffect, useState } from "react";
import { ProfileMapContext } from "../context";
import { useRouter } from "next/router";
import { nip19 } from "nostr-tools";

export const ProfileAvatar = ({
  pubkey,
  className,
}: {
  pubkey: string;
  className?: string; // expects a tailwindcss width class
}) => {
  const router = useRouter();
  const [pfp, setPfp] = useState("");
  const [displayName, setDisplayName] = useState("");
  const profileContext = useContext(ProfileMapContext);
  const npub = pubkey ? nip19.npubEncode(pubkey) : "";
  const routeToShop = (npubkey: string) => {
    router.push(npubkey);
  };
  useEffect(() => {
    const profileMap = profileContext.profileData;
    const profile = profileMap.has(pubkey) ? profileMap.get(pubkey) : undefined;
    setPfp(
      profile && profile.content.picture
        ? profile.content.picture
        : `https://robohash.idena.io/${pubkey}`
    );
    setDisplayName(
      profile && profile.content.name ? profile.content.name : npub
    );
  }, [profileContext]);

  const componentWidth = className ? className : " w-fit ";
  return (
    <div className={"flex flex-row items-center " + componentWidth}>
      <Avatar
        src={pfp}
        size="lg"
        className="w-12 h-auto min-w-[40px] min-h-[40px] mr-5"
        onClick={(e) => {
          // TODO Perhaps have a drop down here with options: Start chat, View profile, View Shop, Copy NPubkey
          routeToShop(npub);
          e.stopPropagation();
        }}
      />
      <span
        className="truncate hover:text-purple-600 rounded-md cursor-pointer"
        onClick={(e) => {
          routeToShop(npub);
          e.stopPropagation();
        }}
      >
        {displayName}
      </span>
    </div>
  );
};
