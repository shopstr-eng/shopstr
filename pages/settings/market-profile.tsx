import { SettingsBreadCrumbs } from "@/components/settings/settings-bread-crumbs";
import MarketProfileForm from "@/components/settings/market-profile-form";
import StripeConnectBanner from "@/components/stripe-connect/StripeConnectBanner";
import ProtectedRoute from "@/components/utility-components/protected-route";

const ProfilePage = () => {
  return (
    <ProtectedRoute>
      <div className="flex min-h-screen w-full flex-col overflow-x-hidden bg-white pt-24 pb-24 md:pb-32">
        <div className="mx-auto h-full w-full px-4 lg:w-1/2 xl:w-2/5">
          <StripeConnectBanner
            returnPath="/settings/market-profile?stripe=success"
            refreshPath="/settings/market-profile?stripe=refresh"
          />
          <SettingsBreadCrumbs />
          <MarketProfileForm />
        </div>
      </div>
    </ProtectedRoute>
  );
};

export default ProfilePage;
