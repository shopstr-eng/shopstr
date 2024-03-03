import { useState, useEffect } from "react";
import { Listbox, ListboxItem, ListboxSection, cn } from "@nextui-org/react";
import { Cog6ToothIcon, UserIcon } from "@heroicons/react/24/outline";
import { useRouter } from "next/router";
import { SettingsBreadCrumbs } from "@/components/settings/settings-bread-crumbs";

const UserProfilePage = () => {
  const router = useRouter();
  return (
    <div className="flex min-h-screen flex-col bg-light-bg pb-20 pt-4 dark:bg-dark-bg sm:ml-[120px] md:ml-[250px]">
      <div className="bg h-screen w-full px-4 lg:w-1/2">
        <SettingsBreadCrumbs />
      </div>
    </div>
  );
};

export default UserProfilePage;
