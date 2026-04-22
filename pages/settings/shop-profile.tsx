import { SettingsBreadCrumbs } from "@/components/settings/settings-bread-crumbs";
import ShopProfileForm from "@/components/settings/shop-profile-form";
import StripeConnectBanner from "@/components/stripe-connect/StripeConnectBanner";
import ProtectedRoute from "@/components/utility-components/protected-route";

const ShopProfilePage = () => {
  return (
    <ProtectedRoute>
      <div className="flex min-h-screen w-full flex-col overflow-x-hidden bg-white pt-24 pb-24 md:pb-32">
        <div className="mx-auto h-full w-full px-4 lg:w-1/2 xl:w-[90%] xl:max-w-[1600px]">
          <StripeConnectBanner
            returnPath="/settings/shop-profile?stripe=success"
            refreshPath="/settings/shop-profile?stripe=refresh"
          />
          <SettingsBreadCrumbs />
          <ShopProfileForm />
        </div>
      </div>
    </ProtectedRoute>
  );
};

export default ShopProfilePage;
