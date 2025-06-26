import { Listbox, ListboxItem, ListboxSection } from "@nextui-org/react";
import {
  ArrowRightStartOnRectangleIcon,
  BuildingStorefrontIcon,
  Cog6ToothIcon,
  UserIcon,
} from "@heroicons/react/24/outline";
import { useRouter } from "next/router";
import { LogOut } from "@/utils/nostr/nostr-helper-functions";
import { SettingsBreadCrumbs } from "@/components/settings/settings-bread-crumbs";

const SettingsPage = () => {
  const router = useRouter();
  const listBoxSectionClassnames = {
    heading: "text-light-text text-lg font-bold",
  };
  const listBoxClassnames = {
    title: "text-dark-text hover:text-light-text",
    base: "hover:bg-light-bg hover:opacity-50 bg-dark-fg my-2",
  };
  const startIconClassnames = "h-6 w-6 text-dark-text hover:text-light-text";
  return (
    <div className="flex h-full flex-col bg-light-bg pt-24">
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
          </ListboxSection>
          <ListboxSection title="Log out" classNames={listBoxSectionClassnames}>
            <ListboxItem
              key="delete"
              className="text-danger"
              color="danger"
              description="Log out of Milk Market"
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
