import { SettingsBreadCrumbs } from "@/components/settings/settings-bread-crumbs";
import UserProfileForm from "@/components/settings/user-profile-form";
import StripeConnectBanner from "@/components/stripe-connect/StripeConnectBanner";
import ProtectedRoute from "@/components/utility-components/protected-route";

const ProfilePage = () => {
  return (
    <ProtectedRoute>
      <div className="flex min-h-screen w-full flex-col overflow-x-hidden bg-white pt-24 pb-24 md:pb-32">
        <div className="mx-auto h-full w-full px-4 lg:w-1/2 xl:w-2/5">
          <StripeConnectBanner
            returnPath="/settings/profile?stripe=success"
            refreshPath="/settings/profile?stripe=refresh"
          />
          <SettingsBreadCrumbs />
          <UserProfileForm />
        </div>
      </div>
    </ProtectedRoute>
  );
};

export default ProfilePage;
