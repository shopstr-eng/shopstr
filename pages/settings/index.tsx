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
    heading: "text-light-text dark:text-dark-text text-lg font-bold",
  };
  const listBoxClassnames = {
    title: "text-light-text dark:text-dark-text",
    base: "bg-light-fg hover:bg-light-bg hover:opacity-50 dark:bg-dark-fg my-2",
  };
  const startIconClassnames = "h-6 w-6 text-light-text dark:text-dark-text";
  return (
    <div className="flex h-full flex-col bg-light-bg pt-24 dark:bg-dark-bg">
      <div className="bg mx-auto h-screen w-full lg:w-1/2 lg:pl-4">
        <SettingsBreadCrumbs />
        <Listbox variant="flat" aria-label="Listbox menu with sections">
          <ListboxSection
            title="Account"
            showDivider
            classNames={listBoxSectionClassnames}
          >
            <ListboxItem
              key="shop-profile"
              description="Edit your shop profile"
              classNames={listBoxClassnames}
              startContent={
                <BuildingStorefrontIcon className={startIconClassnames} />
              }
              onClick={() => {
                router.push("/settings/shop-profile");
              }}
            >
              Shop Profile
            </ListboxItem>
            <ListboxItem
              key="user-profile"
              description="Edit your user profile"
              classNames={listBoxClassnames}
              startContent={<UserIcon className={startIconClassnames} />}
              onClick={() => {
                router.push("/settings/user-profile");
              }}
            >
              User Profile
            </ListboxItem>
            <ListboxItem
              key="community"
              description="Create and manage your seller community"
              classNames={listBoxClassnames}
              startContent={<UserGroupIcon className={startIconClassnames} />}
              onClick={() => {
                router.push("/settings/community");
              }}
            >
              Community Management
            </ListboxItem>
            <ListboxItem
              key="preferences"
              description="Change your mints, relays, media servers, and more"
              classNames={listBoxClassnames}
              startContent={<Cog6ToothIcon className={startIconClassnames} />}
              onClick={() => {
                router.push("/settings/preferences");
              }}
            >
              Preferences
            </ListboxItem>
            <ListboxItem
              key="wallet"
              description="Connect your Nostr Wallet (NIP-47)"
              classNames={listBoxClassnames}
              startContent={<BanknotesIcon className={startIconClassnames} />}
              onClick={() => {
                router.push("/settings/wallet");
              }}
            >
              Wallet Connection
            </ListboxItem>
          </ListboxSection>
          <ListboxSection title="Log out" classNames={listBoxSectionClassnames}>
            <ListboxItem
              key="delete"
              className="text-danger"
              color="danger"
              description="Log out of Shopstr"
              classNames={listBoxClassnames}
              startContent={
                <ArrowRightStartOnRectangleIcon
                  className={"text-color-red-900 " + "h-5 w-5"}
                  color="red"
                />
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
