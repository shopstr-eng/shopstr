import { Listbox, ListboxItem, ListboxSection, cn } from "@nextui-org/react";
import {
  ArrowRightOnRectangleIcon,
  Cog6ToothIcon,
  UserIcon,
} from "@heroicons/react/24/outline";
import { useRouter } from "next/router";
import { LogOut } from "@/components/utility/nostr-helper-functions";
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
    <div className="ml-2 mr-2 flex h-full flex-col bg-light-bg pt-4 dark:bg-dark-bg sm:ml-[130px] md:ml-[250px]">
      <div className="bg h-screen w-full lg:w-1/2 lg:pl-4">
        <SettingsBreadCrumbs />
        <Listbox variant="flat" aria-label="Listbox menu with sections">
          <ListboxSection
            title="Account"
            showDivider
            classNames={listBoxSectionClassnames}
          >
            <ListboxItem
              key="user-profile"
              description="Edit your Nostr Profile"
              classNames={listBoxClassnames}
              startContent={<UserIcon className={startIconClassnames} />}
              onClick={() => {
                router.push("/settings/user-profile");
              }}
            >
              Nostr Profile
            </ListboxItem>
            <ListboxItem
              key="preferences"
              description="Change your relays, mints, and theme"
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
              description="Log out of Shopstr"
              classNames={listBoxClassnames}
              startContent={
                <ArrowRightOnRectangleIcon
                  className={"text-color-red-900 " + "h-5 w-5"}
                  color="red"
                />
              }
              onClick={() => {
                LogOut();

                router.push("/");
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
