import React from "react";
import { Breadcrumbs, BreadcrumbItem, Divider } from "@nextui-org/react";
import { useRouter } from "next/router";

const pathMap: { [key: string]: string } = {
  settings: "Settings",
  "user-profile": "User Profile",
  preferences: "Preferences",
  "shop-settings": "Shop Settings",
};

export const SettingsBreadCrumbs = () => {
  const router = useRouter();
  const path = router.pathname.split("/").splice(1);

  return (
    <>
      <Breadcrumbs
        key="foreground"
        color="success"
        classNames={{
          base: "pb-2",
        }}
      >
        {path.map((p, i) => {
          const itemClassName =
            "ml-2 text-light-text dark:text-dark-text text-2xl font-bold" +
            (i !== path.length - 1 ? " opacity-50 hover:opacity-100" : "");
          return (
            <BreadcrumbItem
              key={i}
              onClick={() => {
                router.push(`/${p}`);
              }}
              classNames={{
                item: itemClassName,
                separator:
                  "text-shopstr-purple-light dark:text-shopstr-yellow-light text-2xl",
              }}
            >
              {pathMap[p]}
            </BreadcrumbItem>
          );
        })}
      </Breadcrumbs>
      <Divider className="mb-2" />
    </>
  );
};
