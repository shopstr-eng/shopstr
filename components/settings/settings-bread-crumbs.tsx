import { Breadcrumbs, BreadcrumbItem, Divider } from "@heroui/react";
import { useRouter } from "next/router";

const pathMap: { [key: string]: string } = {
  settings: "Settings",
  "user-profile": "User Profile",
  account: "Account Settings & Preferences",
  "shop-profile": "Shop Profile",
  community: "Community Management",
  "api-keys": "API Keys",
  "email-flows": "Email Flows",
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
          base: "pb-2 w-full min-w-0",
          list: "flex-wrap",
        }}
      >
        {path.map((p, i) => {
          const itemClassName =
            "ml-2 text-light-text text-2xl font-bold whitespace-normal break-words" +
            (i !== path.length - 1 ? " opacity-50 hover:opacity-100" : "");
          return (
            <BreadcrumbItem
              key={i}
              onClick={() => {
                router.push(`/${p}`);
              }}
              classNames={{
                base: "min-w-0",
                item: itemClassName,
                separator: "text-dark-bg text-2xl",
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
