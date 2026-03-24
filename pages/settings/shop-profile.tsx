import { SettingsBreadCrumbs } from "@/components/settings/settings-bread-crumbs";
import ShopProfileForm from "@/components/settings/shop-profile-form";
import StripeConnectBanner from "@/components/stripe-connect/StripeConnectBanner";

const ShopProfilePage = () => {
  return (
    <div className="flex min-h-screen flex-col bg-white pt-24 md:pb-20">
      <div className="mx-auto h-full w-full px-4 lg:w-1/2 xl:w-2/5">
        <StripeConnectBanner
          returnPath="/settings/shop-profile?stripe=success"
          refreshPath="/settings/shop-profile?stripe=refresh"
        />
        <SettingsBreadCrumbs />
        <ShopProfileForm />
      </div>
    </div>
  );
};

export default ShopProfilePage;
