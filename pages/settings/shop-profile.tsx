import { SettingsBreadCrumbs } from "@/components/settings/settings-bread-crumbs";
import ShopProfileForm from "@/components/settings/shop-profile-form";

const ShopProfilePage = () => {
  return (
    <>
      <div className="flex min-h-screen flex-col bg-light-bg pt-24 dark:bg-dark-bg md:pb-20">
        <div className="mx-auto h-full w-full px-4 lg:w-1/2">
          <SettingsBreadCrumbs />
          <ShopProfileForm />
        </div>
      </div>
    </>
  );
};

export default ShopProfilePage;
