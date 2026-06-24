import { SettingsBreadCrumbs } from "@/components/settings/settings-bread-crumbs";
import ShopProfileForm from "@/components/settings/shop-profile-form";
import ProtectedRoute from "@/components/utility-components/protected-route";

const ShopProfilePage = () => {
  return (
    <ProtectedRoute>
      <div className="bg-light-bg dark:bg-dark-bg flex min-h-screen flex-col pt-24 md:pb-20">
        <div className="mx-auto h-full w-full px-4 lg:w-1/2">
          <SettingsBreadCrumbs />
          <ShopProfileForm />
        </div>
      </div>
    </ProtectedRoute>
  );
};

export default ShopProfilePage;
