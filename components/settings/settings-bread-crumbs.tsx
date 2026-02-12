import React from "react";
import { Breadcrumbs, BreadcrumbItem, Divider } from "@nextui-org/react";
import { useRouter } from "next/router";

const pathMap: { [key: string]: string } = {
  settings: "Settings",
  "user-profile": "User Profile",
  preferences: "Preferences",
  "shop-profile": "Shop Profile",
  community: "Community Management",
  nwc: "Nostr Wallet Connect",
};

export const SettingsBreadCrumbs = () => {
  const router = useRouter();
  const path = router.pathname.split("/").splice(1);

  return (
    <>
      <Breadcrumbs
        key="neobrutalist"
        color="warning"
        classNames={{
          base: "pb-4 flex-wrap",
        }}
      >
        {path.map((p, i) => {
          const itemClassName =
            "ml-1 md:ml-2 text-white text-xl md:text-3xl font-black uppercase tracking-tighter" +
            (i !== path.length - 1
              ? " opacity-40 hover:opacity-100 transition-opacity"
              : "");

          const fullPath = "/" + path.slice(0, i + 1).join("/");

          return (
            <BreadcrumbItem
              key={i}
              onClick={() => router.push(fullPath)}
              classNames={{
                item: itemClassName,
                separator: "text-yellow-400 text-xl md:text-3xl font-black mx-1 md:mx-2",
              }}
            >
              {pathMap[p]}
            </BreadcrumbItem>
          );
        })}
      </Breadcrumbs>
      <Divider className="mb-6 bg-zinc-800 h-[2px]" />
    </>
  );
};
