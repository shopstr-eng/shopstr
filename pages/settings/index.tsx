import { Listbox, ListboxItem, ListboxSection } from "@nextui-org/react";
import {
  ArrowRightStartOnRectangleIcon,
  BuildingStorefrontIcon,
  Cog6ToothIcon,
  UserIcon,
  UserGroupIcon,
  BanknotesIcon,
} from "@heroicons/react/24/outline";
import { useRouter } from "next/router";
import { LogOut } from "@/utils/nostr/nostr-helper-functions";
import { SettingsBreadCrumbs } from "@/components/settings/settings-bread-crumbs";

const SettingsPage = () => {
  const router = useRouter();
  const listBoxSectionClassnames = {
    heading:
      "text-zinc-500 text-xs font-bold uppercase tracking-wider mb-2 mt-4",
  };
  const listBoxClassnames = {
    title: "text-white font-bold uppercase tracking-wide",
    description: "text-zinc-500 text-xs",
    base: "group rounded-xl border border-zinc-800 bg-[#161616] p-3 mb-3 hover:bg-[#161616] hover:border-zinc-600 transition-all cursor-pointer",
  };
  const startIconClassnames =
    "h-6 w-6 text-zinc-400 group-hover:text-white transition-colors";

  const menuItems = [
    {
      key: "shop-profile",
      description: "Edit your shop profile",
      title: "Shop Profile",
      icon: <BuildingStorefrontIcon className={startIconClassnames} />,
      route: "/settings/shop-profile",
    },
    {
      key: "user-profile",
      description: "Edit your user profile",
      title: "User Profile",
      icon: <UserIcon className={startIconClassnames} />,
      route: "/settings/user-profile",
    },
    {
      key: "community",
      description: "Create and manage your seller community",
      title: "Community Management",
      icon: <UserGroupIcon className={startIconClassnames} />,
      route: "/settings/community",
    },
    {
      key: "preferences",
      description: "Change your mints, relays, media servers, and more",
      title: "Preferences",
      icon: <Cog6ToothIcon className={startIconClassnames} />,
      route: "/settings/preferences",
    },
    {
      key: "wallet",
      description: "Connect your NIP-47 Nostr Wallet",
      title: "Nostr Wallet Connect",
      icon: <BanknotesIcon className={startIconClassnames} />,
      route: "/settings/nwc",
    },
  ];

  return (
    <div className="flex h-full min-h-screen flex-col bg-[#111] pt-24">
      <div className="bg mx-auto h-screen w-full lg:w-1/2 lg:pl-4">
        <SettingsBreadCrumbs />
        <Listbox variant="flat" aria-label="Listbox menu with sections">
          <ListboxSection
            title="Account"
            showDivider
            classNames={listBoxSectionClassnames}
          >
            {menuItems.map((item) => (
              <ListboxItem
                key={item.key}
                description={item.description}
                classNames={listBoxClassnames}
                startContent={item.icon}
                onClick={() => router.push(item.route)}
              >
                {item.title}
              </ListboxItem>
            ))}
          </ListboxSection>
          <ListboxSection title="Log out" classNames={listBoxSectionClassnames}>
            <ListboxItem
              key="delete"
              description="Log out of Shopstr"
              classNames={{
                ...listBoxClassnames,
                base: "group rounded-xl border border-zinc-800 bg-[#161616] p-3 mb-3 hover:bg-[#161616] hover:border-red-500/50 transition-all cursor-pointer",
                title: "text-red-500 font-bold uppercase tracking-wide",
              }}
              startContent={
                <ArrowRightStartOnRectangleIcon className="h-6 w-6 text-red-500" />
              }
              onClick={() => {
                LogOut();
                router.push("/marketplace");
              }}
            >
              Log out
            </ListboxItem>
          </ListboxSection>
        </Listbox>
      </div>
    </div>
  );
};

export default SettingsPage;
